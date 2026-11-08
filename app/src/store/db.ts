import { isTauri } from "./settings";
import type { Role } from "../providers/types";
import type { Scenario } from "../scenarios/types";

export interface Conversation {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
}

export interface StoredMessage {
  id: string;
  conversation_id: string;
  role: Role;
  content: string;
  created_at: number;
}

export interface Memory {
  id: string;
  content: string;
  created_at: number;
}

/**
 * Хранилище истории и памяти. ID — UUID-строки, чтобы позже записи
 * с разных устройств можно было сливать при синхронизации без конфликтов.
 */
export interface Store {
  listConversations(query?: string): Promise<Conversation[]>;
  createConversation(title: string): Promise<Conversation>;
  renameConversation(id: string, title: string): Promise<void>;
  deleteConversation(id: string): Promise<void>;
  getMessages(conversationId: string): Promise<StoredMessage[]>;
  addMessage(conversationId: string, role: Role, content: string): Promise<StoredMessage>;
  listMemories(): Promise<Memory[]>;
  addMemory(content: string): Promise<Memory | null>;
  deleteMemory(id: string): Promise<void>;
  listScenarios(): Promise<Scenario[]>;
  saveScenario(s: Scenario): Promise<void>;
  deleteScenario(id: string): Promise<void>;
}

const now = () => Date.now();
const uid = () => crypto.randomUUID();

// ---------- SQLite (приложение Tauri) ----------

async function createSqlStore(): Promise<Store> {
  const { default: Database } = await import("@tauri-apps/plugin-sql");
  const db = await Database.load("sqlite:vera.db");

  return {
    async listConversations(query) {
      const q = query?.trim();
      if (!q) {
        return db.select<Conversation[]>("SELECT * FROM conversations ORDER BY updated_at DESC");
      }
      const like = `%${q}%`;
      return db.select<Conversation[]>(
        `SELECT * FROM conversations c
         WHERE c.title LIKE $1
            OR EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.content LIKE $1)
         ORDER BY updated_at DESC`,
        [like],
      );
    },
    async createConversation(title) {
      const c: Conversation = { id: uid(), title, created_at: now(), updated_at: now() };
      await db.execute(
        "INSERT INTO conversations (id, title, created_at, updated_at) VALUES ($1, $2, $3, $4)",
        [c.id, c.title, c.created_at, c.updated_at],
      );
      return c;
    },
    async renameConversation(id, title) {
      await db.execute("UPDATE conversations SET title = $1, updated_at = $2 WHERE id = $3", [
        title,
        now(),
        id,
      ]);
    },
    async deleteConversation(id) {
      await db.execute("DELETE FROM messages WHERE conversation_id = $1", [id]);
      await db.execute("DELETE FROM conversations WHERE id = $1", [id]);
    },
    async getMessages(conversationId) {
      return db.select<StoredMessage[]>(
        "SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC",
        [conversationId],
      );
    },
    async addMessage(conversationId, role, content) {
      const m: StoredMessage = { id: uid(), conversation_id: conversationId, role, content, created_at: now() };
      await db.execute(
        "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES ($1, $2, $3, $4, $5)",
        [m.id, m.conversation_id, m.role, m.content, m.created_at],
      );
      await db.execute("UPDATE conversations SET updated_at = $1 WHERE id = $2", [m.created_at, conversationId]);
      return m;
    },
    async listMemories() {
      return db.select<Memory[]>("SELECT * FROM memories ORDER BY created_at ASC");
    },
    async addMemory(content) {
      const text = content.trim();
      if (!text) return null;
      const dup = await db.select<Memory[]>("SELECT * FROM memories WHERE lower(content) = lower($1)", [text]);
      if (dup.length) return null;
      const m: Memory = { id: uid(), content: text, created_at: now() };
      await db.execute("INSERT INTO memories (id, content, created_at) VALUES ($1, $2, $3)", [
        m.id,
        m.content,
        m.created_at,
      ]);
      return m;
    },
    async deleteMemory(id) {
      await db.execute("DELETE FROM memories WHERE id = $1", [id]);
    },
    async listScenarios() {
      const rows = await db.select<{ data: string }[]>("SELECT data FROM scenarios ORDER BY name COLLATE NOCASE");
      return rows.map((r) => JSON.parse(r.data) as Scenario);
    },
    async saveScenario(sc) {
      await db.execute(
        `INSERT INTO scenarios (id, name, enabled, data, updated_at) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT(id) DO UPDATE SET name = $2, enabled = $3, data = $4, updated_at = $5`,
        [sc.id, sc.name, sc.enabled ? 1 : 0, JSON.stringify(sc), sc.updated_at],
      );
    },
    async deleteScenario(id) {
      await db.execute("DELETE FROM scenarios WHERE id = $1", [id]);
    },
  };
}

// ---------- localStorage (браузер, режим разработки) ----------

interface LocalData {
  conversations: Conversation[];
  messages: StoredMessage[];
  memories: Memory[];
  scenarios?: Scenario[];
}

function createLocalStore(): Store {
  const KEY = "vera.db.v1";
  const read = (): LocalData => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      /* пусто */
    }
    return { conversations: [], messages: [], memories: [] };
  };
  const write = (d: LocalData) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(d));
    } catch {
      /* хранилище недоступно */
    }
  };
  const byUpdated = (a: Conversation, b: Conversation) => b.updated_at - a.updated_at;

  return {
    async listConversations(query) {
      const d = read();
      const q = query?.trim().toLowerCase();
      const list = q
        ? d.conversations.filter(
            (c) =>
              c.title.toLowerCase().includes(q) ||
              d.messages.some((m) => m.conversation_id === c.id && m.content.toLowerCase().includes(q)),
          )
        : d.conversations;
      return [...list].sort(byUpdated);
    },
    async createConversation(title) {
      const d = read();
      const c: Conversation = { id: uid(), title, created_at: now(), updated_at: now() };
      d.conversations.push(c);
      write(d);
      return c;
    },
    async renameConversation(id, title) {
      const d = read();
      const c = d.conversations.find((x) => x.id === id);
      if (c) Object.assign(c, { title, updated_at: now() });
      write(d);
    },
    async deleteConversation(id) {
      const d = read();
      d.conversations = d.conversations.filter((c) => c.id !== id);
      d.messages = d.messages.filter((m) => m.conversation_id !== id);
      write(d);
    },
    async getMessages(conversationId) {
      return read()
        .messages.filter((m) => m.conversation_id === conversationId)
        .sort((a, b) => a.created_at - b.created_at);
    },
    async addMessage(conversationId, role, content) {
      const d = read();
      const m: StoredMessage = { id: uid(), conversation_id: conversationId, role, content, created_at: now() };
      d.messages.push(m);
      const c = d.conversations.find((x) => x.id === conversationId);
      if (c) c.updated_at = m.created_at;
      write(d);
      return m;
    },
    async listMemories() {
      return read().memories;
    },
    async addMemory(content) {
      const text = content.trim();
      const d = read();
      if (!text || d.memories.some((m) => m.content.toLowerCase() === text.toLowerCase())) return null;
      const m: Memory = { id: uid(), content: text, created_at: now() };
      d.memories.push(m);
      write(d);
      return m;
    },
    async deleteMemory(id) {
      const d = read();
      d.memories = d.memories.filter((m) => m.id !== id);
      write(d);
    },
    async listScenarios() {
      return [...(read().scenarios ?? [])].sort((a, b) => a.name.localeCompare(b.name));
    },
    async saveScenario(sc) {
      const d = read();
      d.scenarios = [...(d.scenarios ?? []).filter((x) => x.id !== sc.id), sc];
      write(d);
    },
    async deleteScenario(id) {
      const d = read();
      d.scenarios = (d.scenarios ?? []).filter((x) => x.id !== id);
      write(d);
    },
  };
}

let storePromise: Promise<Store> | null = null;
export function getStore(): Promise<Store> {
  storePromise ??= isTauri ? createSqlStore() : Promise.resolve(createLocalStore());
  return storePromise;
}
