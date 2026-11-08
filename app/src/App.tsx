import { useEffect, useMemo, useRef, useState } from "react";
import { Orb, type OrbState } from "./components/Orb";
import { SettingsPanel } from "./components/SettingsPanel";
import { createOpenRouter } from "./providers/openrouter";
import type { ChatMessage, ModelInfo } from "./providers/types";
import { useSettings } from "./store/settings";

export default function App() {
  const [settings, setSettings] = useSettings();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showSettings, setShowSettings] = useState(!settings.apiKey);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const keyRef = useRef(settings.apiKey);
  keyRef.current = settings.apiKey;
  const provider = useMemo(() => createOpenRouter(() => keyRef.current), []);

  useEffect(() => {
    provider.listModels().then(setModels).catch(() => {});
  }, [provider]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const orbState: OrbState = busy ? (messages.at(-1)?.content ? "speaking" : "thinking") : "idle";

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setError("");
    setInput("");
    const history: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      await provider.stream({
        model: settings.model,
        messages: [{ role: "system", content: settings.systemPrompt }, ...history],
        signal: ctrl.signal,
        onToken: (t) =>
          setMessages((m) => {
            const copy = m.slice();
            const last = copy[copy.length - 1];
            copy[copy.length - 1] = { ...last, content: last.content + t };
            return copy;
          }),
      });
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      setBusy(false);
      abortRef.current = null;
      // убрать пустой ответ, если ничего не пришло
      setMessages((m) => (m.at(-1)?.role === "assistant" && !m.at(-1)?.content ? m.slice(0, -1) : m));
    }
  }

  return (
    <div className="app">
      <div className="bg" aria-hidden />
      <header className="glass topbar">
        <Orb state={orbState} />
        <div className="title">
          <strong>VERA</strong>
          <span>{settings.model}</span>
        </div>
        <button className="btn ghost" onClick={() => setMessages([])} disabled={busy}>
          Очистить
        </button>
        <button className="btn ghost" onClick={() => setShowSettings(true)}>
          Настройки
        </button>
      </header>

      <main className="chat">
        {messages.length === 0 && (
          <div className="empty">Привет! Я VERA. О чём поговорим?</div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`bubble glass ${m.role}`}>
            {m.content || <span className="dots">…</span>}
          </div>
        ))}
        {error && <div className="bubble glass error">{error}</div>}
        <div ref={endRef} />
      </main>

      <footer className="glass composer">
        <textarea
          rows={1}
          value={input}
          placeholder="Напишите сообщение…"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        {busy ? (
          <button className="btn" onClick={() => abortRef.current?.abort()}>
            Стоп
          </button>
        ) : (
          <button className="btn" onClick={send} disabled={!input.trim()}>
            Отправить
          </button>
        )}
      </footer>

      {showSettings && (
        <SettingsPanel
          settings={settings}
          models={models}
          onChange={setSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
