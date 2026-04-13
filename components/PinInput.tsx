/**
 * components/PinInput.tsx
 *
 * 4-digit PIN entry component with individual digit boxes.
 *
 * Features:
 * - Hidden TextInput captures keyboard input.
 * - Four visible boxes display dots/digits.
 * - Auto-submits when all 4 digits are entered.
 * - Shake animation on incorrect PIN.
 */

import React, { useRef, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Animated,
  StyleSheet,
} from "react-native";
import { Colors, PIN_LENGTH } from "@/lib/constants";

interface PinInputProps {
  /** Called when the user finishes entering all 4 digits. */
  onComplete: (pin: string) => void;
  /** When true, plays a shake animation and clears the input. */
  error?: boolean;
  /** Optional label above the PIN boxes. */
  label?: string;
}

export default function PinInput({
  onComplete,
  error = false,
  label = "Enter PIN",
}: PinInputProps) {
  const [pin, setPin] = useState("");
  const inputRef = useRef<TextInput>(null);

  // Animated value for the shake effect
  const shakeAnim = useRef(new Animated.Value(0)).current;

  // Auto-submit when all digits are entered
  useEffect(() => {
    if (pin.length === PIN_LENGTH) {
      onComplete(pin);
    }
  }, [pin]);

  // Shake and clear on error
  useEffect(() => {
    if (error) {
      // Trigger shake animation
      Animated.sequence([
        Animated.timing(shakeAnim, {
          toValue: 10,
          duration: 50,
          useNativeDriver: true,
        }),
        Animated.timing(shakeAnim, {
          toValue: -10,
          duration: 50,
          useNativeDriver: true,
        }),
        Animated.timing(shakeAnim, {
          toValue: 10,
          duration: 50,
          useNativeDriver: true,
        }),
        Animated.timing(shakeAnim, {
          toValue: 0,
          duration: 50,
          useNativeDriver: true,
        }),
      ]).start();

      // Clear input after shake
      setTimeout(() => setPin(""), 300);
    }
  }, [error]);

  return (
    <View className="items-center">
      {/* Label */}
      <Text className="text-lg font-semibold text-navy mb-6">{label}</Text>

      {/* Digit boxes — tapping anywhere focuses the hidden input */}
      <Pressable onPress={() => inputRef.current?.focus()}>
        <Animated.View
          style={{ transform: [{ translateX: shakeAnim }] }}
          className="flex-row gap-4"
        >
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <View
              key={i}
              className="w-14 h-14 border-2 rounded-xl justify-center items-center"
              style={{
                borderColor: pin.length === i ? Colors.teal : Colors.muted,
                backgroundColor:
                  pin.length > i ? Colors.navy : Colors.surface,
              }}
            >
              {pin.length > i ? (
                // Show a dot instead of the actual digit for security
                <View className="w-3 h-3 rounded-full bg-white" />
              ) : null}
            </View>
          ))}
        </Animated.View>
      </Pressable>

      {/* Hidden TextInput that captures keyboard events */}
      <TextInput
        ref={inputRef}
        value={pin}
        onChangeText={(text) => {
          // Only allow digits, max PIN_LENGTH characters
          const cleaned = text.replace(/[^0-9]/g, "").slice(0, PIN_LENGTH);
          setPin(cleaned);
        }}
        keyboardType="number-pad"
        maxLength={PIN_LENGTH}
        autoFocus
        style={styles.hiddenInput}
      />

      {/* Error hint */}
      {error ? (
        <Text className="text-overdue text-sm mt-4">
          Incorrect PIN. Please try again.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Completely hidden but still focusable
  hiddenInput: {
    position: "absolute",
    opacity: 0,
    height: 0,
    width: 0,
  },
});
