/**
 * app/index.tsx
 *
 * Root index route — the first screen expo-router resolves in production.
 * Redirects immediately based on auth state:
 *   • No session  → welcome
 *   • Session + PIN required → PIN screen
 *   • Session + no PIN → dashboard
 */

import { Redirect } from "expo-router";
import { useAuthStore } from "@/stores/authStore";

export default function Index() {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const pinRequired = useAuthStore((s) => s.pinRequired);

  if (loading) return null;

  if (!user) {
    return <Redirect href="/(auth)/welcome" />;
  }

  if (pinRequired) {
    return <Redirect href="/(auth)/pin" />;
  }

  return <Redirect href="/(tabs)/dashboard" />;
}
