import type { Scenario } from "./types";

/** Нормализация для сравнения фраз: регистр, «ё», пунктуация, лишние пробелы. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}*\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function phraseRegex(phrase: string): RegExp {
  const parts = normalize(phrase)
    .split("*")
    .map((p) => p.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`^${parts.join("\\s*(.+?)\\s*")}$`, "u");
}

export interface Match {
  scenario: Scenario;
  input: string;
}

/** Найти сценарий по фразе. Возвращает и захваченную «*» часть (переменная {{ввод}}). */
export function matchScenario(text: string, scenarios: Scenario[]): Match | null {
  const t = normalize(text);
  if (!t) return null;
  for (const s of scenarios) {
    if (!s.enabled) continue;
    for (const phrase of s.phrases) {
      if (!normalize(phrase)) continue;
      const m = t.match(phraseRegex(phrase));
      if (m) return { scenario: s, input: (m[1] ?? "").trim() };
    }
  }
  return null;
}
