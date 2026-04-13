/**
 * lib/notifications.ts
 *
 * Local push-notification helpers using expo-notifications.
 *
 * We only use **local** scheduled notifications — no FCM / APNs server
 * setup required.  Each payment gets a reminder X days before its due date,
 * and the notification is cancelled once the payment is marked as paid.
 */

import * as Notifications from "expo-notifications";
import { subDays, isBefore, format } from "date-fns";

// ─── Permission & Handler Setup ──────────────────────────────────────────────

/**
 * Request notification permissions from the OS and configure the
 * foreground handler.  Call this once on app startup.
 *
 * @returns `true` if permission was granted, `false` otherwise.
 */
export async function registerForNotifications(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== "granted") return false;

  // Configure how notifications appear when the app is in the foreground
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });

  return true;
}

// ─── Schedule a Payment Reminder ─────────────────────────────────────────────

interface ScheduleParams {
  paymentId: string;
  loanType: "credit" | "debit";
  personName: string;
  amount: number;
  dueDate: Date;
  /** How many days before the due date to fire the reminder */
  reminderDaysBefore: number;
}

/**
 * Schedule a local notification for an upcoming payment.
 *
 * - Credit loans  → "Payment Due: ₹X"    (you owe someone)
 * - Debit loans   → "Payment Expected: ₹X" (someone owes you)
 *
 * @returns The notification identifier (store it so you can cancel later),
 *          or `null` if the trigger date is already in the past.
 */
export async function schedulePaymentReminder(
  params: ScheduleParams
): Promise<string | null> {
  const {
    paymentId,
    loanType,
    personName,
    amount,
    dueDate,
    reminderDaysBefore,
  } = params;

  // Calculate when the reminder should fire
  const triggerDate = subDays(dueDate, reminderDaysBefore);

  // Don't schedule if the trigger date has already passed
  if (isBefore(triggerDate, new Date())) return null;

  // Contextual title & body depending on loan direction
  const title =
    loanType === "credit"
      ? `Payment Due: ₹${amount}`
      : `Payment Expected: ₹${amount}`;

  const body =
    loanType === "credit"
      ? `You need to pay ₹${amount} to ${personName} on ${format(dueDate, "dd MMM yyyy")}`
      : `₹${amount} is due from ${personName} on ${format(dueDate, "dd MMM yyyy")}`;

  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: { paymentId, loanType },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
    },
  });

  return notificationId;
}

// ─── Cancel a Notification ───────────────────────────────────────────────────

/**
 * Cancel a previously scheduled notification by its identifier.
 * Call this when a payment is marked as paid or a loan is deleted.
 */
export async function cancelNotification(
  notificationId: string
): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(notificationId);
}

/**
 * Cancel ALL scheduled notifications.
 * Useful when the user logs out or deletes their account.
 */
export async function cancelAllNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
