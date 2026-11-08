import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MemoryPanel } from "./components/MemoryPanel";
import { ScenarioEditor } from "./components/ScenarioEditor";
import { Decor } from "./components/Decor";
import { Icon, Sparkle } from "./components/Icons";
import { Orb, type OrbState } from "./components/Orb";
import { SettingsPanel } from "./components/SettingsPanel";
import { Sidebar } from "./components/Sidebar";
import { buildSystemPrompt, extractMemories, stripMemoryTags } from "./memory";
import { createOpenRouter } from "./providers/openrouter";
import type { ChatMessage, ModelInfo } from "./providers/types";
import { getStore, type Conversation, type Memory } from "./store/db";
import { useSettings } from "./store/settings";
import { defaultScenarios } from "./scenarios/defaults";
import { httpRequest, openTarget, runProgram, runShell } from "./scenarios/host";
import { matchScenario } from "./scenarios/match";
import { runScenario, type RunnerHost } from "./scenarios/runner";
import type { Scenario } from "./scenarios/types";
import { useVoice } from "./voice/useVoice";

/** Сообщение в ленте; kind="scenario" — ответы блоков команд (не уходят в историю модели). */
type UiMessage = ChatMessage & { kind?: "scenario" };
const SEEDED_KEY = "vera.scenarios.seeded";
let seedPromise: Promise<void> | null = null;

/** Один раз за всё время добавить примеры сценариев (защищено от двойного вызова). */
function seedScenariosOnce(): Promise<void> {
  seedPromise ??= (async () => {
    try {
      if (localStorage.getItem(SEEDED_KEY) === "1") return;
      localStorage.setItem(SEEDED_KEY, "1");
    } catch {
      return;
    }
    const store = await getStore();
    if ((await store.listScenarios()).length) return;
    for (const sc of defaultScenarios()) await store.saveScenario(sc);
  })();
  return seedPromise;
}

/** Сколько последних сообщений отправлять модели (экономия токенов). */
const CONTEXT_MESSAGES = 30;

const titleFrom = (text: string) => {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > 40 ? `${line.slice(0, 40)}…` : line;
};

export default function App() {
  const [settings, setSettings, keyError] = useSettings();
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [showScenarios, setShowScenarios] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [search, setSearch] = useState("");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [settingsSection, setSettingsSection] = useState<"all" | "voice">("all");
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const keyRef = useRef(settings.apiKey);
  keyRef.current = settings.apiKey;
  const provider = useMemo(() => createOpenRouter(() => keyRef.current), []);

  const refreshConversations = useCallback(async (q = search) => {
    const store = await getStore();
    setConversations(await store.listConversations(q));
  }, [search]);

  const refreshMemories = useCallback(async () => {
    const store = await getStore();
    setMemories(await store.listMemories());
  }, []);

  const refreshScenarios = useCallback(async () => {
    await seedScenariosOnce();
    const store = await getStore();
    setScenarios(await store.listScenarios());
  }, []);

  useEffect(() => {
    refreshScenarios().catch((e) => setError(`Сценарии: ${e}`));
    provider.listModels().then(setModels).catch(() => {});
    refreshConversations("").catch((e) => setError(`База данных: ${e}`));
    refreshMemories().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Если ключа нет — сразу открыть настройки (с задержкой: ключ грузится из хранилища асинхронно).
  useEffect(() => {
    const t = setTimeout(() => !keyRef.current && setShowSettings(true), 600);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);


  async function openConversation(id: string) {
    const store = await getStore();
    const stored = await store.getMessages(id);
    setActiveId(id);
    setMessages(stored.map(({ role, content }) => ({ role, content })));
    setError("");
    setSidebarOpen(false);
  }

  function newChat() {
    setActiveId(null);
    setMessages([]);
    setError("");
    setSidebarOpen(false);
  }

  const busyRef = useRef(false);
  busyRef.current = busy;

  /** Обычный разговор с VERA (с историей текущего чата и памятью). */
  async function sendChat(text: string) {
    if (!text || busyRef.current) return;
    busyRef.current = true;
    setError("");
    setBusy(true);

    const history: ChatMessage[] = [
      ...messages.filter((m) => !m.kind).map(({ role, content }) => ({ role, content })),
      { role: "user", content: text },
    ];
    setMessages((m) => [...m, { role: "user", content: text }, { role: "assistant", content: "" }]);

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let raw = "";
    let convId = activeId;

    try {
      const store = await getStore();
      if (!convId) {
        convId = (await store.createConversation(titleFrom(text))).id;
        setActiveId(convId);
      }
      await store.addMessage(convId, "user", text);
      refreshConversations();

      await provider.stream({
        model: settings.model,
        messages: [
          { role: "system", content: buildSystemPrompt(settings.systemPrompt, memories, settings.memoryEnabled) },
          ...history.slice(-CONTEXT_MESSAGES),
        ],
        signal: ctrl.signal,
        onToken: (t) => {
          raw += t;
          const shown = stripMemoryTags(raw);
          setMessages((m) => {
            const copy = m.slice();
            copy[copy.length - 1] = { role: "assistant", content: shown };
            return copy;
          });
        },
      });
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message ?? String(e));
    } finally {
      const clean = stripMemoryTags(raw);
      setMessages((m) => {
        const copy = m.slice();
        if (clean) copy[copy.length - 1] = { role: "assistant", content: clean };
        else copy.pop();
        return copy;
      });
      try {
        const store = await getStore();
        if (convId && clean) await store.addMessage(convId, "assistant", clean);
        if (settings.memoryEnabled) {
          const saved = [];
          for (const fact of extractMemories(raw)) {
            const m = await store.addMemory(fact);
            if (m) saved.push(m.content);
          }
          if (saved.length) {
            setToast(`Запомнила: ${saved.join("; ")}`);
            refreshMemories();
          }
        }
        refreshConversations();
      } catch (e) {
        setError(`Не удалось сохранить: ${e}`);
      }
      busyRef.current = false;
      setBusy(false);
      abortRef.current = null;
    }
  }

  const sayScenario = (content: string) =>
    content.trim() && setMessages((m) => [...m, { role: "assistant", content, kind: "scenario" }]);

  /** Что блоки команд могут делать в приложении. */
  const runnerHost: RunnerHost = {
    say: sayScenario,
    ask: async (prompt) => {
      let out = "";
      await provider.stream({
        model: settings.model,
        messages: [
          { role: "system", content: settings.systemPrompt },
          { role: "user", content: prompt },
        ],
        onToken: (t) => (out += t),
      });
      return out.trim();
    },
    chat: (text) => sendChat(text),
    confirm: async (message) => window.confirm(message),
    openTarget,
    runProgram,
    runShell,
    http: httpRequest,
  };

  async function runWithFeedback(s: Scenario, input: string) {
    try {
      await runScenario(s, input, runnerHost);
    } catch (e) {
      const msg = `Сценарий «${s.name}»: ${e instanceof Error ? e.message : e}`;
      setError(msg);
      throw e;
    }
  }

  /** Единая точка входа для текста и голоса: сначала сценарии, иначе — разговор. */
  async function handleInput(text: string, fromVoice = false) {
    const t = text.trim();
    if (!t) return;
    const match = matchScenario(t, scenarios);
    if (match) {
      setMessages((m) => [...m, { role: "user", content: `${fromVoice ? "🎙 " : ""}${t}`, kind: "scenario" }]);
      await runWithFeedback(match.scenario, match.input).catch(() => {});
      return;
    }
    if (busyRef.current) {
      setError("VERA ещё отвечает — подождите или нажмите «Стоп».");
      return;
    }
    await sendChat(t);
  }

  function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    handleInput(text);
  }

  const voice = useVoice(settings, (text) => handleInput(text, true));

  const orbState: OrbState =
    voice.mode === "listening"
      ? "listening"
      : busy
        ? messages.at(-1)?.content
          ? "speaking"
          : "thinking"
        : "idle";

  async function withStore(fn: (s: Awaited<ReturnType<typeof getStore>>) => Promise<unknown>) {
    try {
      await fn(await getStore());
    } catch (e) {
      setError(String(e));
    }
  }

  const hasChat = messages.length > 0 || Boolean(error);
  const nav: { id: string; label: string; icon: string; active: boolean; onClick: () => void }[] = [
    { id: "home", label: "Главная", icon: "home", active: !anyOverlay(), onClick: () => { closeOverlays(); newChat(); } },
    { id: "chats", label: "Чаты", icon: "chats", active: sidebarOpen, onClick: () => { closeOverlays(); setSidebarOpen(true); } },
    { id: "modules", label: "Команды", icon: "modules", active: showScenarios, onClick: () => { closeOverlays(); setShowScenarios(true); } },
    { id: "voice", label: "Голос", icon: "mic", active: settingsSection === "voice" && showSettings, onClick: () => { closeOverlays(); setSettingsSection("voice"); setShowSettings(true); } },
    { id: "memories", label: "Память", icon: "memories", active: showMemory, onClick: () => { closeOverlays(); setShowMemory(true); } },
    { id: "settings", label: "Настройки", icon: "settings", active: settingsSection === "all" && showSettings, onClick: () => { closeOverlays(); setSettingsSection("all"); setShowSettings(true); } },
  ];

  function anyOverlay() {
    return sidebarOpen || showScenarios || showSettings || showMemory;
  }
  function closeOverlays() {
    setSidebarOpen(false);
    setShowScenarios(false);
    setShowSettings(false);
    setShowMemory(false);
  }

  const composer = (
    <div className={`composer ${hasChat ? "composer--docked" : ""}`}>
      <button className="composer__btn" title="Новый чат" onClick={newChat} disabled={busy}>
        <Icon name="plus" size={24} />
      </button>
      <textarea
        rows={1}
        value={input}
        placeholder={voice.mode === "listening" ? voice.partial || "Слушаю…" : "Спросите что угодно…"}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
      />
      <button
        className={`composer__btn mic mic--${voice.mode}`}
        title={
          voice.mode === "listening"
            ? "Закончить фразу"
            : voice.mode === "wake"
              ? `Жду слово «${settings.wakeWord}» — или нажмите, чтобы говорить`
              : "Сказать голосом"
        }
        onClick={voice.toggle}
        disabled={voice.mode === "loading" || voice.mode === "processing"}
      >
        <Icon name="mic" size={22} />
      </button>
      {busy ? (
        <button className="send" title="Остановить" onClick={() => abortRef.current?.abort()}>
          <Icon name="stop" size={22} />
        </button>
      ) : (
        <button className="send" title="Отправить" onClick={send} disabled={!input.trim()}>
          <Icon name="send" size={24} />
        </button>
      )}
    </div>
  );

  const voiceLine =
    voice.error ||
    (voice.mode === "processing"
      ? "Распознаю…"
      : voice.mode === "listening"
        ? voice.partial || "Слушаю… говорите"
        : "");

  return (
    <div className={`app ${hasChat ? "app--chat" : "app--home"}`}>
      <div className="bg" aria-hidden />
      <Decor />

      <nav className="topnav">
        {nav.map((n, i) => (
          <span key={n.id} className="topnav__cell">
            {i > 0 && <span className="topnav__sep" />}
            <button className={`topnav__item ${n.active ? "topnav__item--active" : ""}`} onClick={n.onClick}>
              <Icon name={n.icon} />
              <span className="topnav__label">{n.label}</span>
            </button>
          </span>
        ))}
      </nav>

      <div className="corner">
        <Orb state={orbState} />
      </div>

      <aside className="rail">
        <button className="rail__btn rail__btn--active" title="Новый чат" onClick={() => { closeOverlays(); newChat(); }}>
          <Sparkle size={26} />
        </button>
        <button className="rail__btn" title="Чаты" onClick={() => { closeOverlays(); setSidebarOpen(true); }}>
          <Icon name="list" />
        </button>
        <button className="rail__btn" title="Редактор команд" onClick={() => { closeOverlays(); setShowScenarios(true); }}>
          <Icon name="edit" />
        </button>
      </aside>

      <Sidebar
        open={sidebarOpen}
        conversations={conversations}
        activeId={activeId}
        disabled={busy}
        onSearch={(q) => {
          setSearch(q);
          refreshConversations(q);
        }}
        onSelect={openConversation}
        onNew={newChat}
        onRename={(id, title) => withStore((s) => s.renameConversation(id, title)).then(() => refreshConversations())}
        onDelete={(id) =>
          withStore((s) => s.deleteConversation(id)).then(() => {
            if (id === activeId) newChat();
            refreshConversations();
          })
        }
        onClose={() => setSidebarOpen(false)}
      />

      {hasChat ? (
        <section className="chatview">
          <main className="chat">
            {messages.map((m, i) => (
              <div key={i} className={`bubble ${m.role} ${m.kind ?? ""}`}>
                {m.content || <span className="dots">…</span>}
              </div>
            ))}
            {error && <div className="bubble error">{error}</div>}
            <div ref={endRef} />
          </main>
          {voiceLine && <div className={`voice-status ${voice.error ? "voice-status--error" : ""}`}>{voiceLine}</div>}
          {composer}
        </section>
      ) : (
        <section className="hero">
          <div className="hero__star">
            <Sparkle size={120} />
          </div>
          <h1 className="wordmark">
            vera
            <Sparkle size={44} className="wordmark__spark" />
          </h1>
          <p className="hero__greet">Привет, друг!</p>
          {composer}
          {voiceLine ? (
            <div className={`voice-status ${voice.error ? "voice-status--error" : ""}`}>{voiceLine}</div>
          ) : (
            <div className="quick">
              <button
                onClick={() => conversations[0] && openConversation(conversations[0].id)}
                disabled={!conversations.length}
              >
                <Icon name="arrow" size={18} /> Продолжить чат
              </button>
              <span className="quick__sep" />
              <button onClick={() => setSettings({ ...settings, wakeEnabled: !settings.wakeEnabled })}>
                {settings.wakeEnabled ? "Выключить голос" : "Включить голос"}
              </button>
              <span className="quick__sep" />
              <button onClick={() => handleInput("Как дела?")}>Как дела?</button>
            </div>
          )}
          <div className="always">
            <Sparkle size={20} /> VERA всегда рядом <span className="always__dash" />
          </div>
        </section>
      )}

      <div className="chips-bar">
        <button
          className="pill pill--active"
          title="Модель (изменить в настройках)"
          onClick={() => { closeOverlays(); setSettingsSection("all"); setShowSettings(true); }}
        >
          <Sparkle size={16} /> {settings.model.split("/").pop()}
        </button>
        <button
          className={`pill ${settings.sttEngine === "local" ? "pill--on" : ""}`}
          title="Распознавание речи офлайн (Vosk)"
          onClick={() => setSettings({ ...settings, sttEngine: "local" })}
        >
          <Icon name="mic" size={16} /> Офлайн
        </button>
        <button
          className={`pill ${settings.sttEngine === "cloud" ? "pill--on" : ""}`}
          title="Распознавание речи в облаке (OpenRouter)"
          onClick={() => setSettings({ ...settings, sttEngine: "cloud" })}
        >
          <Icon name="bolt" size={16} /> Облако
        </button>
      </div>

      <div className="status">
        <span className={`status__dot ${online ? "" : "status__dot--off"}`} />
        {online ? "В сети" : "Нет сети"}
        {voice.mode === "wake" && <span className="status__voice">· жду «{settings.wakeWord}»</span>}
      </div>

      {toast && <div className="glass toast">{toast}</div>}

      {showSettings && (
        <SettingsPanel
          section={settingsSection}
          settings={settings}
          keyError={keyError}
          models={models}
          onChange={setSettings}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showScenarios && (
        <ScenarioEditor
          scenarios={scenarios}
          onSave={(sc) => withStore((st) => st.saveScenario(sc)).then(refreshScenarios)}
          onDelete={(id) => withStore((st) => st.deleteScenario(id)).then(refreshScenarios)}
          onRun={(sc, inp) => runWithFeedback(sc, inp)}
          onClose={() => setShowScenarios(false)}
        />
      )}

      {showMemory && (
        <MemoryPanel
          memories={memories}
          enabled={settings.memoryEnabled}
          onToggle={(v) => setSettings({ ...settings, memoryEnabled: v })}
          onAdd={(t) => withStore((s) => s.addMemory(t)).then(refreshMemories)}
          onDelete={(id) => withStore((s) => s.deleteMemory(id)).then(refreshMemories)}
          onClose={() => setShowMemory(false)}
        />
      )}
    </div>
  );
}
