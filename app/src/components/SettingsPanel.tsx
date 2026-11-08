import { Modal } from "./Modal";
import type { FxMode, Settings } from "../store/settings";

interface Props {
  section?: "all" | "voice";
  settings: Settings;
  keyError: string;
  models: { id: string; name: string }[];
  onChange: (s: Settings) => void;
  onClose: () => void;
}

export function SettingsPanel({ section = "all", settings, keyError, models, onChange, onClose }: Props) {
  const all = section === "all";
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onChange({ ...settings, [k]: v });
  return (
    <Modal className="" onClose={onClose}>
        <h2>{all ? "Настройки" : "Голос"}</h2>

        {all && (<>
        <label>
          API-ключ OpenRouter
          <input
            type="password"
            value={settings.apiKey}
            placeholder="sk-or-..."
            onChange={(e) => set("apiKey", e.target.value.trim())}
          />
          {keyError && <span className="error-text">{keyError}</span>}
        </label>

        <label>
          Модель
          <input
            list="models"
            value={settings.model}
            onChange={(e) => set("model", e.target.value)}
          />
          <datalist id="models">
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </datalist>
        </label>

        <label>
          Характер ассистента
          <textarea
            rows={4}
            value={settings.systemPrompt}
            onChange={(e) => set("systemPrompt", e.target.value)}
          />
        </label>
        </>)}

        {all && <h3>Голос</h3>}
        <label className="row">
          <input
            type="checkbox"
            checked={settings.wakeEnabled}
            onChange={(e) => set("wakeEnabled", e.target.checked)}
          />
          Слушать слово активации (микрофон включён постоянно)
        </label>
        <label>
          Слово активации
          <input value={settings.wakeWord} onChange={(e) => set("wakeWord", e.target.value)} />
          <span className="muted small">Одно простое русское слово, например «вера».</span>
        </label>
        <label>
          Распознавание речи
          <select
            value={settings.sttEngine}
            onChange={(e) => set("sttEngine", e.target.value as Settings["sttEngine"])}
          >
            <option value="local">Локально (Vosk) — офлайн, бесплатно, хорошо для команд</option>
            <option value="cloud">Облако (OpenRouter) — точнее для свободной речи</option>
          </select>
        </label>
        {settings.sttEngine === "cloud" && (
          <label>
            Модель для распознавания (с поддержкой аудио)
            <input value={settings.sttModel} onChange={(e) => set("sttModel", e.target.value)} />
          </label>
        )}

        {all && (<>
        <h3>Интерфейс</h3>
        <label>
          Эффекты (для слабых ПК выберите «Упрощённые»)
          <select value={settings.fx} onChange={(e) => set("fx", e.target.value as FxMode)}>
            <option value="full">Полные</option>
            <option value="lite">Упрощённые</option>
            <option value="off">Выключены</option>
          </select>
        </label>
        </>)}

        <button className="btn" onClick={onClose}>
          Готово
        </button>
    </Modal>
  );
}
