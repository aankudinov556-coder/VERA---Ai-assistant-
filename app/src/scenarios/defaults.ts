import { newStep } from "./blocks";
import type { Scenario, Step } from "./types";

const step = <T extends Step["type"]>(type: T, fields: Partial<Extract<Step, { type: T }>>) =>
  ({ ...newStep(type), ...fields }) as Step;

const scenario = (name: string, phrases: string[], steps: Step[]): Scenario => ({
  id: crypto.randomUUID(),
  name,
  enabled: true,
  phrases,
  steps,
  updated_at: Date.now(),
});

/** Примеры, которые появляются при первом запуске — их можно менять и удалять. */
export function defaultScenarios(): Scenario[] {
  return [
    scenario("Который час", ["который час", "сколько времени"], [step("say", { text: "Сейчас {{время}}, {{деньнедели}}, {{дата}}" })]),
    scenario("Открыть YouTube", ["открой ютуб", "открой youtube"], [
      step("openUrl", { url: "https://youtube.com" }),
      step("say", { text: "Открываю YouTube." }),
    ]),
    scenario("Поиск в интернете", ["найди *", "загугли *"], [
      step("openUrl", { url: "https://www.google.com/search?q={{ввод}}" }),
      step("say", { text: "Ищу «{{ввод}}»." }),
    ]),
    scenario("Блокнот", ["открой блокнот"], [step("openApp", { path: "notepad.exe" })]),
    scenario("Перевод", ["переведи *"], [
      step("ai", { prompt: "Переведи на английский, ответь только переводом: {{ввод}}", saveAs: "перевод", show: true }),
      step("clipboardWrite", { text: "{{перевод}}" }),
    ]),
  ];
}
