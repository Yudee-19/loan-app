/**
 * app/(auth)/pin.tsx
 *
 * PIN lock screen — shown after successful email auth when the user
 * has configured a 4-digit PIN.
 *
 * The PIN hash is stored server-side (`user_settings.pin_hash`).
 * Verification happens client-side via bcryptjs compare.
 * On success, `authStore.pinRequired` is set to false and the root
 * layout redirects to the main tabs.
 */

import React, { useState } from "react";
import { View, Text, SafeAreaView } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import PinInput from "@/components/PinInput";
import { useAuthStore } from "@/stores/authStore";
import { Colors } from "@/lib/constants";

export default function PinScreen() {
  const verifyPin = useAuthStore((s) => s.verifyPin);
  const [error, setError] = useState(false);

  /** Called when the user enters all 4 digits. */
  const handlePinComplete = (pin: string) => {
    const isValid = verifyPin(pin);
    if (!isValid) {
      setError(true);
      // Reset error flag after animation completes so the next attempt works
      setTimeout(() => setError(false), 500);
    }
    // If valid, verifyPin sets pinRequired = false → root layout redirects
  };

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <View className="flex-1 justify-center items-center px-6">
        {/* Lock icon */}
        <Ionicons name="lock-closed" size={56} color={Colors.navy} />
        <Text className="text-lg text-muted mt-4 mb-10">
          Enter your PIN to unlock
        </Text>

        <PinInput onComplete={handlePinComplete} error={error} label="" />
      </View>
    </SafeAreaView>
  );
}
