// src/hooks/useCheckoutIntent.ts
import { useCallback, useEffect, useState } from "react";
import type { PlanCode, BillingCycle } from "../config/planCatalog";

const KEY = "aflyo.checkout_intent";

export interface CheckoutIntent {
  planCode: PlanCode;
  cycle: BillingCycle;
  openedAt: number;
}

function read(): CheckoutIntent | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function useCheckoutIntent() {
  const [intent, setIntentState] = useState<CheckoutIntent | null>(() => read());

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setIntentState(read());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setIntent = useCallback((next: CheckoutIntent) => {
    localStorage.setItem(KEY, JSON.stringify(next));
    setIntentState(next);
  }, []);

  const clearIntent = useCallback(() => {
    localStorage.removeItem(KEY);
    setIntentState(null);
  }, []);

  return { intent, setIntent, clearIntent };
}
