/**
 * stores/customerStore.ts
 *
 * Zustand store for customer CRUD + search.
 *
 * Customers are people the admin tracks loans against. A customer can have
 * multiple loans of either type (credit or debit) — they are not tagged as
 * lender/borrower at the customer level.
 */

import { create } from "zustand";
import { supabase } from "@/lib/supabase";
import type { Customer, CustomerInsert, Loan } from "@/types";

// ─── State Shape ─────────────────────────────────────────────────────────────

interface CustomerState {
  /** All customers belonging to the signed-in user. */
  customers: Customer[];
  /** Most recent search results (subset of customers). */
  searchResults: Customer[];
  /** Currently viewed customer profile. */
  currentCustomer: Customer | null;
  /** Loans belonging to currentCustomer. */
  customerLoans: Loan[];
  loading: boolean;
  actionLoading: boolean;

  // ── Actions ──────────────────────────────────────────────────────────────

  /** Fetch all customers for the current user. */
  fetchCustomers: () => Promise<void>;
  /** Search customers by name / email / phone (case-insensitive). */
  searchCustomers: (query: string) => Promise<void>;
  /** Load a single customer + their loans into state. */
  fetchCustomerProfile: (customerId: string) => Promise<void>;
  /** Insert a new customer. Returns the new customer's id. */
  addCustomer: (data: CustomerInsert, userId: string) => Promise<string>;
  /** Update an existing customer. */
  updateCustomer: (customerId: string, data: Partial<CustomerInsert>) => Promise<void>;
  /** Delete a customer (cascades loans + payments + transactions). */
  deleteCustomer: (customerId: string) => Promise<void>;
  /** Reset currentCustomer / customerLoans (useful on screen unmount). */
  clearCurrent: () => void;
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useCustomerStore = create<CustomerState>()((set, get) => ({
  customers: [],
  searchResults: [],
  currentCustomer: null,
  customerLoans: [],
  loading: false,
  actionLoading: false,

  // ── Fetch All ────────────────────────────────────────────────────────────

  fetchCustomers: async () => {
    set({ loading: true });
    try {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      set({ customers: (data as Customer[]) ?? [] });
    } finally {
      set({ loading: false });
    }
  },

  // ── Search ───────────────────────────────────────────────────────────────

  searchCustomers: async (query) => {
    const trimmed = query.trim();
    if (!trimmed) {
      set({ searchResults: get().customers.slice(0, 10) });
      return;
    }

    // Case-insensitive substring match on name OR email OR phone.
    const pattern = `%${trimmed}%`;
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .or(`name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern}`)
      .order("name", { ascending: true })
      .limit(10);

    if (error) {
      console.error("searchCustomers failed:", error);
      set({ searchResults: [] });
      return;
    }
    set({ searchResults: (data as Customer[]) ?? [] });
  },

  // ── Fetch Profile ────────────────────────────────────────────────────────

  fetchCustomerProfile: async (customerId) => {
    set({ loading: true });
    try {
      const [customerRes, loansRes] = await Promise.all([
        supabase.from("customers").select("*").eq("id", customerId).single(),
        supabase
          .from("loans")
          .select("*")
          .eq("customer_id", customerId)
          .order("created_at", { ascending: false }),
      ]);

      if (customerRes.error) throw customerRes.error;
      if (loansRes.error) throw loansRes.error;

      set({
        currentCustomer: customerRes.data as Customer,
        customerLoans: (loansRes.data as Loan[]) ?? [],
      });
    } finally {
      set({ loading: false });
    }
  },

  // ── Add ──────────────────────────────────────────────────────────────────

  addCustomer: async (data, userId) => {
    set({ actionLoading: true });
    try {
      const { data: row, error } = await supabase
        .from("customers")
        .insert({ ...data, user_id: userId })
        .select()
        .single();

      if (error) throw error;
      const customer = row as Customer;

      // Optimistic update of the list cache
      set((state) => ({ customers: [customer, ...state.customers] }));
      return customer.id;
    } finally {
      set({ actionLoading: false });
    }
  },

  // ── Update ───────────────────────────────────────────────────────────────

  updateCustomer: async (customerId, data) => {
    set({ actionLoading: true });
    try {
      const { error } = await supabase
        .from("customers")
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq("id", customerId);

      if (error) throw error;

      // Refresh the profile + list cache
      await get().fetchCustomerProfile(customerId);
      await get().fetchCustomers();
    } finally {
      set({ actionLoading: false });
    }
  },

  // ── Delete ───────────────────────────────────────────────────────────────

  deleteCustomer: async (customerId) => {
    set({ actionLoading: true });
    try {
      const { error } = await supabase
        .from("customers")
        .delete()
        .eq("id", customerId);

      if (error) throw error;

      set((state) => ({
        customers: state.customers.filter((c) => c.id !== customerId),
        currentCustomer:
          state.currentCustomer?.id === customerId ? null : state.currentCustomer,
        customerLoans:
          state.currentCustomer?.id === customerId ? [] : state.customerLoans,
      }));
    } finally {
      set({ actionLoading: false });
    }
  },

  // ── Clear ────────────────────────────────────────────────────────────────

  clearCurrent: () => set({ currentCustomer: null, customerLoans: [] }),
}));
