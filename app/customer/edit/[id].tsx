/**
 * app/customer/edit/[id].tsx
 *
 * Edit an existing customer. Pre-fills the form with the current
 * record. On success, returns to the customer's bio-data screen.
 */

import React, { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import CustomerForm from "@/components/CustomerForm";
import { useCustomerStore } from "@/stores/customerStore";
import { Colors } from "@/lib/constants";
import type { CustomerInsert } from "@/types";

export default function EditCustomerScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const fetchCustomerProfile = useCustomerStore((s) => s.fetchCustomerProfile);
  const updateCustomer = useCustomerStore((s) => s.updateCustomer);
  const customer = useCustomerStore((s) => s.currentCustomer);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) fetchCustomerProfile(id);
  }, [id, fetchCustomerProfile]);

  const handleSubmit = async (data: CustomerInsert) => {
    if (!id) return;
    setSubmitting(true);
    setError(null);
    try {
      await updateCustomer(id, data);
      router.back();
    } catch (err: any) {
      setError(err?.message ?? "Failed to update customer.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!customer) {
    return (
      <View className="flex-1 items-center justify-center bg-surface">
        <ActivityIndicator color={Colors.teal} />
      </View>
    );
  }

  return (
    <CustomerForm
      initial={customer}
      ctaLabel="Save Changes"
      submitting={submitting}
      serverError={error}
      onSubmit={handleSubmit}
    />
  );
}
