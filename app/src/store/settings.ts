import { useEffect, useState } from "react";

export type FxMode = "full" | "lite" | "off";

export interface Settings {
  apiKey: string;
  model: string;
  systemPrompt: string;
  fx: FxMode;
}

const KEY = "vera.settings.v1";

const DEFAULTS: Settings = {
  apiKey: "",
  model: "anthropic/claude-sonnet-4.5",
  systemPrompt:
    "Ты — VERA, дружелюбный и внимательный ИИ-компаньон. Отвечай по-русски, коротко и по делу, если не попросили иначе.",
  fx: "lite",
};

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

// TODO(этап 2): хранить apiKey в системном хранилище Windows (Credential Manager) через Tauri.
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(load);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {
      /* хранилище недоступно */
    }
    document.documentElement.dataset.fx = settings.fx;
  }, [settings]);
  return [settings, setSettings] as const;
}
