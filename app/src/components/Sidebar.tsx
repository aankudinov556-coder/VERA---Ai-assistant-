import { useEffect, useState } from "react";
import type { Conversation } from "../store/db";

interface Props {
  open: boolean;
  conversations: Conversation[];
  activeId: string | null;
  disabled: boolean;
  onSearch: (q: string) => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function Sidebar(p: Props) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    const t = setTimeout(() => p.onSearch(query), 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const commit = () => {
    if (editing && draft.trim()) p.onRename(editing, draft.trim());
    setEditing(null);
  };

  return (
    <>
      {p.open && <div className="sidebar-backdrop" onClick={p.onClose} />}
      <aside className={`glass sidebar ${p.open ? "sidebar--open" : ""}`}>
        <button className="btn" onClick={p.onNew} disabled={p.disabled}>
          + Новый чат
        </button>
        <input
          className="search"
          value={query}
          placeholder="Поиск по чатам…"
          onChange={(e) => setQuery(e.target.value)}
        />
        <nav className="conv-list">
          {p.conversations.length === 0 && (
            <div className="muted small">{query ? "Ничего не найдено" : "Пока нет чатов"}</div>
          )}
          {p.conversations.map((c) => (
            <div
              key={c.id}
              className={`conv ${c.id === p.activeId ? "conv--active" : ""}`}
              onClick={() => !p.disabled && editing !== c.id && p.onSelect(c.id)}
            >
              {editing === c.id ? (
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commit();
                    if (e.key === "Escape") setEditing(null);
                  }}
                />
              ) : (
                <>
                  <span className="conv__title" title={c.title}>
                    {c.title}
                  </span>
                  <span className="conv__actions">
                    <button
                      title="Переименовать"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDraft(c.title);
                        setEditing(c.id);
                      }}
                    >
                      ✎
                    </button>
                    <button
                      title="Удалить"
                      disabled={p.disabled}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Удалить чат «${c.title}»?`)) p.onDelete(c.id);
                      }}
                    >
                      ✕
                    </button>
                  </span>
                </>
              )}
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
