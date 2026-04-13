/**
 * app/(auth)/register.tsx
 *
 * Account creation screen — email + password sign-up.
 *
 * On success a default `user_settings` row is created (done inside the
 * auth store's signUp action) and the root layout redirects to (tabs).
 */

import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { useAuthStore } from "@/stores/authStore";
import { Colors } from "@/lib/constants";

// ─── Validation Schema ───────────────────────────────────────────────────────

const registerSchema = z
  .object({
    email: z.string().email("Please enter a valid email"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

type RegisterFormData = z.infer<typeof registerSchema>;

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function RegisterScreen() {
  const router = useRouter();
  const signUp = useAuthStore((s) => s.signUp);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: "", password: "", confirmPassword: "" },
  });

  /** Submit handler — calls Supabase auth signUp, then navigates directly. */
  const onSubmit = async (data: RegisterFormData) => {
    setLoading(true);
    setError(null);
    try {
      await signUp(data.email, data.password);
      // Navigate directly to tabs after successful registration
      router.replace("/(tabs)/credit");
    } catch (err: any) {
      setError(err.message ?? "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1"
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="px-6 py-10">
          <Text className="text-2xl font-bold text-navy mb-1">
            Create Account
          </Text>
          <Text className="text-muted mb-8">
            Sign up to start tracking your loans.
          </Text>

          {/* ── Email ────────────────────────────────────────────────── */}
          <Text className="text-sm font-medium text-navy mb-1">Email</Text>
          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                className="bg-white border border-gray-200 rounded-xl px-4 py-3 mb-1 text-navy"
                placeholder="you@example.com"
                placeholderTextColor={Colors.muted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
              />
            )}
          />
          {errors.email ? (
            <Text className="text-overdue text-xs mb-3">
              {errors.email.message}
            </Text>
          ) : (
            <View className="mb-3" />
          )}

          {/* ── Password ─────────────────────────────────────────────── */}
          <Text className="text-sm font-medium text-navy mb-1">Password</Text>
          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                className="bg-white border border-gray-200 rounded-xl px-4 py-3 mb-1 text-navy"
                placeholder="At least 6 characters"
                placeholderTextColor={Colors.muted}
                secureTextEntry
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
              />
            )}
          />
          {errors.password ? (
            <Text className="text-overdue text-xs mb-3">
              {errors.password.message}
            </Text>
          ) : (
            <View className="mb-3" />
          )}

          {/* ── Confirm Password ─────────────────────────────────────── */}
          <Text className="text-sm font-medium text-navy mb-1">
            Confirm Password
          </Text>
          <Controller
            control={control}
            name="confirmPassword"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                className="bg-white border border-gray-200 rounded-xl px-4 py-3 mb-1 text-navy"
                placeholder="Re-enter your password"
                placeholderTextColor={Colors.muted}
                secureTextEntry
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
              />
            )}
          />
          {errors.confirmPassword ? (
            <Text className="text-overdue text-xs mb-3">
              {errors.confirmPassword.message}
            </Text>
          ) : (
            <View className="mb-3" />
          )}

          {/* ── Error Banner ─────────────────────────────────────────── */}
          {error ? (
            <View className="bg-red-50 border border-overdue rounded-xl p-3 mb-4">
              <Text className="text-overdue text-sm">{error}</Text>
            </View>
          ) : null}

          {/* ── Sign Up Button ───────────────────────────────────────── */}
          <Pressable
            className="bg-teal rounded-xl py-4 items-center mt-2"
            onPress={handleSubmit(onSubmit)}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white font-semibold text-base">
                Create Account
              </Text>
            )}
          </Pressable>

          {/* ── Back to Login ────────────────────────────────────────── */}
          <Pressable
            className="mt-6 items-center"
            onPress={() => router.back()}
          >
            <Text className="text-muted">
              Already have an account?{" "}
              <Text className="text-teal font-semibold">Sign In</Text>
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
