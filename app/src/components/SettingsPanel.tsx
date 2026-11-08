import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { KeyInfo } from "../providers/openrouter";
import type { ModelInfo } from "../providers/types";
import { DEFAULTS, type FxMode, type Settings } from "../store/settings";
import { Icon } from "./Icons";
import { Modal } from "./Modal";

export type SettingsTab = "model" | "persona" | "voice" | "look" | "data" | "help";

const TABS: { id: SettingsTab; label: string; icon: string }[] = [
  { id: "model", label: "ИИ и ключ", icon: "bolt" },
  { id: "persona", label: "Характер", icon: "chats" },
  { id: "voice", label: "Голос", icon: "mic" },
  { id: "look", label: "Внешний вид", icon: "home" },
  { id: "data", label: "Данные", icon: "memories" },
  { id: "help", label: "Клавиши", icon: "list" },
];

export interface DataActions {
  exportAll: () => Promise<string>;
  importAll: () => Promise<string>;
  clearHistory: () => Promise<string>;
  clearMemories: () => Promise<string>;
}

interface Props {
  tab: SettingsTab;
  onTab: (t: SettingsTab) => void;
  settings: Settings;
  keyError: string;
  models: ModelInfo[];
  onChange: (s: Settings) => void;
  onClose: () => void;
  checkKey: () => Promise<KeyInfo>;
  data: DataActions;
}

export function SettingsPanel(p: Props) {
  const { settings, onChange } = p;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onChange({ ...settings, [k]: v });

  return (
    <Modal className="settings" onClose={p.onClose}>
      <div className="settings__head">
        <h2>Настройки</h2>
        <span className="muted small">Изменения сохраняются сразу</span>
        <button className="icon-btn" title="Закрыть (Esc)" onClick={p.onClose}>
          <Icon name="close" />
        </button>
      </div>
      <div className="settings__body">
        <nav className="settings__tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`settings__tab ${p.tab === t.id ? "settings__tab--active" : ""}`}
              onClick={() => p.onTab(t.id)}
            >
              {p.tab === t.id && <motion.span layoutId="settingsTab" className="settings__tab-bg" />}
              <Icon name={t.icon} size={18} />
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
        <div className="settings__content">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={p.tab}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.16 }}
              className="settings__page"
            >
              {p.tab === "model" && <ModelTab {...p} set={set} />}
              {p.tab === "persona" && <PersonaTab settings={settings} set={set} />}
              {p.tab === "voice" && <VoiceTab settings={settings} models={p.models} set={set} />}
              {p.tab === "look" && <LookTab settings={settings} set={set} />}
              {p.tab === "data" && <DataTab data={p.data} onReset={() => onChange({ ...DEFAULTS, apiKey: settings.apiKey })} />}
              {p.tab === "help" && <HelpTab />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </Modal>
  );
}

type SetFn = <K extends keyof Settings>(k: K, v: Settings[K]) => void;

// ---------- общие элементы ----------

function Section({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="s-section">
      <h3>{title}</h3>
      {hint && <p className="muted small s-hint">{hint}</p>}
      {children}
    </section>
  );
}

function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="switch-row">
      <span>
        {label}
        {hint && <span className="muted small s-sub">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={`switch ${checked ? "switch--on" : ""}`}
        onClick={() => onChange(!checked)}
      >
        <motion.span className="switch__knob" layout transition={{ type: "spring", stiffness: 600, damping: 35 }} />
      </button>
    </label>
  );
}

function Cards<T extends string>({ value, options, onChange }: { value: T; options: { value: T; title: string; text: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="cards">
      {options.map((o) => (
        <button key={o.value} className={`card ${value === o.value ? "card--on" : ""}`} onClick={() => onChange(o.value)}>
          <strong>{o.title}</strong>
          <span className="muted small">{o.text}</span>
        </button>
      ))}
    </div>
  );
}

// ---------- ИИ и ключ ----------

const RECOMMENDED = [
  "anthropic/claude-sonnet-4.5",
  "openai/gpt-4o-mini",
  "google/gemini-2.5-flash",
  "deepseek/deepseek-chat",
];

const fmtPrice = (m: ModelInfo) => {
  if (m.priceIn === undefined) return "";
  if (m.priceIn === 0 && m.priceOut === 0) return "бесплатно";
  return `$${m.priceIn.toFixed(2)} / $${(m.priceOut ?? 0).toFixed(2)} за 1М`;
};
const fmtCtx = (n?: number) => (n ? (n >= 1e6 ? `${(n / 1e6).toFixed(1)}М` : `${Math.round(n / 1000)}К`) : "");

function ModelPicker({ value, models, onChange, audioOnly = false }: { value: string; models: ModelInfo[]; onChange: (id: string) => void; audioOnly?: boolean }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "free">("all");
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return models
      .filter((m) => (!audioOnly || m.audio) && (filter === "all" || (m.priceIn === 0 && m.priceOut === 0)))
      .filter((m) => !t || m.id.toLowerCase().includes(t) || m.name.toLowerCase().includes(t))
      .slice(0, 80);
  }, [models, q, filter, audioOnly]);

  return (
    <div className="picker">
      <div className="picker__bar">
        <input value={q} placeholder={`Поиск среди ${models.length || "…"} моделей`} onChange={(e) => setQ(e.target.value)} />
        <div className="seg">
          <button className={filter === "all" ? "seg--on" : ""} onClick={() => setFilter("all")}>Все</button>
          <button className={filter === "free" ? "seg--on" : ""} onClick={() => setFilter("free")}>Бесплатные</button>
        </div>
      </div>
      <div className="picker__list">
        {models.length === 0 && <div className="muted small picker__empty">Список моделей загружается… Можно вписать id вручную ниже.</div>}
        {list.map((m) => (
          <button key={m.id} className={`picker__item ${m.id === value ? "picker__item--on" : ""}`} onClick={() => onChange(m.id)}>
            <span className="picker__name">
              {m.name}
              <span className="muted small">{m.id}</span>
            </span>
            <span className="picker__meta small">
              {fmtCtx(m.context) && <span className="tag">{fmtCtx(m.context)}</span>}
              <span className={m.priceIn === 0 ? "tag tag--gold" : "muted"}>{fmtPrice(m)}</span>
            </span>
            {m.id === value && <span className="picker__check">✓</span>}
          </button>
        ))}
      </div>
      <input className="picker__manual" value={value} onChange={(e) => onChange(e.target.value.trim())} title="id модели" />
    </div>
  );
}

function ModelTab(p: Props & { set: SetFn }) {
  const { settings, set } = p;
  const [show, setShow] = useState(false);
  const [check, setCheck] = useState<{ state: "idle" | "busy" | "ok" | "err"; text: string }>({ state: "idle", text: "" });

  const runCheck = async () => {
    setCheck({ state: "busy", text: "Проверяю…" });
    try {
      const k = await p.checkKey();
      const limit = k.limit === null ? "без лимита" : `лимит $${k.limit.toFixed(2)}`;
      setCheck({ state: "ok", text: `Ключ работает · потрачено $${k.usage.toFixed(2)} · ${limit}${k.freeTier ? " · бесплатный тариф" : ""}` });
    } catch (e) {
      setCheck({ state: "err", text: e instanceof Error ? e.message : String(e) });
    }
  };

  const recommended = RECOMMENDED.map((id) => p.models.find((m) => m.id === id) ?? { id, name: id.split("/")[1] });

  return (
    <>
      <Section title="API-ключ OpenRouter" hint={<>Ключ хранится в защищённом хранилище Windows. Получить ключ: openrouter.ai → Keys.</>}>
        <div className="row">
          <div className="key-input">
            <input
              type={show ? "text" : "password"}
              value={settings.apiKey}
              placeholder="sk-or-v1-…"
              onChange={(e) => {
                set("apiKey", e.target.value.trim());
                setCheck({ state: "idle", text: "" });
              }}
            />
            <button className="icon-btn" title={show ? "Скрыть" : "Показать"} onClick={() => setShow(!show)}>
              {show ? "🙈" : "👁"}
            </button>
          </div>
          <button className="btn ghost" onClick={runCheck} disabled={!settings.apiKey || check.state === "busy"}>
            Проверить
          </button>
        </div>
        {(check.text || p.keyError) && (
          <div className={`notice ${check.state === "ok" ? "notice--ok" : check.state === "err" || p.keyError ? "notice--err" : ""}`}>
            {p.keyError || check.text}
          </div>
        )}
      </Section>

      <Section title="Модель для разговора">
        <div className="quick-models">
          {recommended.map((m) => (
            <button key={m.id} className={`pill ${settings.model === m.id ? "pill--active" : ""}`} onClick={() => set("model", m.id)}>
              {m.name.replace(/^[^:]+:\s*/, "")}
            </button>
          ))}
        </div>
        <ModelPicker value={settings.model} models={p.models} onChange={(id) => set("model", id)} />
      </Section>
    </>
  );
}

// ---------- Характер ----------

const PERSONAS: { name: string; text: string }[] = [
  { name: "Дружелюбная", text: DEFAULTS.systemPrompt },
  {
    name: "Деловая",
    text: "Ты — VERA, деловой ИИ-ассистент. Отвечай по-русски чётко, структурированно и без лишних слов. Предлагай конкретные шаги.",
  },
  {
    name: "Краткая",
    text: "Ты — VERA. Отвечай по-русски максимально коротко: 1–3 предложения, без вступлений. Подробности — только если попросят.",
  },
  {
    name: "С юмором",
    text: "Ты — VERA, весёлый и остроумный ИИ-компаньон. Отвечай по-русски, с лёгким юмором, но по делу и без грубостей.",
  },
  {
    name: "Наставник",
    text: "Ты — VERA, терпеливый наставник. Объясняй по-русски простыми словами, с примерами, и проверяй, понял ли пользователь.",
  },
];

function PersonaTab({ settings, set }: { settings: Settings; set: SetFn }) {
  return (
    <>
      <Section title="Готовые характеры" hint="Выберите основу и при желании отредактируйте текст ниже.">
        <div className="quick-models">
          {PERSONAS.map((p) => (
            <button key={p.name} className={`pill ${settings.systemPrompt === p.text ? "pill--active" : ""}`} onClick={() => set("systemPrompt", p.text)}>
              {p.name}
            </button>
          ))}
        </div>
      </Section>
      <Section title="Инструкция для VERA" hint="Как ей себя вести, как обращаться к вам, о чём помнить всегда.">
        <textarea rows={7} value={settings.systemPrompt} onChange={(e) => set("systemPrompt", e.target.value)} />
        <div className="row-end">
          <button className="btn ghost" onClick={() => set("systemPrompt", DEFAULTS.systemPrompt)}>
            Вернуть по умолчанию
          </button>
        </div>
      </Section>
      <Section title="Память">
        <Switch
          checked={settings.memoryEnabled}
          onChange={(v) => set("memoryEnabled", v)}
          label="Запоминать факты обо мне"
          hint="VERA сама сохраняет важное из разговоров. Посмотреть и удалить — в разделе «Память»."
        />
      </Section>
    </>
  );
}

// ---------- Голос ----------

function MicTest() {
  const [level, setLevel] = useState(0);
  const [state, setState] = useState<"idle" | "on" | "err">("idle");
  const stopRef = useRef<() => void>(() => {});
  useEffect(() => () => stopRef.current(), []);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      let raf = 0;
      const tick = () => {
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += v * v;
        setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 6));
        raf = requestAnimationFrame(tick);
      };
      tick();
      setState("on");
      const timer = setTimeout(() => stopRef.current(), 8000);
      stopRef.current = () => {
        cancelAnimationFrame(raf);
        clearTimeout(timer);
        stream.getTracks().forEach((t) => t.stop());
        ctx.close().catch(() => {});
        setLevel(0);
        setState("idle");
        stopRef.current = () => {};
      };
    } catch {
      setState("err");
    }
  };

  return (
    <div className="mic-test">
      <button className="btn ghost" onClick={() => (state === "on" ? stopRef.current() : start())}>
        {state === "on" ? "Остановить" : "Проверить микрофон"}
      </button>
      <div className="meter">
        <div className="meter__fill" style={{ transform: `scaleX(${level})` }} />
      </div>
      <span className="muted small">
        {state === "err" ? "Нет доступа к микрофону" : state === "on" ? "Скажите что-нибудь…" : ""}
      </span>
    </div>
  );
}

function VoiceTab({ settings, models, set }: { settings: Settings; models: ModelInfo[]; set: SetFn }) {
  return (
    <>
      <Section title="Микрофон">
        <MicTest />
      </Section>
      <Section title="Слово активации">
        <Switch
          checked={settings.wakeEnabled}
          onChange={(v) => set("wakeEnabled", v)}
          label="Отзываться на слово активации"
          hint="Микрофон слушает постоянно, но распознаёт только это слово — офлайн, без отправки звука."
        />
        <label className="field">
          <span className="muted small">Слово (одно простое русское слово)</span>
          <input value={settings.wakeWord} onChange={(e) => set("wakeWord", e.target.value)} />
        </label>
      </Section>
      <Section title="Распознавание речи">
        <Cards
          value={settings.sttEngine}
          onChange={(v) => set("sttEngine", v)}
          options={[
            { value: "local", title: "Офлайн (Vosk)", text: "Бесплатно, без интернета. Хорошо для команд." },
            { value: "cloud", title: "Облако (OpenRouter)", text: "Точнее для свободной речи. Платно, нужен интернет." },
          ]}
        />
        {settings.sttEngine === "cloud" && (
          <>
            <span className="muted small">Модель с поддержкой аудио</span>
            <ModelPicker value={settings.sttModel} models={models} onChange={(id) => set("sttModel", id)} audioOnly />
          </>
        )}
      </Section>
    </>
  );
}

// ---------- Внешний вид ----------

function LookTab({ settings, set }: { settings: Settings; set: SetFn }) {
  return (
    <Section title="Эффекты" hint="Если интерфейс подтормаживает — выберите «Упрощённые» или «Выключены».">
      <Cards<FxMode>
        value={settings.fx}
        onChange={(v) => set("fx", v)}
        options={[
          { value: "full", title: "Полные", text: "Размытие стекла, свечение, все анимации." },
          { value: "lite", title: "Упрощённые", text: "Меньше размытия — для слабых видеокарт." },
          { value: "off", title: "Выключены", text: "Без анимаций и размытия. Максимально легко." },
        ]}
      />
    </Section>
  );
}

// ---------- Данные ----------

function DataTab({ data, onReset }: { data: DataActions; onReset: () => void }) {
  const [msg, setMsg] = useState("");
  const run = async (fn: () => Promise<string>, ask?: string) => {
    if (ask && !confirm(ask)) return;
    try {
      setMsg(await fn());
    } catch (e) {
      setMsg(`Ошибка: ${e instanceof Error ? e.message : e}`);
    }
  };
  return (
    <>
      <Section title="Резервная копия" hint="Чаты, память и сценарии в одном файле. Пригодится при переустановке или переносе на другой ПК.">
        <div className="row">
          <button className="btn" onClick={() => run(data.exportAll)}>Сохранить копию…</button>
          <button className="btn ghost" onClick={() => run(data.importAll)}>Загрузить из файла…</button>
        </div>
      </Section>
      <Section title="Очистка">
        <div className="danger-list">
          <div className="danger-row">
            <span>Удалить все чаты<span className="muted small s-sub">Память и сценарии останутся.</span></span>
            <button className="btn ghost danger" onClick={() => run(data.clearHistory, "Удалить ВСЕ чаты без возможности восстановления?")}>Удалить</button>
          </div>
          <div className="danger-row">
            <span>Очистить память<span className="muted small s-sub">VERA забудет всё, что знала о вас.</span></span>
            <button className="btn ghost danger" onClick={() => run(data.clearMemories, "Очистить всю память VERA?")}>Очистить</button>
          </div>
          <div className="danger-row">
            <span>Сбросить настройки<span className="muted small s-sub">API-ключ сохранится.</span></span>
            <button
              className="btn ghost danger"
              onClick={() => run(async () => (onReset(), "Настройки сброшены"), "Сбросить все настройки по умолчанию?")}
            >
              Сбросить
            </button>
          </div>
        </div>
      </Section>
      {msg && <div className="notice">{msg}</div>}
    </>
  );
}

// ---------- Клавиши ----------

const KEYS: [string, string][] = [
  ["Enter", "Отправить сообщение"],
  ["Shift + Enter", "Новая строка"],
  ["Ctrl + N", "Новый чат"],
  ["Ctrl + K", "Чаты и поиск"],
  ["Ctrl + M", "Говорить голосом"],
  ["Ctrl + ,", "Настройки"],
  ["/", "Перейти в строку ввода"],
  ["Esc", "Закрыть окно / отменить запись / остановить ответ"],
  ["Ctrl + S", "Сохранить сценарий (в редакторе команд)"],
];

function HelpTab() {
  return (
    <Section title="Горячие клавиши">
      <div className="keys">
        {KEYS.map(([k, d]) => (
          <div key={k} className="keys__row">
            <span>{k.split(" + ").map((x, i) => (<span key={i}>{i > 0 && " + "}<kbd>{x}</kbd></span>))}</span>
            <span className="muted">{d}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}
