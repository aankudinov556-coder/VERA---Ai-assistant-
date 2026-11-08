import type { FxMode, Settings } from "../store/settings";

interface Props {
  settings: Settings;
  models: { id: string; name: string }[];
  onChange: (s: Settings) => void;
  onClose: () => void;
}

export function SettingsPanel({ settings, models, onChange, onClose }: Props) {
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onChange({ ...settings, [k]: v });
  return (
    <div className="overlay" onClick={onClose}>
      <div className="glass panel" onClick={(e) => e.stopPropagation()}>
        <h2>Настройки</h2>

        <label>
          API-ключ OpenRouter
          <input
            type="password"
            value={settings.apiKey}
            placeholder="sk-or-..."
            onChange={(e) => set("apiKey", e.target.value)}
          />
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

        <label>
          Эффекты (для слабых ПК выберите «Упрощённые»)
          <select value={settings.fx} onChange={(e) => set("fx", e.target.value as FxMode)}>
            <option value="full">Полные</option>
            <option value="lite">Упрощённые</option>
            <option value="off">Выключены</option>
          </select>
        </label>

        <button className="btn" onClick={onClose}>
          Готово
        </button>
      </div>
    </div>
  );
}
