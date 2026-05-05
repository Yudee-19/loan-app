/**
 * components/LoanSearchSheet.tsx
 *
 * Slide-up modal sheet that lets the user search a list of loans
 * by person name (or phone) and tap one to open its detail page.
 *
 * Used by the Credit and Debit tabs — each tab passes in its own
 * loan list and `type` ("credit" | "debit") for accent colour.
 */

import React, { useMemo, useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Colors } from "@/lib/constants";
import type { Loan } from "@/types";

interface LoanSearchSheetProps {
  visible: boolean;
  onClose: () => void;
  loans: Loan[];
  type: "credit" | "debit";
}

// Indian-style currency formatter (₹ + comma grouping)
const formatINR = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);

export default function LoanSearchSheet({
  visible,
  onClose,
  loans,
  type,
}: LoanSearchSheetProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  // Filter loans by name or phone (case-insensitive)
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return loans;
    return loans.filter(
      (l) =>
        l.person_name.toLowerCase().includes(q) ||
        (l.person_phone ?? "").toLowerCase().includes(q),
    );
  }, [loans, query]);

  /** Close sheet, reset query, then navigate to detail. */
  const handleSelect = (id: string) => {
    setQuery("");
    onClose();
    router.push(`/loan/${id}`);
  };

  const handleClose = () => {
    setQuery("");
    onClose();
  };

  const accent = type === "credit" ? Colors.credit : Colors.debit;
  const headerLabel = type === "credit" ? "Credit Loans" : "Debit Loans";

  // Pin the sheet to a real pixel height. Using a percent-of-parent
  // doesn't work because KeyboardAvoidingView has no intrinsic height,
  // which collapses the sheet to 0px and hides the content.
  const sheetHeight = Dimensions.get("window").height * 0.85;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <View className="flex-1 justify-end">
        {/* Full-screen tappable backdrop sits behind the sheet */}
        <Pressable
          className="absolute inset-0 bg-black/60"
          onPress={handleClose}
        />

        {/* Sheet body */}
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View
            className="bg-surface rounded-t-3xl"
            style={{ height: sheetHeight }}
          >
            {/* Drag handle */}
            <View className="items-center pt-3 pb-2">
              <View className="w-12 h-1.5 bg-gray-300 rounded-full" />
            </View>

            {/* Header */}
            <View className="flex-row items-center justify-between px-5 pb-3">
              <Text className="text-lg font-semibold text-navy">
                {headerLabel}
              </Text>
              <Pressable onPress={handleClose} hitSlop={12}>
                <Ionicons name="close" size={24} color={Colors.muted} />
              </Pressable>
            </View>

            {/* Search bar */}
            <View className="flex-row items-center bg-white border border-gray-200 rounded-xl mx-5 px-3 py-2">
              <Ionicons name="search" size={18} color={Colors.muted} />
              <TextInput
                className="flex-1 ml-2 text-navy"
                placeholder="Search by name or phone"
                placeholderTextColor={Colors.muted}
                value={query}
                onChangeText={setQuery}
                autoCorrect={false}
                autoCapitalize="none"
                autoFocus
              />
              {query ? (
                <Pressable onPress={() => setQuery("")} hitSlop={8}>
                  <Ionicons
                    name="close-circle"
                    size={18}
                    color={Colors.muted}
                  />
                </Pressable>
              ) : null}
            </View>

            {/* Results list — flex:1 so it fills the remaining sheet height */}
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              style={{ flex: 1 }}
              contentContainerStyle={{
                paddingHorizontal: 20,
                paddingTop: 16,
                paddingBottom: 40,
                flexGrow: 1,
              }}
              renderItem={({ item }) => (
                <Pressable
                  className="bg-white rounded-xl px-4 py-3 mb-2 flex-row items-center justify-between border border-gray-100"
                  onPress={() => handleSelect(item.id)}
                >
                  <View className="flex-1 mr-3">
                    <Text
                      className="text-navy font-semibold"
                      numberOfLines={1}
                    >
                      {item.person_name}
                    </Text>
                    {item.person_phone ? (
                      <Text className="text-muted text-xs mt-1">
                        {item.person_phone}
                      </Text>
                    ) : null}
                  </View>

                  <View className="items-end">
                    {item.is_completed ? (
                      <View className="flex-row items-center">
                        <Ionicons
                          name="checkmark-circle"
                          size={16}
                          color={Colors.paid}
                        />
                        <Text className="text-paid text-xs ml-1 font-medium">
                          Completed
                        </Text>
                      </View>
                    ) : (
                      <Text
                        className="font-semibold"
                        style={{ color: accent }}
                      >
                        {formatINR(item.remaining_amount)}
                      </Text>
                    )}
                    <Text className="text-muted text-xs mt-1">
                      {item.is_completed ? "Paid off" : "remaining"}
                    </Text>
                  </View>
                </Pressable>
              )}
              ListEmptyComponent={
                <View className="items-center mt-12">
                  <Ionicons
                    name={query ? "search-outline" : "folder-open-outline"}
                    size={48}
                    color={Colors.muted}
                  />
                  <Text className="text-muted mt-3">
                    {query
                      ? "No matches found"
                      : `No ${type} loans yet`}
                  </Text>
                </View>
              }
            />
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
