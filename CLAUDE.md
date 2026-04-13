# LoanTracker — Claude Code Project Guide

## Project Overview

**LoanTracker** is a mobile app for a money lender / borrower who manages high-volume loans — both taken (Credit) and given (Debit). The app tracks principal, interest rates, monthly payment schedules, and sends push notifications for upcoming and overdue payments. Built with **React Native (Expo SDK 54)** and **Supabase** (auth, database, edge functions).

> **Golden rule:** No third-party payment APIs. Everything — auth, data, notifications — lives in Supabase + Expo's local notification system.

---

## Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Framework | React Native with Expo SDK 54 | Managed workflow, no bare |
| Navigation | Expo Router (file-based) | Use `(tabs)` layout for Credit / Debit |
| State | Zustand | Lightweight, no boilerplate |
| Backend / DB | Supabase (PostgreSQL) | Auth + database + edge functions |
| Auth | Supabase Auth | Email/password + optional PIN lock |
| Notifications | expo-notifications | Local scheduled notifications (no FCM/APNs setup needed for local) |
| Styling | NativeWind v4 (TailwindCSS) | Utility-first styling for RN |
| Forms | React Hook Form + Zod | Validation for loan entry forms |
| Date Handling | date-fns | Lightweight date math |

---

## Architecture & Folder Structure

```
loan-tracker/
├── app/                          # Expo Router file-based routing
│   ├── _layout.tsx               # Root layout — auth gate + providers
│   ├── (auth)/
│   │   ├── _layout.tsx
│   │   ├── login.tsx             # Email/password login
│   │   ├── register.tsx          # Sign up
│   │   └── pin.tsx               # PIN lock screen (after login)
│   ├── (tabs)/
│   │   ├── _layout.tsx           # Tab navigator — Credit & Debit tabs
│   │   ├── credit.tsx            # List of loans TAKEN (user owes)
│   │   └── debit.tsx             # List of loans GIVEN (user is owed)
│   ├── loan/
│   │   ├── add.tsx               # Add new loan (receives ?type=credit|debit)
│   │   ├── [id].tsx              # Loan detail — payment schedule, mark done
│   │   └── edit/[id].tsx         # Edit loan
│   └── settings.tsx              # PIN management, logout
├── components/
│   ├── LoanCard.tsx              # Card shown in credit/debit lists
│   ├── PaymentRow.tsx            # Single payment row with "Mark Done" button
│   ├── EmptyState.tsx            # Empty list placeholder
│   ├── FAB.tsx                   # Floating action button for "Add Loan"
│   └── PinInput.tsx              # 4-digit PIN entry component
├── lib/
│   ├── supabase.ts               # Supabase client init (with expo-secure-store for session)
│   ├── notifications.ts          # Schedule/cancel local notifications
│   ├── calculations.ts           # Interest + EMI + remaining balance math
│   └── constants.ts              # App-wide constants
├── stores/
│   ├── authStore.ts              # Auth state (user, session, pin)
│   └── loanStore.ts              # Loans + payments state, Supabase sync
├── types/
│   └── index.ts                  # TypeScript types for Loan, Payment, etc.
├── supabase/
│   ├── migrations/
│   │   └── 001_initial_schema.sql
│   └── seed.sql                  # Optional test data
├── assets/
├── app.json
├── tailwind.config.js
├── tsconfig.json
└── package.json
```

---

## Supabase Database Schema

### Table: `loans`

```sql
CREATE TABLE loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('credit', 'debit')),
  -- credit = user TOOK a loan (user owes money)
  -- debit  = user GAVE a loan (user is owed money)
  person_name TEXT NOT NULL,
  person_phone TEXT,
  principal_amount NUMERIC(12, 2) NOT NULL CHECK (principal_amount > 0),
  rate_of_interest NUMERIC(5, 2) NOT NULL CHECK (rate_of_interest >= 0),
  -- Annual rate of interest in percentage
  payment_day_of_month INTEGER NOT NULL CHECK (payment_day_of_month BETWEEN 1 AND 28),
  -- Day of each month when payment is due (cap at 28 to avoid month-end issues)
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  tenure_months INTEGER NOT NULL CHECK (tenure_months > 0),
  -- Total number of monthly installments
  total_paid NUMERIC(12, 2) NOT NULL DEFAULT 0,
  remaining_amount NUMERIC(12, 2) NOT NULL,
  -- Initialize to principal + total interest; reduce on each payment
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast user queries
CREATE INDEX idx_loans_user_type ON loans(user_id, type);

-- RLS policies
ALTER TABLE loans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own loans"
  ON loans FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

### Table: `payments`

```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  installment_number INTEGER NOT NULL,
  due_date DATE NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  is_paid BOOLEAN NOT NULL DEFAULT FALSE,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_loan ON payments(loan_id);
CREATE INDEX idx_payments_due ON payments(user_id, due_date, is_paid);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own payments"
  ON payments FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

### Table: `user_settings`

```sql
CREATE TABLE user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  pin_hash TEXT,
  -- bcrypt hash of 4-digit PIN, NULL if PIN not set
  notification_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  reminder_days_before INTEGER NOT NULL DEFAULT 1
  -- How many days before due date to send reminder
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own settings"
  ON user_settings FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

### Database Function: Auto-update `remaining_amount`

```sql
CREATE OR REPLACE FUNCTION update_loan_on_payment()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_paid = TRUE AND OLD.is_paid = FALSE THEN
    UPDATE loans
    SET total_paid = total_paid + NEW.amount,
        remaining_amount = remaining_amount - NEW.amount,
        updated_at = NOW()
    WHERE id = NEW.loan_id;

    -- Check if loan is fully paid
    UPDATE loans
    SET is_completed = TRUE
    WHERE id = NEW.loan_id AND remaining_amount <= 0;
  END IF;

  -- Handle un-marking a payment (edge case)
  IF NEW.is_paid = FALSE AND OLD.is_paid = TRUE THEN
    UPDATE loans
    SET total_paid = total_paid - NEW.amount,
        remaining_amount = remaining_amount + NEW.amount,
        is_completed = FALSE,
        updated_at = NOW()
    WHERE id = NEW.loan_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_payment_update
  AFTER UPDATE OF is_paid ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_loan_on_payment();
```

---

## Authentication Flow

1. **Sign Up / Login**: Email + password via `supabase.auth.signUp()` / `supabase.auth.signInWithPassword()`.
2. **Session persistence**: Store the Supabase session token using `expo-secure-store` (not AsyncStorage — sensitive data).
3. **Optional PIN Lock**:
   - After successful email auth, if PIN is set, show PIN entry screen.
   - PIN is hashed (bcrypt) and stored in `user_settings.pin_hash`.
   - PIN check happens locally — hash the entered PIN, compare with stored hash.
   - PIN screen appears on app resume from background (use `AppState` listener).
4. **Auth gate**: In `app/_layout.tsx`, check session. If no session → redirect to `(auth)/login`. If session exists + PIN is set → show `(auth)/pin`.

```typescript
// lib/supabase.ts pattern
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: {
      getItem: (key) => SecureStore.getItemAsync(key),
      setItem: (key, value) => SecureStore.setItemAsync(key, value),
      removeItem: (key) => SecureStore.deleteItemAsync(key),
    },
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
```

---

## Core Features — Implementation Details

### 1. Credit & Debit Tabs

- Two tabs in `(tabs)/_layout.tsx` using Expo Router's `Tabs` component.
- **Credit tab** (`credit.tsx`): Fetches `loans` where `type = 'credit'` and `user_id = current user`.
- **Debit tab** (`debit.tsx`): Fetches `loans` where `type = 'debit'`.
- Each tab renders a `FlatList` of `LoanCard` components.
- Each tab has a **FAB (Floating Action Button)** → navigates to `loan/add?type=credit` or `loan/add?type=debit`.

### 2. LoanCard Component

Displays per loan:
- Person name + phone (tap to call)
- Principal amount (formatted ₹ currency)
- Rate of interest (% p.a.)
- Monthly EMI amount
- Next payment due date
- Remaining balance with a progress bar
- Status badge: Active / Completed / Overdue

### 3. Add / Edit Loan Form (`loan/add.tsx`, `loan/edit/[id].tsx`)

Fields (use React Hook Form + Zod validation):
- `person_name` — required, text
- `person_phone` — optional, phone number format
- `principal_amount` — required, positive number
- `rate_of_interest` — required, 0–100%
- `payment_day_of_month` — required, 1–28 (picker/slider)
- `tenure_months` — required, positive integer
- `start_date` — date picker, defaults to today
- `notes` — optional multiline text

**On submit:**
1. Calculate `remaining_amount` = principal + (principal × rate / 100 × tenure / 12) — simple interest. Adjust formula if compound interest is needed.
2. Insert row into `loans` table.
3. **Auto-generate payment schedule**: Insert `tenure_months` rows into `payments` table, each with the calculated EMI amount and the correct `due_date` (month by month from `start_date`, on `payment_day_of_month`).
4. Schedule local notifications for each payment (see Notifications section).

**Delete loan:** Cascade deletes payments (handled by FK). Cancel all scheduled notifications for that loan.

### 4. Loan Detail Screen (`loan/[id].tsx`)

- Shows full loan info at the top.
- Below: scrollable list of all `payments` for this loan, ordered by `due_date`.
- Each payment row (`PaymentRow` component) shows:
  - Installment number
  - Due date
  - Amount
  - Status: Paid ✓ / Upcoming / Overdue
  - **"Mark as Paid" button** — **ONLY visible when today's date matches the `due_date`** (or is past due and still unpaid). Do NOT show this button for future payments.
  
```typescript
// Payment done button visibility logic
const today = startOfDay(new Date());
const dueDate = startOfDay(parseISO(payment.due_date));
const showMarkDone = !payment.is_paid && (isEqual(dueDate, today) || isBefore(dueDate, today));
```

- **On "Mark as Paid":**
  1. Update `payments` row: `is_paid = true`, `paid_at = now()`.
  2. The database trigger automatically updates `loans.remaining_amount` and `loans.total_paid`.
  3. Cancel the notification for this specific payment.
  4. Refresh the UI to reflect new remaining balance.

### 5. Push Notifications (Local)

Use `expo-notifications` for **local scheduled notifications**. No server push needed.

```typescript
// lib/notifications.ts

import * as Notifications from 'expo-notifications';

// Request permissions on first launch
export async function registerForNotifications() {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return false;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });

  return true;
}

// Schedule a reminder for a specific payment
export async function schedulePaymentReminder(params: {
  paymentId: string;
  loanType: 'credit' | 'debit';
  personName: string;
  amount: number;
  dueDate: Date;
  reminderDaysBefore: number;
}) {
  const { paymentId, loanType, personName, amount, dueDate, reminderDaysBefore } = params;

  const triggerDate = subDays(dueDate, reminderDaysBefore);

  // Don't schedule if trigger date is in the past
  if (isBefore(triggerDate, new Date())) return null;

  const title = loanType === 'credit'
    ? `Payment Due: ₹${amount}`
    : `Payment Expected: ₹${amount}`;

  const body = loanType === 'credit'
    ? `You need to pay ₹${amount} to ${personName} on ${format(dueDate, 'dd MMM yyyy')}`
    : `₹${amount} is due from ${personName} on ${format(dueDate, 'dd MMM yyyy')}`;

  const notificationId = await Notifications.scheduleNotificationAsync({
    content: { title, body, data: { paymentId, loanType } },
    trigger: { type: 'date', date: triggerDate },
  });

  return notificationId;
}

// Cancel notification when payment is marked done
export async function cancelNotification(notificationId: string) {
  await Notifications.cancelScheduledNotificationAsync(notificationId);
}
```

**Notification schedule per payment:**
- Reminder notification: `reminderDaysBefore` days before `due_date` (default 1 day).
- On-day notification: On the `due_date` morning.
- Store `notification_id` mapping in local storage or a separate column so you can cancel them when payment is marked done or loan is deleted.

> **Important:** Store `notification_id` values. Add a `notification_id TEXT` column to the `payments` table, or keep a local key-value map via `expo-secure-store`.

### 6. Interest & EMI Calculation

```typescript
// lib/calculations.ts

export function calculateSimpleInterest(
  principal: number,
  annualRate: number,
  tenureMonths: number
): { totalInterest: number; totalAmount: number; emi: number } {
  const totalInterest = (principal * annualRate * tenureMonths) / (12 * 100);
  const totalAmount = principal + totalInterest;
  const emi = totalAmount / tenureMonths;

  return {
    totalInterest: Math.round(totalInterest * 100) / 100,
    totalAmount: Math.round(totalAmount * 100) / 100,
    emi: Math.round(emi * 100) / 100,
  };
}

// Generate payment schedule
export function generatePaymentSchedule(
  loanId: string,
  userId: string,
  startDate: Date,
  paymentDay: number,
  tenureMonths: number,
  emi: number
): PaymentInsert[] {
  const payments: PaymentInsert[] = [];

  for (let i = 0; i < tenureMonths; i++) {
    const dueDate = new Date(
      startDate.getFullYear(),
      startDate.getMonth() + i + 1,
      paymentDay
    );

    payments.push({
      loan_id: loanId,
      user_id: userId,
      installment_number: i + 1,
      due_date: format(dueDate, 'yyyy-MM-dd'),
      amount: emi,
      is_paid: false,
    });
  }

  return payments;
}
```

---

## TypeScript Types

```typescript
// types/index.ts

export interface Loan {
  id: string;
  user_id: string;
  type: 'credit' | 'debit';
  person_name: string;
  person_phone: string | null;
  principal_amount: number;
  rate_of_interest: number;
  payment_day_of_month: number;
  start_date: string;
  tenure_months: number;
  total_paid: number;
  remaining_amount: number;
  is_completed: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  loan_id: string;
  user_id: string;
  installment_number: number;
  due_date: string;
  amount: number;
  is_paid: boolean;
  paid_at: string | null;
  notification_id: string | null;
  created_at: string;
}

export interface UserSettings {
  user_id: string;
  pin_hash: string | null;
  notification_enabled: boolean;
  reminder_days_before: number;
}
```

---

## UI / UX Guidelines

- **Color palette**: Use a financial/trust-oriented palette. Dark navy primary (`#1a1a2e`), teal accent (`#16a085`), red for overdue (`#e74c3c`), green for paid (`#27ae60`).
- **Currency formatting**: Always show ₹ symbol. Use Indian numbering (1,00,000 not 100,000). Use a helper: `new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount)`.
- **Credit tab color accent**: Red/warm tones (money going out).
- **Debit tab color accent**: Green/cool tones (money coming in).
- **Loan cards**: Show a subtle progress bar for repayment percentage.
- **Empty states**: Friendly illustrations with "No loans yet" message and CTA.
- **Swipe actions** on loan cards: Swipe left to delete (with confirmation alert), swipe right to edit.
- **Pull-to-refresh** on both tabs.
- **Haptic feedback** on "Mark as Paid" button press.

---

## Environment Variables

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Store in `.env` file. Access via `process.env.EXPO_PUBLIC_*` in Expo.

---

## Key Dependencies

```json
{
  "expo": "~54.0.0",
  "expo-router": "~4.0.0",
  "expo-notifications": "~0.29.0",
  "expo-secure-store": "~14.0.0",
  "expo-haptics": "~14.0.0",
  "@supabase/supabase-js": "^2.x",
  "zustand": "^5.x",
  "react-hook-form": "^7.x",
  "zod": "^3.x",
  "@hookform/resolvers": "^3.x",
  "date-fns": "^4.x",
  "nativewind": "^4.x",
  "tailwindcss": "^3.x",
  "react-native-reanimated": "~3.x",
  "react-native-gesture-handler": "~2.x",
  "bcryptjs": "^2.x"
}
```

> Check Expo SDK 54 compatibility for exact versions before installing. Use `npx expo install` for Expo-managed packages.

---

## Development Workflow

1. **Setup**: `npx create-expo-app@latest loan-tracker --template tabs` → then restructure to match the folder layout above.
2. **Supabase**: Create project → run migration SQL → enable RLS → copy URL + anon key.
3. **Build order**:
   - Supabase client + auth (login/register) first
   - Tab navigation + loan list (read)
   - Add/edit loan forms (write)
   - Payment schedule generation
   - Mark as paid flow
   - Notifications
   - PIN lock
   - Polish: animations, haptics, swipe actions, empty states
4. **Testing**: Use Expo Go for dev. Test notifications on physical device (notifications don't work in simulators reliably).

---

## Edge Cases to Handle

- **Payment day > 28**: Restrict to 1–28 to avoid Feb issues. Enforce in Zod schema.
- **Overdue payments**: If user opens app and a `due_date` has passed without being marked paid, show it as "Overdue" in red. The "Mark as Paid" button should still be visible for overdue payments.
- **Loan deletion**: Show confirmation dialog. Cascade deletes payments. Cancel all related notifications.
- **Loan editing**: If principal, rate, or tenure changes → recalculate remaining payments that are not yet paid. Delete unpaid payment rows, regenerate them, reschedule notifications.
- **App killed / restarted**: Local notifications persist (OS-level). Session restored from SecureStore. No data loss.
- **Concurrent updates**: Supabase handles this. Use `updated_at` for optimistic concurrency if needed later.
- **Timezone**: Store all dates as UTC in DB. Convert to local for display using `date-fns-tz` if needed.
- **Large number of loans**: Paginate with Supabase `.range()`. Virtual list with `FlatList` handles rendering.

---

## What NOT to Build

- No payment gateway integration.
- No multi-user / sharing features.
- No chat or messaging.
- No complex compound interest formulas (use simple interest unless client specifies otherwise).
- No cloud push notifications (FCM/APNs) — local notifications only.
- No social login (Google, Apple) — email/password + PIN only.
- No export/PDF features (unless client asks later).
