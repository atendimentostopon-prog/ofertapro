import { render } from "./format.ts";
import { routeFor } from "./routing.ts";
import type { DiscordChannel, OpsEvent } from "./types.ts";

export interface DeliverEnv {
  discordWebhooks: Partial<Record<DiscordChannel, string>>;
  telegramToken?: string;
  telegramChatId?: string;
}

export type ChannelStatus = "sent" | "skipped" | "failed";

export interface DeliverResult {
  discord: ChannelStatus;
  telegram: ChannelStatus;
  errors: string[];
}

export function envFromDeno(): DeliverEnv {
  const get = (k: string) => Deno.env.get(k) || undefined;
  return {
    discordWebhooks: {
      critical: get("DISCORD_WEBHOOK_CRITICAL"),
      errors: get("DISCORD_WEBHOOK_ERRORS"),
      business: get("DISCORD_WEBHOOK_BUSINESS"),
      info: get("DISCORD_WEBHOOK_INFO"),
    },
    telegramToken: get("TELEGRAM_BOT_TOKEN"),
    telegramChatId: get("TELEGRAM_CHAT_ID"),
  };
}

// Mensagens de erro NUNCA incluem URL, token nem corpo da resposta.
async function post(
  label: "discord" | "telegram",
  url: string,
  body: unknown,
  fetchImpl: typeof fetch,
): Promise<{ status: ChannelStatus; error?: string }> {
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return { status: "sent", error: undefined };
    return { status: "failed", error: `${label}:http_${res.status}` };
  } catch {
    return { status: "failed", error: `${label}:network_error` };
  }
}

export async function deliver(
  ev: OpsEvent,
  env: DeliverEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<DeliverResult> {
  const route = routeFor(ev);
  const rendered = render(ev);
  const errors: string[] = [];

  const discordUrl = env.discordWebhooks[route.discord];
  const wantTelegram = route.telegram && !!env.telegramToken && !!env.telegramChatId;

  const [d, t] = await Promise.all([
    discordUrl
      ? post("discord", discordUrl, rendered.discord, fetchImpl)
      : Promise.resolve({ status: "skipped" as ChannelStatus, error: undefined }),
    wantTelegram
      ? post(
        "telegram",
        `https://api.telegram.org/bot${env.telegramToken}/sendMessage`,
        {
          chat_id: env.telegramChatId,
          text: rendered.telegram,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        },
        fetchImpl,
      )
      : Promise.resolve({ status: "skipped" as ChannelStatus, error: undefined }),
  ]);

  if (d.error) errors.push(d.error);
  if (t.error) errors.push(t.error);
  return { discord: d.status, telegram: t.status, errors };
}
