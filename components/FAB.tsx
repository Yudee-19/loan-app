/**
 * components/FAB.tsx
 *
 * Floating Action Button positioned at the bottom-right of the screen.
 * Used in the Credit and Debit tabs to navigate to the "Add Loan" form.
 */

import React from "react";
import { Pressable, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface FABProps {
  /** Called when the FAB is pressed. */
  onPress: () => void;
  /** Optional label displayed next to the icon. */
  label?: string;
}

export default function FAB({ onPress, label }: FABProps) {
  return (
    <Pressable
      className="absolute bottom-6 right-6 bg-teal flex-row items-center px-5 py-4 rounded-full shadow-lg"
      style={{
        // Elevation for Android shadow
        elevation: 6,
        // Shadow for iOS
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.27,
        shadowRadius: 4.65,
      }}
      onPress={onPress}
    >
      <Ionicons name="add" size={24} color="white" />
      {label ? (
        <Text className="text-white font-semibold ml-2">{label}</Text>
      ) : null}
    </Pressable>
  );
}
