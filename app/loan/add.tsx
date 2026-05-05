/**
 * app/loan/add.tsx
 *
 * Add new loan form. Receives `?type=credit|debit` as a query parameter.
 *
 * On submit:
 * 1. Computes the bullet-payment total (principal + flat monthly interest × months).
 * 2. Inserts the loan row into Supabase.
 * 3. Auto-generates a single-row payment schedule due `payment_month` months
 *    after today, on today's day-of-month (capped at 28).
 * 4. Schedules a local notification for that payment.
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
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";

import { useLoanStore } from "@/stores/loanStore";
import { useAuthStore } from "@/stores/authStore";
import { calculateBulletPayment } from "@/lib/calculations";
import {
  Colors,
  MAX_PAYMENT_DAY,
  PAYMENT_MONTH_OPTIONS,
  formatCurrency,
} from "@/lib/constants";
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
  tenure_months: z
    .number({ invalid_type_error: "Choose a payment month" })
    .int()
    .refine((n) => (PAYMENT_MONTH_OPTIONS as readonly number[]).includes(n), {
      message: "Choose a payment month",
    }),
  start_date: z.date({ invalid_type_error: "Pick a start date" }),
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
  const [pickerOpen, setPickerOpen] = useState(false);

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
      tenure_months: undefined as any,
      start_date: new Date(),
      notes: "",
    },
  });

  // Live preview while user fills the form
  const watchPrincipal = watch("principal_amount");
  const watchRate = watch("rate_of_interest");
  const watchTenure = watch("tenure_months");
  const watchStartDate = watch("start_date");

  const preview = (() => {
    const p = Number(watchPrincipal) || 0;
    const r = Number(watchRate) || 0;
    const m = Number(watchTenure) || 0;
    if (p > 0 && m > 0 && watchStartDate) {
      const result = calculateBulletPayment(p, r, m);
      const dueDate = new Date(
        watchStartDate.getFullYear(),
        watchStartDate.getMonth() + m,
        Math.min(watchStartDate.getDate(), MAX_PAYMENT_DAY),
      );
      return { ...result, dueDate };
    }
    return null;
  })();

  /** Form submission handler. */
  const onSubmit = async (data: LoanFormData) => {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      const { totalAmount } = calculateBulletPayment(
        data.principal_amount,
        data.rate_of_interest,
        data.tenure_months,
      );

      // Derive the payment day-of-month from the chosen start date, capped at 28
      const paymentDay = Math.min(data.start_date.getDate(), MAX_PAYMENT_DAY);

      const loanInsert: LoanInsert = {
        type: loanType,
        person_name: data.person_name,
        person_phone: data.person_phone || null,
        principal_amount: data.principal_amount,
        rate_of_interest: data.rate_of_interest,
        payment_day_of_month: paymentDay,
        start_date: format(data.start_date, "yyyy-MM-dd"),
        tenure_months: data.tenure_months,
        remaining_amount: totalAmount,
        notes: data.notes || null,
      };

      const reminderDays = settings?.reminder_days_before ?? 1;
      await addLoan(loanInsert, user.id, reminderDays);

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
    },
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
        {renderField("rate_of_interest", "Monthly Interest Rate (%)", {
          placeholder: "e.g. 10",
          keyboardType: "numeric",
        })}

        {/* ── Payment Month Selector ──────────────────────────────────── */}
        <View className="mb-4">
          <Text className="text-sm font-medium text-navy mb-1">
            Payment Month
          </Text>
          <Controller
            control={control}
            name="tenure_months"
            render={({ field: { onChange, value } }) => (
              <View className="flex-row gap-2">
                {PAYMENT_MONTH_OPTIONS.map((m) => {
                  const selected = value === m;
                  return (
                    <Pressable
                      key={m}
                      className={`flex-1 py-3 rounded-xl border items-center ${
                        selected
                          ? "bg-teal border-teal"
                          : "bg-white border-gray-200"
                      }`}
                      onPress={() => onChange(m)}
                    >
                      <Text
                        className={`font-semibold ${
                          selected ? "text-white" : "text-navy"
                        }`}
                      >
                        {m} {m === 1 ? "Month" : "Months"}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          />
          {errors.tenure_months ? (
            <Text className="text-overdue text-xs mt-1">
              {errors.tenure_months?.message as string}
            </Text>
          ) : null}
        </View>

        {/* ── Start Date Picker ───────────────────────────────────────── */}
        <View className="mb-4">
          <Text className="text-sm font-medium text-navy mb-1">Start Date</Text>
          <Controller
            control={control}
            name="start_date"
            render={({ field: { onChange, value } }) => (
              <>
                <Pressable
                  className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex-row items-center justify-between"
                  onPress={() => setPickerOpen(true)}
                >
                  <Text className="text-navy">
                    {value
                      ? format(value, "dd MMM yyyy")
                      : "Pick a start date"}
                  </Text>
                  <Ionicons
                    name="calendar-outline"
                    size={18}
                    color={Colors.muted}
                  />
                </Pressable>
                {pickerOpen ? (
                  <DateTimePicker
                    value={value ?? new Date()}
                    mode="date"
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    onChange={(event, selected) => {
                      // Android dismisses on tap outside or pick; iOS stays open
                      if (Platform.OS !== "ios") setPickerOpen(false);
                      if (event.type === "set" && selected) {
                        onChange(selected);
                      }
                    }}
                  />
                ) : null}
                {Platform.OS === "ios" && pickerOpen ? (
                  <Pressable
                    className="bg-teal rounded-xl py-2 mt-2 items-center"
                    onPress={() => setPickerOpen(false)}
                  >
                    <Text className="text-white font-medium">Done</Text>
                  </Pressable>
                ) : null}
              </>
            )}
          />
          {errors.start_date ? (
            <Text className="text-overdue text-xs mt-1">
              {errors.start_date?.message as string}
            </Text>
          ) : null}
        </View>

        {renderField("notes", "Notes (optional)", {
          placeholder: "Any additional details...",
          multiline: true,
        })}

        {/* ── Loan Summary Preview ────────────────────────────────────── */}
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
              <Text className="text-base font-bold text-teal">
                {formatCurrency(preview.totalAmount)}
              </Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-xs text-muted">Due on</Text>
              <Text className="text-sm text-navy">
                {format(preview.dueDate, "dd MMM yyyy")}
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
            <Text className="text-white font-semibold text-base">Add Loan</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
