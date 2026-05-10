/**
 * app/(auth)/login.tsx
 *
 * Email + password sign-in screen.
 *
 * Uses React Hook Form + Zod for validation.
 * On success, the root layout's auth gate redirects to (tabs) or (auth)/pin.
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
import { Ionicons } from "@expo/vector-icons";

import { useAuthStore } from "@/stores/authStore";
import { Colors } from "@/lib/constants";

// ─── Validation Schema ───────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginFormData = z.infer<typeof loginSchema>;

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function LoginScreen() {
  const router = useRouter();
  const signIn = useAuthStore((s) => s.signIn);
  const pinRequired = useAuthStore((s) => s.pinRequired);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  /** Submit handler — calls Supabase auth, then navigates directly. */
  const onSubmit = async (data: LoginFormData) => {
    setLoading(true);
    setError(null);
    try {
      await signIn(data.email, data.password);

      // Navigate directly after successful sign-in instead of
      // relying solely on the auth gate effect (avoids timing issues).
      const { pinRequired: needsPin } = useAuthStore.getState();
      if (needsPin) {
        router.replace("/(auth)/pin");
      } else {
        router.replace("/(tabs)/dashboard");
      }
    } catch (err: any) {
      setError(err.message ?? "Sign-in failed. Please try again.");
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
          {/* ── App Title ────────────────────────────────────────────── */}
          <View className="items-center mb-10">
            <Ionicons name="wallet" size={64} color={Colors.teal} />
            <Text className="text-3xl font-bold text-navy mt-3">
              LoanTracker
            </Text>
            <Text className="text-muted text-sm mt-1">
              Track your loans, stay on top of payments
            </Text>
          </View>

          {/* ── Email Field ──────────────────────────────────────────── */}
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

          {/* ── Password Field ───────────────────────────────────────── */}
          <Text className="text-sm font-medium text-navy mb-1">Password</Text>
          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                className="bg-white border border-gray-200 rounded-xl px-4 py-3 mb-1 text-navy"
                placeholder="Enter your password"
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

          {/* ── Error Banner ─────────────────────────────────────────── */}
          {error ? (
            <View className="bg-red-50 border border-overdue rounded-xl p-3 mb-4">
              <Text className="text-overdue text-sm">{error}</Text>
            </View>
          ) : null}

          {/* ── Sign In Button ───────────────────────────────────────── */}
          <Pressable
            className="bg-teal rounded-xl py-4 items-center mt-2"
            onPress={handleSubmit(onSubmit)}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white font-semibold text-base">
                Sign In
              </Text>
            )}
          </Pressable>

          {/* ── Register Link ────────────────────────────────────────── */}
          <Pressable
            className="mt-6 items-center"
            onPress={() => router.push("/(auth)/register")}
          >
            <Text className="text-muted">
              Don't have an account?{" "}
              <Text className="text-teal font-semibold">Sign Up</Text>
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
