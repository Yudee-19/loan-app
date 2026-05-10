/**
 * components/PartialRedemptionDialog.tsx
 *
 * Modal dialog that asks the admin for an amount, used by the
 * "Partial Redemption" action button on the loan detail screen.
 *
 * Validation: amount must be > 0 and <= remaining_amount.
 */

import React, { useState, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Colors, formatCurrency } from "@/lib/constants";

interface Props {
  visible: boolean;
  /** Maximum amount allowed (= loan.remaining_amount). */
  maxAmount: number;
  /** Dialog title. Defaults to "Partial Redemption". */
  title?: string;
  /** Field label above the amount input. */
  amountLabel?: string;
  /** Optional caption shown under the title. */
  caption?: string;
  submitting?: boolean;
  onCancel: () => void;
  onConfirm: (amount: number) => void | Promise<void>;
}

export default function PartialRedemptionDialog({
  visible,
  maxAmount,
  title,
  amountLabel,
  caption,
  submitting,
  onCancel,
  onConfirm,
}: Props) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setValue("");
      setError(null);
    }
  }, [visible]);

  const handleSubmit = () => {
    const num = Number(value);
    if (!num || isNaN(num) || num <= 0) {
      setError("Enter an amount greater than 0");
      return;
    }
    if (num > maxAmount) {
      setError(`Amount cannot exceed ${formatCurrency(maxAmount)}`);
      return;
    }
    setError(null);
    onConfirm(num);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1 bg-black/50 items-center justify-center px-6"
      >
        <View className="bg-white rounded-2xl w-full max-w-sm p-5">
          <Text className="text-lg font-bold text-navy">
            {title ?? "Partial Redemption"}
          </Text>
          <Text className="text-xs text-muted mt-1">
            {caption ?? `Outstanding: ${formatCurrency(maxAmount)}`}
          </Text>

          <View className="mt-4">
            <Text className="text-sm font-medium text-navy mb-1">
              {amountLabel ?? "Amount Received (₹)"}
            </Text>
            <TextInput
              className="bg-surface border border-gray-200 rounded-xl px-4 py-3 text-navy text-base"
              placeholder="e.g. 5000"
              placeholderTextColor={Colors.muted}
              keyboardType="numeric"
              value={value}
              onChangeText={(t) => {
                setValue(t);
                if (error) setError(null);
              }}
              autoFocus
            />
            {error ? (
              <Text className="text-overdue text-xs mt-1">{error}</Text>
            ) : null}
          </View>

          <View className="flex-row gap-2 mt-5">
            <Pressable
              className="flex-1 py-3 rounded-xl border border-gray-200 items-center"
              onPress={onCancel}
              disabled={submitting}
            >
              <Text className="text-navy font-medium">Cancel</Text>
            </Pressable>
            <Pressable
              className="flex-1 py-3 rounded-xl bg-teal items-center"
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white font-semibold">Confirm</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
