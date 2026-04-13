/**
 * app/settings.tsx
 *
 * Settings screen — PIN management, notification preferences, and logout.
 *
 * Features:
 * - Set / change / remove the 4-digit PIN lock.
 * - Toggle notification reminders on/off.
 * - Adjust "reminder days before" due date.
 * - Sign out (clears session and navigates to login).
 */

import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  Switch,
  TextInput,
  Alert,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useAuthStore } from "@/stores/authStore";
import { cancelAllNotifications } from "@/lib/notifications";
import { Colors, PIN_LENGTH } from "@/lib/constants";

export default function SettingsScreen() {
  const router = useRouter();
  const { user, settings, signOut, setPin, updateNotificationSettings } =
    useAuthStore();

  const [pinInput, setPinInput] = useState("");
  const [settingPin, setSettingPin] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const hasPinSet = !!settings?.pin_hash;
  const notificationsEnabled = settings?.notification_enabled ?? true;
  const reminderDays = settings?.reminder_days_before ?? 1;

  // ── PIN Management ───────────────────────────────────────────────────────

  /** Set or update the PIN. */
  const handleSetPin = async () => {
    if (pinInput.length !== PIN_LENGTH) {
      Alert.alert("Invalid PIN", `PIN must be exactly ${PIN_LENGTH} digits.`);
      return;
    }
    setSettingPin(true);
    try {
      await setPin(pinInput);
      setPinInput("");
      Alert.alert("PIN Set", "Your PIN has been saved.");
    } catch {
      Alert.alert("Error", "Failed to set PIN.");
    } finally {
      setSettingPin(false);
    }
  };

  /** Remove the PIN lock. */
  const handleRemovePin = () => {
    Alert.alert("Remove PIN", "Are you sure you want to remove the PIN lock?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          await setPin(null);
          Alert.alert("PIN Removed", "PIN lock has been disabled.");
        },
      },
    ]);
  };

  // ── Notification Toggle ──────────────────────────────────────────────────

  const handleToggleNotifications = async (enabled: boolean) => {
    await updateNotificationSettings(enabled, reminderDays);
    if (!enabled) {
      // Cancel all pending notifications when user disables
      await cancelAllNotifications();
    }
  };

  // ── Reminder Days ────────────────────────────────────────────────────────

  const handleReminderDaysChange = async (text: string) => {
    const days = parseInt(text, 10);
    if (!isNaN(days) && days >= 0 && days <= 30) {
      await updateNotificationSettings(notificationsEnabled, days);
    }
  };

  // ── Sign Out ─────────────────────────────────────────────────────────────

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          setSigningOut(true);
          await cancelAllNotifications();
          await signOut();
          // Auth gate in root layout handles redirect to login
        },
      },
    ]);
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <ScrollView className="flex-1 bg-surface" contentContainerStyle={{ padding: 24 }}>
      {/* ── User Info ──────────────────────────────────────────────── */}
      <View className="bg-white rounded-xl p-4 mb-6">
        <Text className="text-xs text-muted mb-1">Signed in as</Text>
        <Text className="text-base font-medium text-navy">
          {user?.email ?? "Unknown"}
        </Text>
      </View>

      {/* ── PIN Section ────────────────────────────────────────────── */}
      <View className="bg-white rounded-xl p-4 mb-6">
        <View className="flex-row items-center mb-3">
          <Ionicons name="lock-closed" size={20} color={Colors.navy} />
          <Text className="text-base font-semibold text-navy ml-2">
            PIN Lock
          </Text>
        </View>

        <Text className="text-sm text-muted mb-3">
          {hasPinSet
            ? "A PIN is currently set. You can change or remove it."
            : "Set a 4-digit PIN for extra security when opening the app."}
        </Text>

        {/* PIN input + Set button */}
        <View className="flex-row items-center gap-3 mb-3">
          <TextInput
            className="flex-1 bg-surface border border-gray-200 rounded-xl px-4 py-3 text-navy text-center tracking-widest"
            placeholder="Enter 4-digit PIN"
            placeholderTextColor={Colors.muted}
            keyboardType="number-pad"
            maxLength={PIN_LENGTH}
            secureTextEntry
            value={pinInput}
            onChangeText={(text) =>
              setPinInput(text.replace(/[^0-9]/g, "").slice(0, PIN_LENGTH))
            }
          />
          <Pressable
            className="bg-teal px-5 py-3 rounded-xl"
            onPress={handleSetPin}
            disabled={settingPin}
          >
            {settingPin ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text className="text-white font-medium">
                {hasPinSet ? "Update" : "Set"}
              </Text>
            )}
          </Pressable>
        </View>

        {/* Remove PIN button (only shown when a PIN is already set) */}
        {hasPinSet ? (
          <Pressable onPress={handleRemovePin}>
            <Text className="text-overdue text-sm font-medium">
              Remove PIN
            </Text>
          </Pressable>
        ) : null}
      </View>

      {/* ── Notification Settings ──────────────────────────────────── */}
      <View className="bg-white rounded-xl p-4 mb-6">
        <View className="flex-row items-center mb-3">
          <Ionicons name="notifications" size={20} color={Colors.navy} />
          <Text className="text-base font-semibold text-navy ml-2">
            Notifications
          </Text>
        </View>

        {/* Enable/disable toggle */}
        <View className="flex-row justify-between items-center mb-4">
          <Text className="text-sm text-navy">Payment Reminders</Text>
          <Switch
            value={notificationsEnabled}
            onValueChange={handleToggleNotifications}
            trackColor={{ false: Colors.muted, true: Colors.teal }}
            thumbColor={Colors.white}
          />
        </View>

        {/* Reminder days input */}
        {notificationsEnabled ? (
          <View className="flex-row items-center">
            <Text className="text-sm text-navy flex-1">
              Remind me this many days before due date:
            </Text>
            <TextInput
              className="bg-surface border border-gray-200 rounded-xl px-3 py-2 w-16 text-center text-navy"
              keyboardType="number-pad"
              value={String(reminderDays)}
              onChangeText={handleReminderDaysChange}
              maxLength={2}
            />
          </View>
        ) : null}
      </View>

      {/* ── Sign Out ───────────────────────────────────────────────── */}
      <Pressable
        className="bg-overdue rounded-xl py-4 items-center"
        onPress={handleSignOut}
        disabled={signingOut}
      >
        {signingOut ? (
          <ActivityIndicator color="white" />
        ) : (
          <View className="flex-row items-center">
            <Ionicons name="log-out-outline" size={20} color="white" />
            <Text className="text-white font-semibold ml-2">Sign Out</Text>
          </View>
        )}
      </Pressable>
    </ScrollView>
  );
}
