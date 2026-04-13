/**
 * components/EmptyState.tsx
 *
 * Friendly placeholder shown when a loan list (Credit or Debit tab) is empty.
 * Displays an icon, a message, and a call-to-action button.
 */

import React from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/lib/constants";

interface EmptyStateProps {
  /** Primary message, e.g. "No credit loans yet". */
  message: string;
  /** Sub-message with a hint, e.g. "Tap + to add your first loan". */
  subMessage?: string;
  /** Icon name from Ionicons. */
  icon?: string;
  /** Optional action button label. */
  actionLabel?: string;
  /** Called when the action button is pressed. */
  onAction?: () => void;
}

export default function EmptyState({
  message,
  subMessage,
  icon = "wallet-outline",
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <View className="flex-1 justify-center items-center px-8">
      {/* Large icon */}
      <Ionicons name={icon as any} size={80} color={Colors.muted} />

      {/* Primary message */}
      <Text className="text-xl font-semibold text-navy mt-4 text-center">
        {message}
      </Text>

      {/* Sub-message */}
      {subMessage ? (
        <Text className="text-sm text-muted mt-2 text-center">
          {subMessage}
        </Text>
      ) : null}

      {/* Optional CTA button */}
      {actionLabel && onAction ? (
        <Pressable
          className="bg-teal px-6 py-3 rounded-xl mt-6"
          onPress={onAction}
        >
          <Text className="text-white font-medium">{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
