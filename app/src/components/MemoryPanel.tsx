import { useState } from "react";
import type { Memory } from "../store/db";

interface Props {
  memories: Memory[];
  enabled: boolean;
  onToggle: (v: boolean) => void;
  onAdd: (text: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function MemoryPanel({ memories, enabled, onToggle, onAdd, onDelete, onClose }: Props) {
  const [text, setText] = useState("");
  const add = () => {
    if (!text.trim()) return;
    onAdd(text);
    setText("");
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="glass panel" onClick={(e) => e.stopPropagation()}>
        <h2>Память</h2>
        <p className="muted small">
          VERA сама запоминает важные факты о вас из разговоров. Здесь их можно посмотреть, добавить или удалить.
        </p>

        <label className="row">
          <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} />
          Использовать память
        </label>

        <ul className="memory-list">
          {memories.length === 0 && <li className="muted small">Пока ничего не запомнено</li>}
          {memories.map((m) => (
            <li key={m.id} className="memory">
              <span>{m.content}</span>
              <button title="Забыть" onClick={() => onDelete(m.id)}>
                ✕
              </button>
            </li>
          ))}
        </ul>

        <div className="row">
          <input
            value={text}
            placeholder="Добавить факт вручную…"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <button className="btn" onClick={add} disabled={!text.trim()}>
            Добавить
          </button>
        </div>

        <button className="btn ghost" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </div>
  );
}
