import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export type FxMode = "full" | "lite" | "off";

export interface Settings {
  apiKey: string;
  model: string;
  systemPrompt: string;
  fx: FxMode;
  memoryEnabled: boolean;
}

const KEY = "vera.settings.v1";
export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const DEFAULTS: Settings = {
  apiKey: "",
  model: "anthropic/claude-sonnet-4.5",
  systemPrompt:
    "Ты — VERA, дружелюбный и внимательный ИИ-компаньон. Отвечай по-русски, коротко и по делу, если не попросили иначе.",
  fx: "lite",
  memoryEnabled: true,
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
  const [keyError, setKeyError] = useState("");
  // Значение, которое сейчас лежит в системном хранилище; null — ещё не загружено.
  const savedKey = useRef<string | null>(isTauri ? null : "");

  useEffect(() => {
    if (!isTauri) return;
    (async () => {
      try {
        let stored = await invoke<string>("get_api_key");
        const legacy = load().apiKey;
        if (!stored && legacy) {
          await invoke("set_api_key", { key: legacy });
          stored = legacy;
        }
        savedKey.current = stored;
        if (stored) setSettings((s) => ({ ...s, apiKey: stored }));
      } catch (e) {
        savedKey.current = "";
        setKeyError(`Не удалось прочитать ключ: ${e}`);
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

  useEffect(() => {
    if (!isTauri || savedKey.current === null) return;
    if (settings.apiKey === savedKey.current) return;
    savedKey.current = settings.apiKey;
    invoke("set_api_key", { key: settings.apiKey })
      .then(() => setKeyError(""))
      .catch((e) => setKeyError(`Не удалось сохранить ключ: ${e}`));
  }, [settings.apiKey]);

  return [settings, setSettings, keyError] as const;
}
