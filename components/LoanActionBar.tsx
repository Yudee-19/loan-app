/**
 * components/LoanActionBar.tsx
 *
 * Four primary action buttons surfaced on the loan detail screen:
 *   - Redeem            → close the loan in full
 *   - Partial           → record an arbitrary partial payment (principal-side)
 *   - Interest Paid     → record the FULL interest of the loan as paid
 *   - Partial Interest  → record an arbitrary interest-side payment
 *
 * Buttons are disabled once the loan is completed.
 */

import React from "react";
import { View, Text, Pressable, Alert, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Colors, formatCurrency } from "@/lib/constants";

interface Props {
    /** True after a successful Redeem (or full pay-down via partials). */
    completed: boolean;
    /** Currently outstanding amount. Used to display Redeem confirmation copy. */
    remainingAmount: number;
    /** Pre-computed full interest of the loan, shown in the confirm dialog. */
    totalInterestAmount: number;
    busy?: boolean;
    onRedeem: () => void;
    onOpenPartial: () => void;
    onInterest: () => void;
    onOpenPartialInterest: () => void;
}

export default function LoanActionBar({
    completed,
    remainingAmount,
    totalInterestAmount,
    busy,
    onRedeem,
    onOpenPartial,
    onInterest,
    onOpenPartialInterest,
}: Props) {
    const disabled = completed || busy;

    const confirmRedeem = () => {
        Alert.alert(
            "Redeem Loan",
            `Mark this loan as fully paid?\n\n${formatCurrency(
                remainingAmount,
            )} will be recorded as received.`,
            [
                { text: "Cancel", style: "cancel" },
                { text: "Redeem", style: "default", onPress: onRedeem },
            ],
        );
    };

    const confirmInterest = () => {
        Alert.alert(
            "Interest Paid",
            `Record the loan's full interest of ${formatCurrency(
                totalInterestAmount,
            )} as paid?\n\nThis amount will be deducted from the outstanding balance.`,
            [
                { text: "Cancel", style: "cancel" },
                { text: "Mark Paid", style: "default", onPress: onInterest },
            ],
        );
    };

    return (
        <View className="bg-white rounded-2xl p-3 mx-4 mb-4">
            <Text className="text-xs font-semibold text-muted uppercase tracking-wider mb-2 px-1">
                Actions
            </Text>
            <View className="flex-row gap-2 mb-2">
                <ActionButton
                    icon="checkmark-done"
                    label="Redeem Loan"
                    color={Colors.paid}
                    disabled={disabled}
                    busy={busy}
                    onPress={confirmRedeem}
                />
                <ActionButton
                    icon="cash-outline"
                    label="Pay Partial Loan Amount"
                    color={Colors.teal}
                    disabled={disabled}
                    busy={busy}
                    onPress={onOpenPartial}
                />
            </View>
            <View className="flex-row gap-2">
                <ActionButton
                    icon="trending-up"
                    label="Pay Complete Interest"
                    color={Colors.navy}
                    disabled={disabled}
                    busy={busy}
                    onPress={confirmInterest}
                />
                <ActionButton
                    icon="pulse"
                    label="Pay Partial Interest"
                    color={Colors.muted}
                    disabled={disabled}
                    busy={busy}
                    onPress={onOpenPartialInterest}
                />
            </View>
            {completed ? (
                <Text className="text-xs text-muted text-center mt-3">
                    Loan is fully redeemed
                </Text>
            ) : null}
        </View>
    );
}

function ActionButton({
    icon,
    label,
    color,
    disabled,
    busy,
    onPress,
}: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    color: string;
    disabled?: boolean;
    busy?: boolean;
    onPress: () => void;
}) {
    return (
        <Pressable
            className="flex-1 rounded-xl py-3 items-center"
            style={{
                backgroundColor: disabled ? Colors.muted : color,
                opacity: disabled ? 0.5 : 1,
            }}
            onPress={onPress}
            disabled={disabled}
        >
            {busy ? (
                <ActivityIndicator color="white" />
            ) : (
                <>
                    <Ionicons name={icon} size={20} color="white" />
                    <Text className="text-white text-xs font-semibold mt-1">
                        {label}
                    </Text>
                </>
            )}
        </Pressable>
    );
}
