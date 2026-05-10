/**
 * app/customer/[id].tsx
 *
 * Customer "bio-data" screen.
 *
 * Sections:
 *  1. Header — name + edit / delete buttons
 *  2. Personal details card (father's name, email, phone, address, caste, remarks)
 *  3. Loans block — quick "+ Credit" / "+ Debit" buttons + list of this customer's loans
 */

import React, { useEffect } from "react";
import {
    View,
    Text,
    ScrollView,
    Pressable,
    Linking,
    Alert,
    ActivityIndicator,
    RefreshControl,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useCustomerStore } from "@/stores/customerStore";
import LoanCard from "@/components/LoanCard";
import { useLoanStore } from "@/stores/loanStore";
import { Colors } from "@/lib/constants";

export default function CustomerProfileScreen() {
    const router = useRouter();
    const { id } = useLocalSearchParams<{ id: string }>();

    const fetchCustomerProfile = useCustomerStore(
        (s) => s.fetchCustomerProfile,
    );
    const deleteCustomer = useCustomerStore((s) => s.deleteCustomer);
    const customer = useCustomerStore((s) => s.currentCustomer);
    const loans = useCustomerStore((s) => s.customerLoans);
    const loading = useCustomerStore((s) => s.loading);

    const deleteLoan = useLoanStore((s) => s.deleteLoan);

    useEffect(() => {
        if (id) fetchCustomerProfile(id);
    }, [id, fetchCustomerProfile]);

    const handleDelete = () => {
        if (!customer) return;
        Alert.alert(
            "Delete Customer",
            `Delete ${customer.name}? All of their loans, payments, and transaction history will be permanently removed.`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        await deleteCustomer(customer.id);
                        router.back();
                    },
                },
            ],
        );
    };

    const handleDeleteLoan = async (loanId: string) => {
        await deleteLoan(loanId);
        if (id) await fetchCustomerProfile(id);
    };

    if (!customer && loading) {
        return (
            <View className="flex-1 items-center justify-center bg-surface">
                <ActivityIndicator color={Colors.teal} />
            </View>
        );
    }

    if (!customer) {
        return (
            <View className="flex-1 items-center justify-center bg-surface px-6">
                <Text className="text-muted text-center">
                    Customer not found.
                </Text>
            </View>
        );
    }

    return (
        <>
            <Stack.Screen
                options={{
                    title: customer.name,
                    headerRight: () => (
                        <View className="flex-row mr-2">
                            <Pressable
                                className="px-2 py-1"
                                onPress={() =>
                                    router.push(`/customer/edit/${customer.id}`)
                                }
                            >
                                <Ionicons
                                    name="pencil"
                                    size={20}
                                    color={Colors.white}
                                />
                            </Pressable>
                            <Pressable
                                className="px-2 py-1"
                                onPress={handleDelete}
                            >
                                <Ionicons
                                    name="trash"
                                    size={20}
                                    color={Colors.white}
                                />
                            </Pressable>
                        </View>
                    ),
                }}
            />

            <ScrollView
                className="flex-1 bg-surface"
                contentContainerStyle={{ paddingBottom: 32 }}
                refreshControl={
                    <RefreshControl
                        refreshing={loading}
                        onRefresh={() => id && fetchCustomerProfile(id)}
                        tintColor={Colors.teal}
                    />
                }
            >
                {/* ── Type pill ─────────────────────────────────────────────── */}
                <View className="mx-4 mt-4">
                    <View
                        className="self-start px-3 py-1 rounded-full"
                        style={{
                            backgroundColor:
                                customer.type === "credit"
                                    ? Colors.credit
                                    : Colors.debit,
                        }}
                    >
                        <Text className="text-white text-xs font-semibold">
                            {customer.type === "credit"
                                ? "Loan Given"
                                : "Loan Taken"}
                        </Text>
                    </View>
                </View>

                {/* ── Personal details ──────────────────────────────────────── */}
                <View className="bg-white mx-4 mt-3 mb-4 rounded-2xl p-5">
                    <Text className="text-xs uppercase font-semibold text-muted tracking-wider mb-3">
                        Personal Details
                    </Text>

                    <DetailRow
                        label="Father's Name"
                        value={customer.fathers_name}
                    />
                    <DetailRow
                        label="Email"
                        value={customer.email}
                        onPress={
                            customer.email
                                ? () =>
                                      Linking.openURL(
                                          `mailto:${customer.email}`,
                                      )
                                : undefined
                        }
                        icon={customer.email ? "mail-outline" : undefined}
                    />
                    <DetailRow
                        label="Phone"
                        value={customer.phone}
                        onPress={
                            customer.phone
                                ? () => Linking.openURL(`tel:${customer.phone}`)
                                : undefined
                        }
                        icon={customer.phone ? "call-outline" : undefined}
                    />
                    <DetailRow label="Address" value={customer.address} />
                    <DetailRow label="Caste" value={customer.caste} />
                    <DetailRow
                        label="Remarks"
                        value={customer.remarks}
                        multiline
                    />
                </View>

                {/* ── Loans ─────────────────────────────────────────────────── */}
                <View className="px-4 flex-row items-center justify-between mb-3">
                    <Text className="text-base font-bold text-navy">Loans</Text>
                </View>

                <View className="px-4 mb-4">
                    <Pressable
                        className="rounded-xl py-3 flex-row items-center justify-center"
                        style={{
                            backgroundColor:
                                customer.type === "credit"
                                    ? Colors.credit
                                    : Colors.debit,
                        }}
                        onPress={() =>
                            router.push(
                                `/loan/add?customer_id=${customer.id}&type=${customer.type}`,
                            )
                        }
                    >
                        <Ionicons
                            name={
                                customer.type === "credit"
                                    ? "arrow-down-circle"
                                    : "arrow-up-circle"
                            }
                            size={18}
                            color="white"
                        />
                        <Text className="text-white font-semibold ml-1.5">
                            + Add Loan
                        </Text>
                    </Pressable>
                </View>

                {loans.length === 0 ? (
                    <View className="items-center py-8 px-6">
                        <Ionicons
                            name="document-outline"
                            size={36}
                            color={Colors.muted}
                        />
                        <Text className="text-muted text-sm mt-2 text-center">
                            No loans yet. Add a credit or debit loan above.
                        </Text>
                    </View>
                ) : (
                    loans.map((loan) => (
                        <LoanCard
                            key={loan.id}
                            loan={loan}
                            customerName={customer.name}
                            customerPhone={customer.phone}
                            onDelete={handleDeleteLoan}
                        />
                    ))
                )}
            </ScrollView>
        </>
    );
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

function DetailRow({
    label,
    value,
    icon,
    onPress,
    multiline,
}: {
    label: string;
    value?: string | null;
    icon?: keyof typeof Ionicons.glyphMap;
    onPress?: () => void;
    multiline?: boolean;
}) {
    const display = value && value.trim() ? value : "—";
    const interactive = !!onPress && !!value;

    const inner = (
        <View className="flex-row items-start py-2">
            <Text className="text-xs text-muted w-28">{label}</Text>
            <View className="flex-1 flex-row items-center">
                <Text
                    className={`flex-1 text-sm ${interactive ? "text-teal" : "text-navy"}`}
                    numberOfLines={multiline ? 4 : 1}
                >
                    {display}
                </Text>
                {interactive && icon ? (
                    <Ionicons name={icon} size={16} color={Colors.teal} />
                ) : null}
            </View>
        </View>
    );

    return interactive ? (
        <Pressable onPress={onPress}>{inner}</Pressable>
    ) : (
        inner
    );
}
