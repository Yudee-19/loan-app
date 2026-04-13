/**
 * stores/authStore.ts
 *
 * Zustand store for authentication state.
 *
 * Responsibilities:
 * - Sign up / sign in / sign out via Supabase Auth.
 * - Listen for auth-state changes (token refresh, logout from another tab).
 * - Manage the optional 4-digit PIN lock:
 *   • PIN hash is stored server-side in `user_settings.pin_hash`.
 *   • Verification is done client-side with bcryptjs (compare entered PIN to hash).
 * - Expose a single `initialize()` method the root layout calls on mount.
 */

import { create } from "zustand";
import { supabase } from "@/lib/supabase";
import type { Session, User } from "@supabase/supabase-js";
import type { UserSettings } from "@/types";
import bcrypt from "bcryptjs";
import * as Crypto from "expo-crypto";
import { PIN_LENGTH } from "@/lib/constants";

// ─── Crypto Fallback ─────────────────────────────────────────────────────────
// React Native doesn't expose WebCrypto or Node's crypto module.
// bcryptjs needs a source of random bytes for salt generation, so we
// wire up expo-crypto's getRandomBytes as the fallback.
bcrypt.setRandomFallback((len: number) =>
  Array.from(Crypto.getRandomBytes(len))
);

// ─── State Shape ─────────────────────────────────────────────────────────────

interface AuthState {
    /** Current Supabase user object (null when logged out). */
    user: User | null;
    /** Current Supabase session (contains JWT). */
    session: Session | null;
    /** User-specific settings (PIN, notification prefs). */
    settings: UserSettings | null;
    /** True while the store is performing its initial auth check. */
    loading: boolean;
    /** True when the PIN lock screen should be shown. */
    pinRequired: boolean;

    // ── Actions ──────────────────────────────────────────────────────────────

    /** Bootstrap: check existing session + listen for auth changes. */
    initialize: () => Promise<void>;
    /** Sign in with email and password. */
    signIn: (email: string, password: string) => Promise<void>;
    /** Create a new account with email and password. */
    signUp: (email: string, password: string) => Promise<void>;
    /** Sign out and clear local state. */
    signOut: () => Promise<void>;
    /** Set (or update) the 4-digit PIN. Pass `null` to remove the PIN. */
    setPin: (pin: string | null) => Promise<void>;
    /** Verify the entered PIN against the stored hash. */
    verifyPin: (pin: string) => boolean;
    /** Fetch user settings from Supabase. */
    fetchSettings: () => Promise<void>;
    /** Update notification preferences. */
    updateNotificationSettings: (
        enabled: boolean,
        reminderDays: number,
    ) => Promise<void>;
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthState>()((set, get) => ({
    user: null,
    session: null,
    settings: null,
    loading: true,
    pinRequired: false,

    // ── Initialize ───────────────────────────────────────────────────────────

    initialize: async () => {
        try {
            // 1. Restore persisted session from SecureStore
            const {
                data: { session },
            } = await supabase.auth.getSession();

            if (session) {
                set({ user: session.user, session });

                // 2. Fetch user settings to check if PIN is configured
                await get().fetchSettings();

                const { settings } = get();
                // If a PIN hash exists, lock the app until the user enters it
                if (settings?.pin_hash) {
                    set({ pinRequired: true });
                }
            }
        } finally {
            set({ loading: false });
        }

        // 3. Listen for future auth state changes (token refresh, sign out, etc.)
        supabase.auth.onAuthStateChange((_event, session) => {
            set({
                user: session?.user ?? null,
                session,
            });
        });
    },

    // ── Sign In ──────────────────────────────────────────────────────────────

    signIn: async (email, password) => {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });
        if (error) throw error;

        set({ user: data.user, session: data.session });

        // After login, check for PIN requirement
        await get().fetchSettings();
        const { settings } = get();
        if (settings?.pin_hash) {
            set({ pinRequired: true });
        }
    },

    // ── Sign Up ──────────────────────────────────────────────────────────────

    signUp: async (email, password) => {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;

        set({ user: data.user, session: data.session });

        // Create default user_settings row for the new user
        if (data.user) {
            await supabase.from("user_settings").insert({
                user_id: data.user.id,
                notification_enabled: true,
                reminder_days_before: 1,
            });
        }
    },

    // ── Sign Out ─────────────────────────────────────────────────────────────

    signOut: async () => {
        await supabase.auth.signOut();
        set({
            user: null,
            session: null,
            settings: null,
            pinRequired: false,
        });
    },

    // ── Fetch Settings ───────────────────────────────────────────────────────

    fetchSettings: async () => {
        const { user } = get();
        if (!user) return;

        const { data } = await supabase
            .from("user_settings")
            .select("*")
            .eq("user_id", user.id)
            .single();

        if (data) {
            set({ settings: data as UserSettings });
        }
    },

    // ── PIN Management ───────────────────────────────────────────────────────

    setPin: async (pin) => {
        const { user, settings } = get();
        try {
            if (!user) return;

            // Hash the PIN with bcrypt (or set to null to remove)
            const pinHash = pin ? bcrypt.hashSync(pin, 10) : null;

            // Upsert with ALL columns so a missing row gets created with correct
            // defaults. No .eq() after upsert — the PK in the data handles conflict.
            const { error } = await supabase.from("user_settings").upsert({
                user_id: user.id,
                pin_hash: pinHash,
                notification_enabled: settings?.notification_enabled ?? true,
                reminder_days_before: settings?.reminder_days_before ?? 1,
            });

            if (error) throw error;
        } catch (error) {
            console.error("Error setting PIN:", error);
            throw error;
        }

        // Refresh local settings
        await get().fetchSettings();
    },

    verifyPin: (pin) => {
        const { settings } = get();
        if (!settings?.pin_hash) return true; // No PIN set — always pass
        if (pin.length !== PIN_LENGTH) return false;

        const isValid = bcrypt.compareSync(pin, settings.pin_hash);
        if (isValid) {
            set({ pinRequired: false }); // Unlock the app
        }
        return isValid;
    },

    // ── Notification Settings ────────────────────────────────────────────────

    updateNotificationSettings: async (enabled, reminderDays) => {
        const { user, settings } = get();
        if (!user) return;

        const { error } = await supabase.from("user_settings").upsert({
            user_id: user.id,
            pin_hash: settings?.pin_hash ?? null,
            notification_enabled: enabled,
            reminder_days_before: reminderDays,
        });

        if (error) throw error;

        await get().fetchSettings();
    },
}));
