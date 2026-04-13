/**
 * app/loan/add.tsx
 *
 * Add new loan form.  Receives `?type=credit|debit` as a query parameter
 * to know which kind of loan is being created.
 *
 * On submit:
 * 1. Calculates remaining_amount (principal + simple interest).
 * 2. Inserts the loan row into Supabase.
 * 3. Auto-generates the full payment schedule.
 * 4. Schedules local notifications for each payment.
 * 5. Navigates back to the tab list.
 */

import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";

import { useLoanStore } from "@/stores/loanStore";
import { useAuthStore } from "@/stores/authStore";
import { calculateSimpleInterest } from "@/lib/calculations";
import { Colors, MAX_PAYMENT_DAY, formatCurrency } from "@/lib/constants";
import type { LoanInsert } from "@/types";

// ─── Validation Schema ───────────────────────────────────────────────────────

const loanSchema = z.object({
  person_name: z.string().min(1, "Name is required"),
  person_phone: z.string().optional(),
  principal_amount: z
    .string()
    .min(1, "Amount is required")
    .transform(Number)
    .pipe(z.number().positive("Must be greater than 0")),
  rate_of_interest: z
    .string()
    .min(1, "Rate is required")
    .transform(Number)
    .pipe(z.number().min(0).max(100, "Rate must be 0–100%")),
  payment_day_of_month: z
    .string()
    .min(1, "Day is required")
    .transform(Number)
    .pipe(
      z
        .number()
        .int()
        .min(1)
        .max(MAX_PAYMENT_DAY, `Day must be 1–${MAX_PAYMENT_DAY}`)
    ),
  tenure_months: z
    .string()
    .min(1, "Tenure is required")
    .transform(Number)
    .pipe(z.number().int().positive("Must be at least 1 month")),
  notes: z.string().optional(),
});

type LoanFormData = z.infer<typeof loanSchema>;

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function AddLoanScreen() {
  const router = useRouter();
  const { type } = useLocalSearchParams<{ type: "credit" | "debit" }>();
  const loanType = type ?? "credit";

  const addLoan = useLoanStore((s) => s.addLoan);
  const user = useAuthStore((s) => s.user);
  const settings = useAuthStore((s) => s.settings);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<LoanFormData>({
    resolver: zodResolver(loanSchema),
    defaultValues: {
      person_name: "",
      person_phone: "",
      principal_amount: "" as any,
      rate_of_interest: "" as any,
      payment_day_of_month: "" as any,
      tenure_months: "" as any,
      notes: "",
    },
  });

  // Live preview of EMI while user fills the form
  const watchPrincipal = watch("principal_amount");
  const watchRate = watch("rate_of_interest");
  const watchTenure = watch("tenure_months");

  const preview = (() => {
    const p = Number(watchPrincipal) || 0;
    const r = Number(watchRate) || 0;
    const t = Number(watchTenure) || 0;
    if (p > 0 && t > 0) {
      return calculateSimpleInterest(p, r, t);
    }
    return null;
  })();

  /** Form submission handler. */
  const onSubmit = async (data: LoanFormData) => {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      // Calculate remaining_amount = principal + total simple interest
      const { totalAmount } = calculateSimpleInterest(
        data.principal_amount,
        data.rate_of_interest,
        data.tenure_months
      );

      const loanInsert: LoanInsert = {
        type: loanType,
        person_name: data.person_name,
        person_phone: data.person_phone || null,
        principal_amount: data.principal_amount,
        rate_of_interest: data.rate_of_interest,
        payment_day_of_month: data.payment_day_of_month,
        start_date: format(new Date(), "yyyy-MM-dd"),
        tenure_months: data.tenure_months,
        remaining_amount: totalAmount,
        notes: data.notes || null,
      };

      const reminderDays = settings?.reminder_days_before ?? 1;
      await addLoan(loanInsert, user.id, reminderDays);

      // Navigate back to the appropriate tab
      router.back();
    } catch (err: any) {
      setError(err.message ?? "Failed to add loan.");
    } finally {
      setLoading(false);
    }
  };

  // ── Reusable Field Renderer ──────────────────────────────────────────────

  const renderField = (
    name: keyof LoanFormData,
    label: string,
    options?: {
      placeholder?: string;
      keyboardType?: "default" | "numeric" | "phone-pad";
      multiline?: boolean;
    }
  ) => (
    <View className="mb-4">
      <Text className="text-sm font-medium text-navy mb-1">{label}</Text>
      <Controller
        control={control}
        name={name}
        render={({ field: { onChange, onBlur, value } }) => (
          <TextInput
            className={`bg-white border border-gray-200 rounded-xl px-4 py-3 text-navy ${
              options?.multiline ? "min-h-[80px]" : ""
            }`}
            placeholder={options?.placeholder}
            placeholderTextColor={Colors.muted}
            keyboardType={options?.keyboardType ?? "default"}
            multiline={options?.multiline}
            textAlignVertical={options?.multiline ? "top" : "center"}
            onBlur={onBlur}
            onChangeText={onChange}
            value={String(value ?? "")}
          />
        )}
      />
      {errors[name] ? (
        <Text className="text-overdue text-xs mt-1">
          {errors[name]?.message as string}
        </Text>
      ) : null}
    </View>
  );

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1"
    >
      <ScrollView
        className="flex-1 bg-surface"
        contentContainerStyle={{ padding: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Loan type indicator ─────────────────────────────────────── */}
        <View
          className="px-3 py-1.5 rounded-full self-start mb-6"
          style={{
            backgroundColor:
              loanType === "credit" ? Colors.credit : Colors.debit,
          }}
        >
          <Text className="text-white text-sm font-medium">
            {loanType === "credit" ? "Credit (Taken)" : "Debit (Given)"}
          </Text>
        </View>

        {/* ── Form Fields ─────────────────────────────────────────────── */}
        {renderField("person_name", "Person Name", {
          placeholder: "Who is this loan with?",
        })}
        {renderField("person_phone", "Phone Number (optional)", {
          placeholder: "+91 98765 43210",
          keyboardType: "phone-pad",
        })}
        {renderField("principal_amount", "Principal Amount (₹)", {
          placeholder: "e.g. 50000",
          keyboardType: "numeric",
        })}
        {renderField("rate_of_interest", "Annual Interest Rate (%)", {
          placeholder: "e.g. 12",
          keyboardType: "numeric",
        })}
        {renderField("payment_day_of_month", "Payment Day of Month (1–28)", {
          placeholder: "e.g. 5",
          keyboardType: "numeric",
        })}
        {renderField("tenure_months", "Tenure (months)", {
          placeholder: "e.g. 12",
          keyboardType: "numeric",
        })}
        {renderField("notes", "Notes (optional)", {
          placeholder: "Any additional details...",
          multiline: true,
        })}

        {/* ── EMI Preview ─────────────────────────────────────────────── */}
        {preview ? (
          <View className="bg-white rounded-xl p-4 mb-6 border border-gray-100">
            <Text className="text-sm font-semibold text-navy mb-2">
              Loan Summary
            </Text>
            <View className="flex-row justify-between mb-1">
              <Text className="text-xs text-muted">Total Interest</Text>
              <Text className="text-sm text-navy">
                {formatCurrency(preview.totalInterest)}
              </Text>
            </View>
            <View className="flex-row justify-between mb-1">
              <Text className="text-xs text-muted">Total Repayable</Text>
              <Text className="text-sm text-navy">
                {formatCurrency(preview.totalAmount)}
              </Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-xs text-muted">Monthly EMI</Text>
              <Text className="text-base font-bold text-teal">
                {formatCurrency(preview.emi)}
              </Text>
            </View>
          </View>
        ) : null}

        {/* ── Error Banner ─────────────────────────────────────────────── */}
        {error ? (
          <View className="bg-red-50 border border-overdue rounded-xl p-3 mb-4">
            <Text className="text-overdue text-sm">{error}</Text>
          </View>
        ) : null}

        {/* ── Submit Button ────────────────────────────────────────────── */}
        <Pressable
          className="bg-teal rounded-xl py-4 items-center"
          onPress={handleSubmit(onSubmit)}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white font-semibold text-base">
              Add Loan
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
