import { useEffect, useRef, useState } from "react";
import type { Settings } from "../store/settings";
import { transcribeCloud } from "./cloudStt";
import { VoiceEngine, type VoiceMode } from "./engine";

/**
 * Хук голосового ввода. onText получает итоговый текст фразы и должен вернуть Promise —
 * пока он выполняется, слово активации не слушается (чтобы VERA не реагировала сама на себя).
 */
export function useVoice(settings: Settings, onText: (text: string) => Promise<void>) {
  const [mode, setMode] = useState<VoiceMode>("off");
  const [partial, setPartial] = useState("");
  const [error, setError] = useState("");
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const onTextRef = useRef(onText);
  onTextRef.current = onText;
  const engineRef = useRef<VoiceEngine | null>(null);

  if (!engineRef.current) {
    engineRef.current = new VoiceEngine({
      onMode: setMode,
      onPartial: setPartial,
      onError: setError,
      onUtterance: async (text, audio, rate) => {
        const s = settingsRef.current;
        const engine = engineRef.current!;
        try {
          let final = text;
          if (s.sttEngine === "cloud" && audio.length > rate * 0.3) {
            final = (await transcribeCloud(audio, rate, s.apiKey, s.sttModel)) || text;
          }
          // Слово активации в начале фразы не нужно («Вера, открой браузер» → «открой браузер»).
          const wake = s.wakeWord.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          final = final.replace(new RegExp(`^\\s*${wake}[\\s,.!]*`, "i"), "").trim();
          if (final) await onTextRef.current(final);
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        } finally {
          engine.idle();
        }
      },
    });
  }

  useEffect(() => {
    engineRef.current!.setWake(settings.wakeEnabled, settings.wakeWord);
  }, [settings.wakeEnabled, settings.wakeWord]);

  useEffect(() => () => engineRef.current?.destroy(), []);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(""), 6000);
    return () => clearTimeout(t);
  }, [error]);

  /** Кнопка микрофона: начать слушать / закончить фразу. */
  const toggle = () => {
    const e = engineRef.current!;
    setError("");
    if (e.current === "listening") e.finishNow();
    else if (e.current !== "processing" && e.current !== "loading") e.listen();
  };

  return { mode, partial, error, toggle, cancel: () => engineRef.current!.cancel() };
}
