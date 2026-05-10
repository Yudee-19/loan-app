/**
 * components/CustomerForm.tsx
 *
 * Reusable form for adding or editing a customer.
 * Uses React Hook Form + Zod for validation; matches the visual style
 * of the existing loan add/edit forms.
 */

import React from "react";
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
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Colors } from "@/lib/constants";
import type { CustomerInsert, Customer } from "@/types";

// ─── Validation Schema ───────────────────────────────────────────────────────

const customerSchema = z.object({
    name: z.string().min(1, "Name is required"),
    type: z.enum(["credit", "debit"], {
        errorMap: () => ({ message: "Pick loan taker or loan giver" }),
    }),
    fathers_name: z.string().optional(),
    email: z
        .string()
        .optional()
        .refine(
            (v) => !v || /^\S+@\S+\.\S+$/.test(v),
            "Enter a valid email address",
        ),
    phone: z.string().optional(),
    address: z.string().optional(),
    caste: z.string().optional(),
    remarks: z.string().optional(),
});

type CustomerFormData = z.infer<typeof customerSchema>;

// ─── Props ───────────────────────────────────────────────────────────────────

interface CustomerFormProps {
    initial?: Customer | null;
    ctaLabel: string;
    submitting?: boolean;
    serverError?: string | null;
    onSubmit: (data: CustomerInsert) => void | Promise<void>;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function CustomerForm({
    initial,
    ctaLabel,
    submitting,
    serverError,
    onSubmit,
}: CustomerFormProps) {
    const {
        control,
        handleSubmit,
        formState: { errors },
    } = useForm<CustomerFormData>({
        resolver: zodResolver(customerSchema),
        defaultValues: {
            name: initial?.name ?? "",
            type: initial?.type ?? ("debit" as const),
            fathers_name: initial?.fathers_name ?? "",
            email: initial?.email ?? "",
            phone: initial?.phone ?? "",
            address: initial?.address ?? "",
            caste: initial?.caste ?? "",
            remarks: initial?.remarks ?? "",
        },
    });

    const handle = handleSubmit((data) => {
        const insert: CustomerInsert = {
            name: data.name.trim(),
            type: data.type,
            fathers_name: data.fathers_name?.trim() || null,
            email: data.email?.trim() || null,
            phone: data.phone?.trim() || null,
            address: data.address?.trim() || null,
            caste: data.caste?.trim() || null,
            remarks: data.remarks?.trim() || null,
        };
        return onSubmit(insert);
    });

    const renderField = (
        name: keyof CustomerFormData,
        label: string,
        options?: {
            placeholder?: string;
            keyboardType?: "default" | "email-address" | "phone-pad";
            multiline?: boolean;
            autoCapitalize?: "none" | "words" | "sentences";
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
                        autoCapitalize={options?.autoCapitalize ?? "sentences"}
                        textAlignVertical={
                            options?.multiline ? "top" : "center"
                        }
                        onBlur={onBlur}
                        onChangeText={onChange}
                        value={value ?? ""}
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
                {/* ── Customer type selector (locked once chosen) ─────────────── */}
                <View className="mb-4">
                    <Text className="text-sm font-medium text-navy mb-1">
                        Customer Type
                    </Text>
                    <Text className="text-xs text-muted mb-2">
                        All loans against this customer will be of this type.
                    </Text>
                    <Controller
                        control={control}
                        name="type"
                        render={({ field: { onChange, value } }) => (
                            <View className="flex-row gap-2">
                                {(
                                    [
                                        {
                                            key: "credit",
                                            label: "Loan Taken",
                                            color: Colors.credit,
                                        },
                                        {
                                            key: "debit",
                                            label: "Loan Given",
                                            color: Colors.debit,
                                        },
                                    ] as const
                                ).map((opt) => {
                                    const selected = value === opt.key;
                                    return (
                                        <Pressable
                                            key={opt.key}
                                            className="flex-1 py-3 rounded-xl border items-center"
                                            style={{
                                                backgroundColor: selected
                                                    ? opt.color
                                                    : "white",
                                                borderColor: selected
                                                    ? opt.color
                                                    : "#e5e7eb",
                                            }}
                                            onPress={() => onChange(opt.key)}
                                        >
                                            <Text
                                                className="font-semibold"
                                                style={{
                                                    color: selected
                                                        ? "white"
                                                        : Colors.navy,
                                                }}
                                            >
                                                {opt.label}
                                            </Text>
                                            <Text
                                                className="text-[11px] mt-0.5"
                                                style={{
                                                    color: selected
                                                        ? "rgba(255,255,255,0.85)"
                                                        : Colors.muted,
                                                }}
                                            >
                                                {opt.key === "credit"
                                                    ? "We take loan from them"
                                                    : "We give loan to them"}
                                            </Text>
                                        </Pressable>
                                    );
                                })}
                            </View>
                        )}
                    />
                    {errors.type ? (
                        <Text className="text-overdue text-xs mt-1">
                            {errors.type?.message as string}
                        </Text>
                    ) : null}
                </View>

                {renderField("name", "Name", {
                    placeholder: "Full name",
                    autoCapitalize: "words",
                })}
                {renderField("fathers_name", "Father's Name", {
                    placeholder: "Optional",
                    autoCapitalize: "words",
                })}
                {renderField("email", "Email", {
                    placeholder: "person@example.com",
                    keyboardType: "email-address",
                    autoCapitalize: "none",
                })}
                {renderField("phone", "Phone", {
                    placeholder: "+91 98765 43210",
                    keyboardType: "phone-pad",
                })}
                {renderField("address", "Address", {
                    placeholder: "Full address",
                    multiline: true,
                })}
                {renderField("caste", "Caste", { placeholder: "Optional" })}
                {renderField("remarks", "Remarks", {
                    placeholder: "Any additional notes…",
                    multiline: true,
                })}

                {serverError ? (
                    <View className="bg-red-50 border border-overdue rounded-xl p-3 mb-4">
                        <Text className="text-overdue text-sm">
                            {serverError}
                        </Text>
                    </View>
                ) : null}

                <Pressable
                    className="bg-teal rounded-xl py-4 items-center"
                    onPress={handle}
                    disabled={submitting}
                >
                    {submitting ? (
                        <ActivityIndicator color="white" />
                    ) : (
                        <Text className="text-white font-semibold text-base">
                            {ctaLabel}
                        </Text>
                    )}
                </Pressable>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}
