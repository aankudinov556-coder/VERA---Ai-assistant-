import type { Memory } from "./store/db";

/**
 * Механизм памяти: модель сама помечает важные факты тегом <remember>…</remember>.
 * Отдельный запрос к API не нужен — это экономит деньги и время.
 */
export const MEMORY_INSTRUCTIONS = `Если пользователь сообщает о себе важный долговременный факт (имя, предпочтения, цели, важные события, люди в его жизни), добавь в самом конце ответа отдельную строку <remember>краткий факт от третьего лица</remember>. Можно несколько тегов. Не запоминай мелочи и то, что уже есть в памяти. Никогда не упоминай этот механизм в тексте ответа.`;

export function buildSystemPrompt(base: string, memories: Memory[], enabled: boolean): string {
  if (!enabled) return base;
  const known = memories.length
    ? `\n\nЧто ты знаешь о пользователе:\n${memories.map((m) => `- ${m.content}`).join("\n")}`
    : "";
  return `${base}${known}\n\n${MEMORY_INSTRUCTIONS}`;
}

const TAG = /<remember>([\s\S]*?)<\/remember>/g;

/** Убирает теги из текста для показа; обрезает и незакрытый тег в конце (во время потоковой печати). */
export function stripMemoryTags(text: string): string {
  let out = text.replace(TAG, "");
  const open = out.lastIndexOf("<remember");
  if (open !== -1) out = out.slice(0, open);
  // частичное начало тега: "<", "<re", ...
  const partial = out.match(/<r?e?m?e?m?b?e?r?$/);
  if (partial && "<remember".startsWith(partial[0])) out = out.slice(0, partial.index);
  return out.trimEnd();
}

export function extractMemories(text: string): string[] {
  return [...text.matchAll(TAG)].map((m) => m[1].trim()).filter(Boolean);
}
