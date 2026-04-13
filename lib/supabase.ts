/**
 * lib/supabase.ts
 *
 * Initialises the Supabase client for LoanTracker.
 *
 * Key decisions:
 * - Session tokens are persisted via expo-secure-store (encrypted at rest)
 *   instead of AsyncStorage, because they are sensitive auth credentials.
 * - `detectSessionInUrl` is false — we're a native app, not a web SPA.
 * - `autoRefreshToken` keeps the session alive transparently.
 *
 * Chunked Storage:
 *   expo-secure-store has a 2048-byte limit per key. Supabase JWTs easily
 *   exceed that, so we split large values into numbered chunks and reassemble
 *   them on read. This avoids the "value larger than 2048 bytes" warning.
 */

import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";

// ─── Environment Variables ───────────────────────────────────────────────────

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// ─── Chunked Secure Storage Adapter ─────────────────────────────────────────
// SecureStore caps each value at 2048 bytes. Supabase sessions (JWTs) are
// typically ~3–4 KB, so we chunk them into 2000-byte pieces stored under
// keys like "supabase-auth-token_0", "supabase-auth-token_1", etc.

const CHUNK_SIZE = 2000;

const ChunkedSecureStore = {
  /**
   * Read a value that may have been split across multiple SecureStore keys.
   * Reads chunk_0, chunk_1, … until a chunk returns null.
   */
  async getItem(key: string): Promise<string | null> {
    // Try reading the first chunk
    const firstChunk = await SecureStore.getItemAsync(`${key}_0`);

    // If no chunks exist, fall back to a plain (non-chunked) read for
    // backwards compatibility with sessions stored before this adapter.
    if (firstChunk === null) {
      return SecureStore.getItemAsync(key);
    }

    // Reassemble all chunks
    let value = firstChunk;
    let index = 1;
    while (true) {
      const chunk = await SecureStore.getItemAsync(`${key}_${index}`);
      if (chunk === null) break;
      value += chunk;
      index++;
    }
    return value;
  },

  /**
   * Split a value into 2000-byte chunks and store each one.
   * Also cleans up any leftover chunks from a previous (longer) value.
   */
  async setItem(key: string, value: string): Promise<void> {
    const chunks = Math.ceil(value.length / CHUNK_SIZE);

    // Write each chunk
    for (let i = 0; i < chunks; i++) {
      const chunk = value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      await SecureStore.setItemAsync(`${key}_${i}`, chunk);
    }

    // Clean up stale chunks from a previous (longer) value
    let cleanupIndex = chunks;
    while (true) {
      const stale = await SecureStore.getItemAsync(`${key}_${cleanupIndex}`);
      if (stale === null) break;
      await SecureStore.deleteItemAsync(`${key}_${cleanupIndex}`);
      cleanupIndex++;
    }

    // Remove the plain (non-chunked) key if it exists from an older session
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // Ignore — key may not exist
    }
  },

  /**
   * Remove all chunks for the given key.
   */
  async removeItem(key: string): Promise<void> {
    let index = 0;
    while (true) {
      const chunk = await SecureStore.getItemAsync(`${key}_${index}`);
      if (chunk === null) break;
      await SecureStore.deleteItemAsync(`${key}_${index}`);
      index++;
    }

    // Also remove the plain key for backwards compatibility
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // Ignore
    }
  },
};

// ─── Client ──────────────────────────────────────────────────────────────────

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ChunkedSecureStore,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
