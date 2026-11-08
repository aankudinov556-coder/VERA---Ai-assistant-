import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export type FxMode = "full" | "lite" | "off";

export interface Settings {
  apiKey: string;
  model: string;
  systemPrompt: string;
  fx: FxMode;
}

const KEY = "vera.settings.v1";
export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

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

/**
 * В приложении Tauri API-ключ хранится в системном хранилище (Windows Credential Manager)
 * и не попадает в localStorage. В браузере (режим разработки) ключ остаётся в localStorage.
 */
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(load);
  const keyLoaded = useRef(!isTauri);

  // Один раз: достать ключ из системного хранилища (+ перенос из localStorage, если был).
  useEffect(() => {
    if (!isTauri) return;
    (async () => {
      try {
        const stored = await invoke<string>("get_api_key");
        if (stored) {
          setSettings((s) => ({ ...s, apiKey: stored }));
        } else if (load().apiKey) {
          await invoke("set_api_key", { key: load().apiKey });
        }
      } catch {
        /* хранилище недоступно — работаем с тем, что есть */
      } finally {
        keyLoaded.current = true;
      }
    })();
  }, []);

  useEffect(() => {
    try {
      const toSave = isTauri ? { ...settings, apiKey: "" } : settings;
      localStorage.setItem(KEY, JSON.stringify(toSave));
    } catch {
      /* хранилище недоступно */
    }
    document.documentElement.dataset.fx = settings.fx;
  }, [settings]);

  // Запись ключа в системное хранилище при изменении (после первоначальной загрузки).
  const lastKey = useRef<string | null>(null);
  useEffect(() => {
    if (!isTauri || !keyLoaded.current) return;
    if (lastKey.current === null) {
      lastKey.current = settings.apiKey;
      return;
    }
    if (lastKey.current === settings.apiKey) return;
    lastKey.current = settings.apiKey;
    invoke("set_api_key", { key: settings.apiKey }).catch(() => {});
  }, [settings.apiKey]);

  return [settings, setSettings] as const;
}
