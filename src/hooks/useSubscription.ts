// src/hooks/useSubscription.ts
import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { useUser } from "../context/UserContext";

export interface Subscription {
  id: string;
  user_id: string;
  provider_subscription_id: string;
  plan_code: 'starter' | 'pro' | 'enterprise';
  billing_cycle: 'monthly' | 'yearly';
  status: 'active' | 'past_due' | 'canceled' | 'expired';
  amount: number;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
}

export function useSubscription() {
  const { user } = useUser();
  const [data, setData] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  // ID único por instância do hook -- ProtectedRoute e páginas como Pricing/
  // BillingTab chamam useSubscription() ao mesmo tempo para o mesmo usuário.
  // Um nome de canal fixo (`subscription-${user.id}`) faz o supabase-js
  // reaproveitar o MESMO channel object entre as duas instâncias; quando a
  // segunda chama `.on()` num canal que a primeira já mandou `.subscribe()`,
  // ele lança um erro não capturado que derruba a árvore React inteira
  // (tela em branco). Sufixo aleatório garante um canal por instância.
  const instanceIdRef = useRef<string>(crypto.randomUUID());

  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    let cancelled = false;

    const load = async () => {
      const { data: rows } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", user.id)
        .in("status", ["active", "past_due"])
        .order("created_at", { ascending: false })
        .limit(1);
      if (!cancelled) {
        setData(rows?.[0] ?? null);
        setLoading(false);
      }
    };
    load();

    const channel = supabase
      .channel(`subscription-${user.id}-${instanceIdRef.current}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "subscriptions", filter: `user_id=eq.${user.id}` },
        () => { load(); }
      )
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [user?.id]);

  return { data, loading };
}
