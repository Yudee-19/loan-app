/**
 * app/loan/add.tsx
 *
 * Add a new loan for a specific customer.
 *
 * Required query params:
 *   customer_id  — UUID of the customer this loan belongs to
 *   type         — 'credit' (user TOOK) | 'debit' (user GAVE)
 *
 * Form covers principal, monthly rate, tenure (1/2/3 months or custom),
 * start date, due date (admin-editable acceptance deadline), item type
 * (mortgage description, free text), and notes.
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
import { format } from "date-fns";
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
import type { LoanInsert } from "@/types";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Compute the default due date: start_date + tenure months on the same DOM,
 *  capped at the 28th to avoid Feb edge cases. */
function computeDefaultDueDate(start: Date, months: number): Date {
    const day = Math.min(start.getDate(), MAX_PAYMENT_DAY);
    return new Date(start.getFullYear(), start.getMonth() + months, day);
}

/** Return true iff two dates point at the same calendar day. */
function sameDay(a: Date, b: Date): boolean {
    return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    );
}

// ─── Validation Schema ───────────────────────────────────────────────────────

const loanSchema = z.object({
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

type LoanFormData = z.infer<typeof loanSchema>;

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function AddLoanScreen() {
    const router = useRouter();
    const { type, customer_id } = useLocalSearchParams<{
        type?: "credit" | "debit";
        customer_id?: string;
    }>();
    const loanType = type ?? "credit";

    const addLoan = useLoanStore((s) => s.addLoan);
    const user = useAuthStore((s) => s.user);
    const settings = useAuthStore((s) => s.settings);

    const fetchCustomerProfile = useCustomerStore(
        (s) => s.fetchCustomerProfile,
    );
    const customer = useCustomerStore((s) => s.currentCustomer);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [startPickerOpen, setStartPickerOpen] = useState(false);
    const [duePickerOpen, setDuePickerOpen] = useState(false);

    // True while the due date is auto-tracked off start_date + tenure.
    // Flips to false the moment the admin edits the due date manually.
    const [dueDateAuto, setDueDateAuto] = useState(true);

    // True when admin chose "Custom" tenure. Reveals a numeric input.
    const [customTenureMode, setCustomTenureMode] = useState(false);

    useEffect(() => {
        if (customer_id) fetchCustomerProfile(customer_id);
    }, [customer_id, fetchCustomerProfile]);

    const today = new Date();
    const defaultDue = computeDefaultDueDate(today, 1);

    const {
        control,
        handleSubmit,
        watch,
        setValue,
        formState: { errors },
    } = useForm<LoanFormData>({
        resolver: zodResolver(loanSchema),
        defaultValues: {
            principal_amount: "" as any,
            rate_of_interest: "" as any,
            tenure_months: undefined as any,
            start_date: today,
            due_date: defaultDue,
            item_type: "",
            notes: "",
        },
    });

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

    const onSubmit = async (data: LoanFormData) => {
        if (!user || !customer_id) return;
        setLoading(true);
        setError(null);

        try {
            const { totalAmount } = calculateBulletPayment(
                data.principal_amount,
                data.rate_of_interest,
                data.tenure_months,
            );

            const paymentDay = Math.min(
                data.start_date.getDate(),
                MAX_PAYMENT_DAY,
            );

            const loanInsert: LoanInsert = {
                customer_id,
                type: loanType,
                principal_amount: data.principal_amount,
                rate_of_interest: data.rate_of_interest,
                payment_day_of_month: paymentDay,
                start_date: format(data.start_date, "yyyy-MM-dd"),
                due_date: format(data.due_date, "yyyy-MM-dd"),
                tenure_months: data.tenure_months,
                remaining_amount: totalAmount,
                item_type: data.item_type?.trim() || null,
                notes: data.notes?.trim() || null,
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

    if (!customer_id) {
        return (
            <View className="flex-1 items-center justify-center bg-surface px-6">
                <Text className="text-overdue text-center">
                    Missing customer. Please open this form from a customer
                    profile.
                </Text>
            </View>
        );
    }

    // Reusable text-field renderer
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
                        textAlignVertical={
                            options?.multiline ? "top" : "center"
                        }
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
                    className="px-3 py-1.5 rounded-full self-start mb-3"
                    style={{
                        backgroundColor:
                            loanType === "credit"
                                ? Colors.credit
                                : Colors.debit,
                    }}
                >
                    <Text className="text-white text-sm font-medium">
                        {loanType === "credit"
                            ? "Credit (Taken)"
                            : "Debit (Given)"}
                    </Text>
                </View>

                {/* ── Customer chip (read-only) ───────────────────────────────── */}
                <View className="flex-row items-center bg-white rounded-xl px-4 py-3 mb-6 border border-gray-200">
                    <Ionicons
                        name="person-circle-outline"
                        size={28}
                        color={Colors.teal}
                    />
                    <View className="flex-1 ml-3">
                        <Text className="text-xs text-muted">For customer</Text>
                        <Text
                            className="text-base font-semibold text-navy"
                            numberOfLines={1}
                        >
                            {customer?.name ?? "Loading…"}
                        </Text>
                    </View>
                </View>

                {/* ── Form Fields ─────────────────────────────────────────────── */}
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
                    <Text className="text-sm font-medium text-navy mb-1">
                        Tenure
                    </Text>
                    <Controller
                        control={control}
                        name="tenure_months"
                        render={({ field: { onChange, value } }) => {
                            const isPreset =
                                value !== undefined &&
                                (
                                    PAYMENT_MONTH_OPTIONS as readonly number[]
                                ).includes(Number(value));

                            return (
                                <>
                                    <View className="flex-row gap-2">
                                        {PAYMENT_MONTH_OPTIONS.map((m) => {
                                            const selected =
                                                !customTenureMode &&
                                                value === m;
                                            return (
                                                <Pressable
                                                    key={m}
                                                    className={`flex-1 py-3 rounded-xl border items-center ${
                                                        selected
                                                            ? "bg-teal border-teal"
                                                            : "bg-white border-gray-200"
                                                    }`}
                                                    onPress={() => {
                                                        setCustomTenureMode(
                                                            false,
                                                        );
                                                        onChange(m);
                                                    }}
                                                >
                                                    <Text
                                                        className={`font-semibold ${
                                                            selected
                                                                ? "text-white"
                                                                : "text-navy"
                                                        }`}
                                                    >
                                                        {m}{" "}
                                                        {m === 1
                                                            ? "Month"
                                                            : "Months"}
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
                                            onPress={() => {
                                                setCustomTenureMode(true);
                                                if (isPreset)
                                                    onChange(undefined as any);
                                            }}
                                        >
                                            <Text
                                                className={`font-semibold ${
                                                    customTenureMode
                                                        ? "text-white"
                                                        : "text-navy"
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
                                                placeholderTextColor={
                                                    Colors.muted
                                                }
                                                keyboardType="numeric"
                                                value={
                                                    value !== undefined
                                                        ? String(value)
                                                        : ""
                                                }
                                                onChangeText={(text) => {
                                                    const n = parseInt(
                                                        text,
                                                        10,
                                                    );
                                                    onChange(
                                                        isNaN(n)
                                                            ? (undefined as any)
                                                            : n,
                                                    );
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
                    <Text className="text-sm font-medium text-navy mb-1">
                        Start Date
                    </Text>
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
                                {startPickerOpen ? (
                                    <DateTimePicker
                                        value={value ?? new Date()}
                                        mode="date"
                                        display={
                                            Platform.OS === "ios"
                                                ? "spinner"
                                                : "default"
                                        }
                                        onChange={(event, selected) => {
                                            if (Platform.OS !== "ios")
                                                setStartPickerOpen(false);
                                            if (
                                                event.type === "set" &&
                                                selected
                                            )
                                                onChange(selected);
                                        }}
                                    />
                                ) : null}
                                {Platform.OS === "ios" && startPickerOpen ? (
                                    <Pressable
                                        className="bg-teal rounded-xl py-2 mt-2 items-center"
                                        onPress={() =>
                                            setStartPickerOpen(false)
                                        }
                                    >
                                        <Text className="text-white font-medium">
                                            Done
                                        </Text>
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
                        <Text className="text-sm font-medium text-navy">
                            Due Date
                        </Text>
                        {!dueDateAuto ? (
                            <Pressable
                                onPress={() => {
                                    setDueDateAuto(true);
                                    const m = Number(watchTenure);
                                    if (watchStartDate && m > 0) {
                                        setValue(
                                            "due_date",
                                            computeDefaultDueDate(
                                                watchStartDate,
                                                m,
                                            ),
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
                            <Text className="text-xs text-muted">
                                Auto: start + tenure
                            </Text>
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
                                        {value
                                            ? format(value, "dd MMM yyyy")
                                            : "Pick a due date"}
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
                                        display={
                                            Platform.OS === "ios"
                                                ? "spinner"
                                                : "default"
                                        }
                                        onChange={(event, selected) => {
                                            if (Platform.OS !== "ios")
                                                setDuePickerOpen(false);
                                            if (
                                                event.type === "set" &&
                                                selected
                                            ) {
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
                                        <Text className="text-white font-medium">
                                            Done
                                        </Text>
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
                        Last date you'll accept the bullet payment. Doesn't
                        change the tenure.
                    </Text>
                </View>

                {renderField("item_type", "Item (optional)", {
                    placeholder: "e.g. Gold, Silver",
                })}

                {renderField("notes", "Notes (optional)", {
                    placeholder: "Any additional details...",
                    multiline: true,
                })}

                {preview ? (
                    <View className="bg-white rounded-xl p-4 mb-6 border border-gray-100">
                        <Text className="text-sm font-semibold text-navy mb-2">
                            Loan Summary
                        </Text>
                        <View className="flex-row justify-between mb-1">
                            <Text className="text-xs text-muted">
                                Total Interest
                            </Text>
                            <Text className="text-sm text-navy">
                                {formatCurrency(preview.totalInterest)}
                            </Text>
                        </View>
                        <View className="flex-row justify-between mb-1">
                            <Text className="text-xs text-muted">
                                Total Repayable
                            </Text>
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
                            Add Loan
                        </Text>
                    )}
                </Pressable>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}
