import { AnimatePresence, LayoutGroup, MotionConfig, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Markdown } from "./components/Markdown";
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
type UiMessage = ChatMessage & { id: string; kind?: "scenario" };
const mid = () => crypto.randomUUID();
const spring = { type: "spring", stiffness: 380, damping: 34 } as const;
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
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottom = useRef(true);
  const [showJump, setShowJump] = useState(false);

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

  // Умная прокрутка: держимся внизу, только если пользователь сам не прокрутил вверх.
  useEffect(() => {
    const el = chatRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages, error]);

  const onChatScroll = () => {
    const el = chatRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    stickToBottom.current = atBottom;
    setShowJump(!atBottom);
  };

  const jumpDown = () => {
    stickToBottom.current = true;
    setShowJump(false);
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  };

  // Строка ввода растёт вместе с текстом (до ~6 строк).
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [input]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);


  async function openConversation(id: string) {
    const store = await getStore();
    const stored = await store.getMessages(id);
    setActiveId(id);
    stickToBottom.current = true;
    setMessages(stored.map(({ id, role, content }) => ({ id, role, content })));
    setError("");
    setSidebarOpen(false);
    focusInput();
  }

  function newChat() {
    setActiveId(null);
    setMessages([]);
    setError("");
    setSidebarOpen(false);
    focusInput();
  }

  function focusInput() {
    setTimeout(() => inputRef.current?.focus(), 60);
  }

  const busyRef = useRef(false);
  busyRef.current = busy;

  /** Обычный разговор с VERA (с историей текущего чата и памятью). */
  async function sendChat(text: string, retry = false) {
    if (!text || busyRef.current) return;
    busyRef.current = true;
    stickToBottom.current = true;
    setError("");
    setBusy(true);

    const base: ChatMessage[] = messages.filter((m) => !m.kind).map(({ role, content }) => ({ role, content }));
    // При повторе сообщение пользователя уже есть в ленте и в базе.
    const history: ChatMessage[] = retry ? base : [...base, { role: "user", content: text }];
    const answerId = mid();
    setMessages((m) => [
      ...m,
      ...(retry ? [] : [{ id: mid(), role: "user" as const, content: text }]),
      { id: answerId, role: "assistant", content: "" },
    ]);

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
      if (!retry) await store.addMessage(convId, "user", text);
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
          setMessages((m) => m.map((x) => (x.id === answerId ? { ...x, content: shown } : x)));
        },
      });
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message ?? String(e));
    } finally {
      const clean = stripMemoryTags(raw);
      setMessages((m) =>
        clean ? m.map((x) => (x.id === answerId ? { ...x, content: clean } : x)) : m.filter((x) => x.id !== answerId),
      );
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
    content.trim() && setMessages((m) => [...m, { id: mid(), role: "assistant", content, kind: "scenario" }]);

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
      setMessages((m) => [...m, { id: mid(), role: "user", content: `${fromVoice ? "🎙 " : ""}${t}`, kind: "scenario" }]);
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

  /** Повторить запрос после ошибки (последнее сообщение — от пользователя). */
  const lastPlain = [...messages].reverse().find((m) => !m.kind);
  const canRetry = Boolean(error) && !busy && lastPlain?.role === "user";
  const retry = () => lastPlain && sendChat(lastPlain.content, true);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copy = (m: UiMessage) =>
    navigator.clipboard.writeText(m.content).then(() => {
      setCopiedId(m.id);
      setTimeout(() => setCopiedId((c) => (c === m.id ? null : c)), 1400);
    });

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

  function anyOverlay() {
    return sidebarOpen || showScenarios || showSettings || showMemory;
  }
  function closeOverlays() {
    setSidebarOpen(false);
    setShowScenarios(false);
    setShowSettings(false);
    setShowMemory(false);
  }
  const openSettings = (section: "all" | "voice") => {
    closeOverlays();
    setSettingsSection(section);
    setShowSettings(true);
  };

  // Горячие клавиши
  const hotkeys = useRef<(e: KeyboardEvent) => void>(() => {});
  hotkeys.current = (e: KeyboardEvent) => {
    const ctrl = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (e.key === "Escape") {
      if (voice.mode === "listening") voice.cancel();
      else if (showScenarios) return; // редактор сам спросит про несохранённое
      else if (anyOverlay()) closeOverlays();
      else if (busy) abortRef.current?.abort();
      return;
    }
    if (ctrl && (key === "n" || key === "т")) {
      e.preventDefault();
      closeOverlays();
      newChat();
    } else if (ctrl && (key === "k" || key === "л")) {
      e.preventDefault();
      closeOverlays();
      setSidebarOpen(true);
    } else if (ctrl && (key === "m" || key === "ь")) {
      e.preventDefault();
      voice.toggle();
    } else if (ctrl && (e.key === "," || key === "б")) {
      e.preventDefault();
      openSettings("all");
    } else if (e.key === "/" && !anyOverlay() && document.activeElement?.tagName !== "TEXTAREA" && document.activeElement?.tagName !== "INPUT") {
      e.preventDefault();
      inputRef.current?.focus();
    }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => hotkeys.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  useEffect(() => {
    if (!anyOverlay()) focusInput();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sidebarOpen, showScenarios, showSettings, showMemory]);

  const nav: { id: string; label: string; icon: string; hint: string; active: boolean; onClick: () => void }[] = [
    { id: "home", label: "Главная", icon: "home", hint: "Ctrl+N — новый чат", active: !anyOverlay(), onClick: () => { closeOverlays(); newChat(); } },
    { id: "chats", label: "Чаты", icon: "chats", hint: "Ctrl+K", active: sidebarOpen, onClick: () => { closeOverlays(); setSidebarOpen(true); } },
    { id: "modules", label: "Команды", icon: "modules", hint: "Блоки команд", active: showScenarios, onClick: () => { closeOverlays(); setShowScenarios(true); } },
    { id: "voice", label: "Голос", icon: "mic", hint: "Ctrl+M — говорить", active: settingsSection === "voice" && showSettings, onClick: () => openSettings("voice") },
    { id: "memories", label: "Память", icon: "memories", hint: "Что VERA знает о вас", active: showMemory, onClick: () => { closeOverlays(); setShowMemory(true); } },
    { id: "settings", label: "Настройки", icon: "settings", hint: "Ctrl+,", active: settingsSection === "all" && showSettings, onClick: () => openSettings("all") },
  ];

  const composer = (
    <motion.div layoutId="composer" transition={spring} className={`composer ${hasChat ? "composer--docked" : ""}`}>
      <button className="composer__btn" title="Новый чат (Ctrl+N)" onClick={newChat} disabled={busy}>
        <Icon name="plus" size={24} />
      </button>
      <textarea
        ref={inputRef}
        rows={1}
        value={input}
        autoFocus
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
            ? "Закончить фразу (Esc — отмена)"
            : voice.mode === "wake"
              ? `Жду слово «${settings.wakeWord}» — или нажмите, чтобы говорить (Ctrl+M)`
              : "Сказать голосом (Ctrl+M)"
        }
        onClick={voice.toggle}
        disabled={voice.mode === "loading" || voice.mode === "processing"}
      >
        <span className="mic__ring" />
        <Icon name="mic" size={22} />
      </button>
      <AnimatePresence mode="popLayout" initial={false}>
        {busy ? (
          <motion.button
            key="stop"
            className="send send--stop"
            title="Остановить (Esc)"
            onClick={() => abortRef.current?.abort()}
            initial={{ scale: 0.6, opacity: 0, rotate: -90 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={{ scale: 0.6, opacity: 0, rotate: 90 }}
            transition={spring}
          >
            <Icon name="stop" size={22} />
          </motion.button>
        ) : (
          <motion.button
            key="send"
            className="send"
            title="Отправить (Enter, Shift+Enter — новая строка)"
            onClick={send}
            disabled={!input.trim()}
            initial={{ scale: 0.6, opacity: 0, rotate: 90 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={{ scale: 0.6, opacity: 0, rotate: -90 }}
            whileTap={{ scale: 0.9 }}
            transition={spring}
          >
            <Icon name="send" size={24} />
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  );

  const voiceLine =
    voice.error ||
    (voice.mode === "processing"
      ? "Распознаю…"
      : voice.mode === "listening"
        ? voice.partial || "Слушаю… говорите"
        : "");

  const voiceStatus = (
    <AnimatePresence>
      {voiceLine && (
        <motion.div
          key="voice"
          className={`voice-status ${voice.error ? "voice-status--error" : ""}`}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
        >
          {voiceLine}
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <MotionConfig reducedMotion={settings.fx === "off" ? "always" : "user"}>
      <LayoutGroup>
        <div className={`app ${hasChat ? "app--chat" : "app--home"}`}>
          <div className="bg" aria-hidden />
          <Decor />

          <nav className="topnav">
            {nav.map((n, i) => (
              <span key={n.id} className="topnav__cell">
                {i > 0 && <span className="topnav__sep" />}
                <button
                  className={`topnav__item ${n.active ? "topnav__item--active" : ""}`}
                  title={n.hint}
                  onClick={n.onClick}
                >
                  {n.active && <motion.span layoutId="navPill" className="topnav__pill" transition={spring} />}
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
            <button className="rail__btn rail__btn--active" title="Новый чат (Ctrl+N)" onClick={() => { closeOverlays(); newChat(); }}>
              <Sparkle size={26} />
            </button>
            <button className="rail__btn" title="Чаты (Ctrl+K)" onClick={() => { closeOverlays(); setSidebarOpen(true); }}>
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

          <AnimatePresence mode="popLayout" initial={false}>
            {hasChat ? (
              <motion.section
                key="chat"
                className="chatview"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
              >
                <main className="chat" ref={chatRef} onScroll={onChatScroll}>
                  <AnimatePresence initial={false}>
                    {messages.map((m) => (
                      <motion.div
                        key={m.id}
                        className={`bubble ${m.role} ${m.kind ?? ""}`}
                        initial={{ opacity: 0, y: 14, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.96 }}
                        transition={{ duration: 0.22, ease: "easeOut" }}
                      >
                        {m.content ? (
                          m.role === "assistant" ? <Markdown text={m.content} /> : m.content
                        ) : (
                          <span className="typing"><i /><i /><i /></span>
                        )}
                        {m.content && (
                          <button className="bubble__copy" title="Копировать" onClick={() => copy(m)}>
                            {copiedId === m.id ? "✓" : "⧉"}
                          </button>
                        )}
                      </motion.div>
                    ))}
                    {error && (
                      <motion.div
                        key="error"
                        className="bubble error"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                      >
                        {error}
                        {canRetry && (
                          <button className="btn ghost retry" onClick={retry}>
                            ↻ Повторить
                          </button>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </main>
                <AnimatePresence>
                  {showJump && (
                    <motion.button
                      className="jump"
                      title="Вниз"
                      onClick={jumpDown}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                    >
                      ↓
                    </motion.button>
                  )}
                </AnimatePresence>
                {voiceStatus}
                {composer}
              </motion.section>
            ) : (
              <motion.section
                key="home"
                className="hero"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
              >
                <motion.div
                  className="hero__star"
                  initial={{ opacity: 0, scale: 0.6, rotate: -30 }}
                  animate={{ opacity: 1, scale: 1, rotate: 0 }}
                  transition={{ ...spring, delay: 0.05 }}
                >
                  <Sparkle size={120} />
                </motion.div>
                <motion.h1
                  className="wordmark"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...spring, delay: 0.1 }}
                >
                  vera
                  <Sparkle size={44} className="wordmark__spark" />
                </motion.h1>
                <motion.p
                  className="hero__greet"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...spring, delay: 0.16 }}
                >
                  Привет, друг!
                </motion.p>
                {composer}
                {voiceLine ? (
                  voiceStatus
                ) : (
                  <motion.div
                    className="quick"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...spring, delay: 0.22 }}
                  >
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
                  </motion.div>
                )}
                <motion.div
                  className="always"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  <Sparkle size={20} /> VERA всегда рядом <span className="always__dash" />
                </motion.div>
              </motion.section>
            )}
          </AnimatePresence>

          <div className="chips-bar">
            <button className="pill pill--active" title="Модель (изменить в настройках)" onClick={() => openSettings("all")}>
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

          <AnimatePresence>
            {toast && (
              <motion.div
                key="toast"
                className="glass toast"
                initial={{ opacity: 0, y: 16, x: "-50%" }}
                animate={{ opacity: 1, y: 0, x: "-50%" }}
                exit={{ opacity: 0, y: 8, x: "-50%" }}
                transition={spring}
              >
                {toast}
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showSettings && (
              <SettingsPanel
                key="settings"
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
                key="scenarios"
                scenarios={scenarios}
                onSave={(sc) => withStore((st) => st.saveScenario(sc)).then(refreshScenarios)}
                onDelete={(id) => withStore((st) => st.deleteScenario(id)).then(refreshScenarios)}
                onRun={(sc, inp) => runWithFeedback(sc, inp)}
                onClose={() => setShowScenarios(false)}
              />
            )}

            {showMemory && (
              <MemoryPanel
                key="memory"
                memories={memories}
                enabled={settings.memoryEnabled}
                onToggle={(v) => setSettings({ ...settings, memoryEnabled: v })}
                onAdd={(t) => withStore((s) => s.addMemory(t)).then(refreshMemories)}
                onDelete={(id) => withStore((s) => s.deleteMemory(id)).then(refreshMemories)}
                onClose={() => setShowMemory(false)}
              />
            )}
          </AnimatePresence>
        </div>
      </LayoutGroup>
    </MotionConfig>
  );
}
