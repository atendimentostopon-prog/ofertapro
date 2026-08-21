// src/hooks/useSubscription.ts
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useUser } from "../context/UserContext";

export interface Subscription {
  id: string;
  user_id: string;
  cakto_subscription_id: string;
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
      .channel(`subscription-${user.id}`)
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
