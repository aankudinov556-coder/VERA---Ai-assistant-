import type { ModelInfo, Provider, StreamOptions } from "./types";

const BASE = "https://openrouter.ai/api/v1";

export interface KeyInfo {
  label: string;
  usage: number;
  limit: number | null;
  freeTier: boolean;
}

export function createOpenRouter(getKey: () => string): Provider & { checkKey(): Promise<KeyInfo> } {
  const headers = () => ({
    Authorization: `Bearer ${getKey()}`,
    "Content-Type": "application/json",
    "X-Title": "VERA",
  });

  return {
    id: "openrouter",
    label: "OpenRouter",

    async listModels(): Promise<ModelInfo[]> {
      const res = await fetch(`${BASE}/models`);
      if (!res.ok) throw new Error(`OpenRouter: ${res.status}`);
      const json = await res.json();
      type Raw = {
        id: string;
        name: string;
        context_length?: number;
        pricing?: { prompt?: string; completion?: string };
        architecture?: { input_modalities?: string[] };
      };
      const perM = (v?: string) => (v === undefined ? undefined : Number(v) * 1e6);
      return (json.data as Raw[])
        .map((m) => ({
          id: m.id,
          name: m.name,
          context: m.context_length,
          priceIn: perM(m.pricing?.prompt),
          priceOut: perM(m.pricing?.completion),
          audio: m.architecture?.input_modalities?.includes("audio") ?? false,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },

    async checkKey() {
      const res = await fetch(`${BASE}/key`, { headers: headers() });
      if (res.status === 401) throw new Error("Ключ недействителен");
      if (!res.ok) throw new Error(`OpenRouter: ${res.status}`);
      const d = (await res.json()).data ?? {};
      return {
        label: String(d.label ?? ""),
        usage: Number(d.usage ?? 0),
        limit: d.limit == null ? null : Number(d.limit),
        freeTier: Boolean(d.is_free_tier),
      };
    },

    async stream({ model, messages, signal, onToken }: StreamOptions) {
      if (!getKey()) throw new Error("Не задан API-ключ OpenRouter (Настройки).");
      const res = await fetch(`${BASE}/chat/completions`, {
        method: "POST",
        headers: headers(),
        signal,
        body: JSON.stringify({ model, messages, stream: true }),
      });
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 300)}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          // строки-комментарии (": OPENROUTER PROCESSING") пропускаем
          if (!trimmed.startsWith("data:")) continue;
          const data = trimmed.slice(5).trim();
          if (data === "[DONE]") return;
          try {
            const delta = JSON.parse(data).choices?.[0]?.delta?.content;
            if (delta) onToken(delta);
          } catch {
            /* неполный JSON-фрагмент — игнорируем */
          }
        }
      }
    },
  };
}
