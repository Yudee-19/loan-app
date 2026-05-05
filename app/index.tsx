/**
 * app/index.tsx
 *
 * Root index route — the first screen expo-router resolves in production.
 * Redirects immediately based on auth state:
 *   • No session  → login
 *   • Session + PIN required → PIN screen
 *   • Session + no PIN → credit tab
 */

import { Redirect } from "expo-router";
import { useAuthStore } from "@/stores/authStore";

export default function Index() {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const pinRequired = useAuthStore((s) => s.pinRequired);

  // While auth is initializing, render nothing (splash screen is still visible)
  if (loading) return null;

  if (!user) {
    return <Redirect href="/(auth)/welcome" />;
  }

  if (pinRequired) {
    return <Redirect href="/(auth)/pin" />;
  }

  return <Redirect href="/(tabs)/credit" />;
}
