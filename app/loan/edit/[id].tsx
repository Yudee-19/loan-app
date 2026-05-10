/**
 * app/loan/edit/[id].tsx
 *
 * Edit loan form — pre-fills current loan data and updates on submit.
 *
 * If the admin changes principal, rate, tenure, start_date, or due_date,
 * `loanStore.updateLoan` will:
 *   1. Cancel and delete the existing unpaid bullet payment.
 *   2. Recompute the bullet total.
 *   3. Insert a fresh single-row payment schedule using loans.due_date.
 *   4. Reschedule the local notification.
 */

import React, { useEffect, useState } from "react";
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
import { format, parseISO } from "date-fns";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";

import { useLoanStore } from "@/stores/loanStore";
import { useAuthStore } from "@/stores/authStore";
import { useCustomerStore } from "@/stores/customerStore";
import { calculateBulletPayment } from "@/lib/calculations";
import {
  Colors,
  MAX_PAYMENT_DAY,
  PAYMENT_MONTH_OPTIONS,
  formatCurrency,
} from "@/lib/constants";

// ─── Helpers ────────────────────────────────────────────────────────────────

function computeDefaultDueDate(start: Date, months: number): Date {
  const day = Math.min(start.getDate(), MAX_PAYMENT_DAY);
  return new Date(start.getFullYear(), start.getMonth() + months, day);
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// ─── Validation Schema (mirrors add form) ────────────────────────────────────

const editSchema = z.object({
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
    .number({ invalid_type_error: "Enter a tenure in months" })
    .int("Whole months only")
    .positive("Must be at least 1"),
  start_date: z.date({ invalid_type_error: "Pick a start date" }),
  due_date: z.date({ invalid_type_error: "Pick a due date" }),
  item_type: z.string().optional(),
  notes: z.string().optional(),
});

type EditFormData = z.infer<typeof editSchema>;

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function EditLoanScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { currentLoan, fetchLoanDetail, updateLoan } = useLoanStore();
  const user = useAuthStore((s) => s.user);
  const settings = useAuthStore((s) => s.settings);

  const fetchCustomerProfile = useCustomerStore((s) => s.fetchCustomerProfile);
  const customer = useCustomerStore((s) => s.currentCustomer);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startPickerOpen, setStartPickerOpen] = useState(false);
  const [duePickerOpen, setDuePickerOpen] = useState(false);

  // Custom-tenure input mode and due-date auto-tracking flag.
  const [customTenureMode, setCustomTenureMode] = useState(false);
  const [dueDateAuto, setDueDateAuto] = useState(false);

  useEffect(() => {
    if (id) fetchLoanDetail(id);
  }, [id]);

  useEffect(() => {
    if (currentLoan?.customer_id) {
      fetchCustomerProfile(currentLoan.customer_id);
    }
  }, [currentLoan?.customer_id, fetchCustomerProfile]);

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<EditFormData>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      principal_amount: "" as any,
      rate_of_interest: "" as any,
      tenure_months: undefined as any,
      start_date: new Date(),
      due_date: new Date(),
      item_type: "",
      notes: "",
    },
  });

  // Pre-fill form once loan data loads
  useEffect(() => {
    if (!currentLoan) return;

    const isPreset = (
      PAYMENT_MONTH_OPTIONS as readonly number[]
    ).includes(currentLoan.tenure_months);
    setCustomTenureMode(!isPreset);

    reset({
      principal_amount: String(currentLoan.principal_amount) as any,
      rate_of_interest: String(currentLoan.rate_of_interest) as any,
      tenure_months: currentLoan.tenure_months as any,
      start_date: parseISO(currentLoan.start_date),
      due_date: parseISO(currentLoan.due_date),
      item_type: currentLoan.item_type ?? "",
      notes: currentLoan.notes ?? "",
    });

    // If the saved due_date matches start + tenure exactly, treat it as auto;
    // otherwise the admin had overridden it, so keep manual mode.
    const computedDefault = computeDefaultDueDate(
      parseISO(currentLoan.start_date),
      currentLoan.tenure_months,
    );
    setDueDateAuto(sameDay(computedDefault, parseISO(currentLoan.due_date)));
  }, [currentLoan]);

  const watchPrincipal = watch("principal_amount");
  const watchRate = watch("rate_of_interest");
  const watchTenure = watch("tenure_months");
  const watchStartDate = watch("start_date");
  const watchDueDate = watch("due_date");

  // Auto-sync due date with start + tenure while admin hasn't overridden it
  useEffect(() => {
    if (!dueDateAuto) return;
    const m = Number(watchTenure);
    if (!watchStartDate || !m || m <= 0) return;
    const auto = computeDefaultDueDate(watchStartDate, m);
    if (!watchDueDate || !sameDay(watchDueDate, auto)) {
      setValue("due_date", auto, { shouldValidate: true });
    }
  }, [watchStartDate, watchTenure, dueDateAuto, setValue, watchDueDate]);

  const preview = (() => {
    const p = Number(watchPrincipal) || 0;
    const r = Number(watchRate) || 0;
    const m = Number(watchTenure) || 0;
    if (p > 0 && m > 0 && watchDueDate) {
      const result = calculateBulletPayment(p, r, m);
      return { ...result, dueDate: watchDueDate };
    }
    return null;
  })();

  const onSubmit = async (data: EditFormData) => {
    if (!user || !id || !currentLoan) return;
    setLoading(true);
    setError(null);

    try {
      const { totalAmount } = calculateBulletPayment(
        data.principal_amount,
        data.rate_of_interest,
        data.tenure_months,
      );

      await updateLoan(
        id,
        {
          principal_amount: data.principal_amount,
          rate_of_interest: data.rate_of_interest,
          payment_day_of_month: Math.min(
            data.start_date.getDate(),
            MAX_PAYMENT_DAY,
          ),
          start_date: format(data.start_date, "yyyy-MM-dd"),
          due_date: format(data.due_date, "yyyy-MM-dd"),
          tenure_months: data.tenure_months,
          remaining_amount: totalAmount - currentLoan.total_paid,
          item_type: data.item_type?.trim() || null,
          notes: data.notes?.trim() || null,
        },
        user.id,
        settings?.reminder_days_before ?? 1,
      );

      router.back();
    } catch (err: any) {
      setError(err.message ?? "Failed to update loan.");
    } finally {
      setLoading(false);
    }
  };

  const renderField = (
    name: keyof EditFormData,
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

  if (!currentLoan) {
    return (
      <View className="flex-1 justify-center items-center bg-surface">
        <ActivityIndicator size="large" color={Colors.teal} />
      </View>
    );
  }

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
        {/* ── Customer chip (read-only) ───────────────────────────────── */}
        <View className="flex-row items-center bg-white rounded-xl px-4 py-3 mb-6 border border-gray-200">
          <Ionicons name="person-circle-outline" size={28} color={Colors.teal} />
          <View className="flex-1 ml-3">
            <Text className="text-xs text-muted">For customer</Text>
            <Text className="text-base font-semibold text-navy" numberOfLines={1}>
              {customer?.name ?? "Loading…"}
            </Text>
          </View>
        </View>

        {renderField("principal_amount", "Principal Amount (₹)", {
          placeholder: "e.g. 50000",
          keyboardType: "numeric",
        })}
        {renderField("rate_of_interest", "Monthly Interest Rate (%)", {
          placeholder: "e.g. 10",
          keyboardType: "numeric",
        })}

        {/* ── Tenure (segmented + Custom) ─────────────────────────────── */}
        <View className="mb-4">
          <Text className="text-sm font-medium text-navy mb-1">Tenure</Text>
          <Controller
            control={control}
            name="tenure_months"
            render={({ field: { onChange, value } }) => {
              return (
                <>
                  <View className="flex-row gap-2">
                    {PAYMENT_MONTH_OPTIONS.map((m) => {
                      const selected = !customTenureMode && value === m;
                      return (
                        <Pressable
                          key={m}
                          className={`flex-1 py-3 rounded-xl border items-center ${
                            selected
                              ? "bg-teal border-teal"
                              : "bg-white border-gray-200"
                          }`}
                          onPress={() => {
                            setCustomTenureMode(false);
                            onChange(m);
                          }}
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
                    <Pressable
                      className={`flex-1 py-3 rounded-xl border items-center ${
                        customTenureMode
                          ? "bg-teal border-teal"
                          : "bg-white border-gray-200"
                      }`}
                      onPress={() => setCustomTenureMode(true)}
                    >
                      <Text
                        className={`font-semibold ${
                          customTenureMode ? "text-white" : "text-navy"
                        }`}
                      >
                        Custom
                      </Text>
                    </Pressable>
                  </View>

                  {customTenureMode ? (
                    <View className="mt-3">
                      <TextInput
                        className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-navy"
                        placeholder="Enter months (e.g. 6)"
                        placeholderTextColor={Colors.muted}
                        keyboardType="numeric"
                        value={value !== undefined ? String(value) : ""}
                        onChangeText={(text) => {
                          const n = parseInt(text, 10);
                          onChange(isNaN(n) ? (undefined as any) : n);
                        }}
                      />
                    </View>
                  ) : null}
                </>
              );
            }}
          />
          {errors.tenure_months ? (
            <Text className="text-overdue text-xs mt-1">
              {errors.tenure_months?.message as string}
            </Text>
          ) : null}
        </View>

        {/* ── Start Date ──────────────────────────────────────────────── */}
        <View className="mb-4">
          <Text className="text-sm font-medium text-navy mb-1">Start Date</Text>
          <Controller
            control={control}
            name="start_date"
            render={({ field: { onChange, value } }) => (
              <>
                <Pressable
                  className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex-row items-center justify-between"
                  onPress={() => setStartPickerOpen(true)}
                >
                  <Text className="text-navy">
                    {value ? format(value, "dd MMM yyyy") : "Pick a start date"}
                  </Text>
                  <Ionicons
                    name="calendar-outline"
                    size={18}
                    color={Colors.muted}
                  />
                </Pressable>
                {startPickerOpen ? (
                  <DateTimePicker
                    value={value ?? new Date()}
                    mode="date"
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    onChange={(event, selected) => {
                      if (Platform.OS !== "ios") setStartPickerOpen(false);
                      if (event.type === "set" && selected) onChange(selected);
                    }}
                  />
                ) : null}
                {Platform.OS === "ios" && startPickerOpen ? (
                  <Pressable
                    className="bg-teal rounded-xl py-2 mt-2 items-center"
                    onPress={() => setStartPickerOpen(false)}
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

        {/* ── Due Date ────────────────────────────────────────────────── */}
        <View className="mb-4">
          <View className="flex-row justify-between items-center mb-1">
            <Text className="text-sm font-medium text-navy">Due Date</Text>
            {!dueDateAuto ? (
              <Pressable
                onPress={() => {
                  setDueDateAuto(true);
                  const m = Number(watchTenure);
                  if (watchStartDate && m > 0) {
                    setValue(
                      "due_date",
                      computeDefaultDueDate(watchStartDate, m),
                      { shouldValidate: true },
                    );
                  }
                }}
              >
                <Text className="text-teal text-xs font-medium">
                  Reset to default
                </Text>
              </Pressable>
            ) : (
              <Text className="text-xs text-muted">Auto: start + tenure</Text>
            )}
          </View>
          <Controller
            control={control}
            name="due_date"
            render={({ field: { onChange, value } }) => (
              <>
                <Pressable
                  className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex-row items-center justify-between"
                  onPress={() => setDuePickerOpen(true)}
                >
                  <Text className="text-navy">
                    {value ? format(value, "dd MMM yyyy") : "Pick a due date"}
                  </Text>
                  <Ionicons
                    name="calendar-outline"
                    size={18}
                    color={Colors.muted}
                  />
                </Pressable>
                {duePickerOpen ? (
                  <DateTimePicker
                    value={value ?? new Date()}
                    mode="date"
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    onChange={(event, selected) => {
                      if (Platform.OS !== "ios") setDuePickerOpen(false);
                      if (event.type === "set" && selected) {
                        setDueDateAuto(false);
                        onChange(selected);
                      }
                    }}
                  />
                ) : null}
                {Platform.OS === "ios" && duePickerOpen ? (
                  <Pressable
                    className="bg-teal rounded-xl py-2 mt-2 items-center"
                    onPress={() => setDuePickerOpen(false)}
                  >
                    <Text className="text-white font-medium">Done</Text>
                  </Pressable>
                ) : null}
              </>
            )}
          />
          {errors.due_date ? (
            <Text className="text-overdue text-xs mt-1">
              {errors.due_date?.message as string}
            </Text>
          ) : null}
          <Text className="text-xs text-muted mt-1">
            Last date you'll accept the bullet payment. Doesn't change the
            tenure.
          </Text>
        </View>

        {renderField("item_type", "Mortgage Item (optional)", {
          placeholder: "e.g. Gold chain, Honda Activa",
        })}

        {renderField("notes", "Notes (optional)", {
          placeholder: "Any additional details...",
          multiline: true,
        })}

        {/* ── Updated Summary ───────────────────────────────────────── */}
        {preview ? (
          <View className="bg-white rounded-xl p-4 mb-6 border border-gray-100">
            <Text className="text-sm font-semibold text-navy mb-2">
              Updated Summary
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

        {error ? (
          <View className="bg-red-50 border border-overdue rounded-xl p-3 mb-4">
            <Text className="text-overdue text-sm">{error}</Text>
          </View>
        ) : null}

        <Pressable
          className="bg-teal rounded-xl py-4 items-center"
          onPress={handleSubmit(onSubmit)}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white font-semibold text-base">
              Save Changes
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
