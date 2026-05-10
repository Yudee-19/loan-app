/**
 * components/CustomerSearchBar.tsx
 *
 * Persistent search input that surfaces a dropdown of matching customers.
 * Lives at the top of the Dashboard. Tapping a result navigates to that
 * customer's bio-data screen by default; pass `onSelect` to override.
 */

import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  Keyboard,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Colors } from "@/lib/constants";
import { useCustomerStore } from "@/stores/customerStore";

interface Props {
  /** Override the default navigation behavior on result tap. */
  onSelect?: (customerId: string) => void;
  placeholder?: string;
}

export default function CustomerSearchBar({ onSelect, placeholder }: Props) {
  const router = useRouter();
  const searchCustomers = useCustomerStore((s) => s.searchCustomers);
  const results = useCustomerStore((s) => s.searchResults);

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!open) return;
    debounceRef.current = setTimeout(async () => {
      setBusy(true);
      await searchCustomers(query);
      setBusy(false);
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open, searchCustomers]);

  const handlePick = (id: string) => {
    Keyboard.dismiss();
    setOpen(false);
    setQuery("");
    if (onSelect) onSelect(id);
    else router.push(`/customer/${id}`);
  };

  return (
    <View className="relative z-50">
      <View className="bg-white rounded-xl flex-row items-center px-3 py-2 border border-gray-200">
        <Ionicons name="search" size={18} color={Colors.muted} />
        <TextInput
          className="flex-1 ml-2 text-navy text-base"
          placeholder={placeholder ?? "Search customers by name, email or phone"}
          placeholderTextColor={Colors.muted}
          value={query}
          onChangeText={setQuery}
          onFocus={() => setOpen(true)}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {query.length > 0 ? (
          <Pressable
            onPress={() => {
              setQuery("");
            }}
            hitSlop={8}
          >
            <Ionicons name="close-circle" size={18} color={Colors.muted} />
          </Pressable>
        ) : null}
      </View>

      {open ? (
        <View
          className="absolute top-12 left-0 right-0 bg-white rounded-xl border border-gray-200 max-h-80"
          style={{
            elevation: 8,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.12,
            shadowRadius: 8,
          }}
        >
          {/* Header bar with close */}
          <View className="flex-row justify-between items-center px-3 py-2 border-b border-gray-100">
            <Text className="text-xs text-muted">
              {busy
                ? "Searching…"
                : results.length === 0
                  ? "No matches"
                  : `${results.length} result${results.length === 1 ? "" : "s"}`}
            </Text>
            <Pressable
              onPress={() => {
                Keyboard.dismiss();
                setOpen(false);
              }}
              hitSlop={8}
            >
              <Text className="text-teal text-xs font-medium">Close</Text>
            </Pressable>
          </View>

          {busy && results.length === 0 ? (
            <View className="py-6 items-center">
              <ActivityIndicator color={Colors.teal} />
            </View>
          ) : null}

          {!busy && results.length === 0 ? (
            <View className="py-6 items-center">
              <Text className="text-muted text-sm">
                {query
                  ? "No customers match that search"
                  : "Start typing to search customers"}
              </Text>
            </View>
          ) : null}

          {results.map((c, idx) => (
            <Pressable
              key={c.id}
              onPress={() => handlePick(c.id)}
              className={`px-3 py-3 flex-row items-center ${
                idx > 0 ? "border-t border-gray-100" : ""
              }`}
            >
              <View
                className="w-2 h-2 rounded-full mr-2"
                style={{
                  backgroundColor:
                    c.type === "credit" ? Colors.credit : Colors.debit,
                }}
              />
              <View className="flex-1">
                <Text className="text-navy font-medium" numberOfLines={1}>
                  {c.name}
                </Text>
                <Text className="text-xs text-muted mt-0.5" numberOfLines={1}>
                  {[c.phone, c.email].filter(Boolean).join(" · ") ||
                    "No contact"}
                </Text>
              </View>
              <Text
                className="text-[10px] font-semibold uppercase"
                style={{
                  color: c.type === "credit" ? Colors.credit : Colors.debit,
                }}
              >
                {c.type === "credit" ? "Given" : "Taken"}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
