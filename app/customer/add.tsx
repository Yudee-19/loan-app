/**
 * app/customer/add.tsx
 *
 * Create a new customer. Presented as a modal stack screen
 * (configured in app/_layout.tsx). On success, navigates to the
 * newly-created customer's bio-data page.
 */

import React, { useState } from "react";
import { useRouter } from "expo-router";

import CustomerForm from "@/components/CustomerForm";
import { useAuthStore } from "@/stores/authStore";
import { useCustomerStore } from "@/stores/customerStore";
import type { CustomerInsert } from "@/types";

export default function AddCustomerScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const addCustomer = useCustomerStore((s) => s.addCustomer);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (data: CustomerInsert) => {
    if (!user) return;
    setSubmitting(true);
    setError(null);
    try {
      const id = await addCustomer(data, user.id);
      router.replace(`/customer/${id}`);
    } catch (err: any) {
      setError(err?.message ?? "Failed to add customer.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <CustomerForm
      ctaLabel="Create Customer"
      submitting={submitting}
      serverError={error}
      onSubmit={handleSubmit}
    />
  );
}
