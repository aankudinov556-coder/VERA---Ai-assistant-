import type { CompareOp, Scenario, Step } from "./types";

/** Возможности, которые исполнитель получает от приложения. */
export interface RunnerHost {
  say(text: string): void;
  ask(prompt: string): Promise<string>;
  chat(text: string): Promise<void>;
  confirm(message: string): Promise<boolean>;
  openTarget(target: string): Promise<void>;
  runProgram(path: string, args: string[]): Promise<void>;
  runShell(command: string): Promise<string>;
  http(method: string, url: string, body?: string): Promise<string>;
  log?(message: string): void;
}

class StopSignal extends Error {}

export type Vars = Record<string, string>;

/** Подстановка переменных: {{имя}}. Неизвестные переменные становятся пустой строкой. */
export function render(template: string, vars: Vars, encode?: (v: string) => string): string {
  return template.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, name: string) => {
    const v = vars[name.trim()] ?? "";
    return encode ? encode(v) : v;
  });
}

function builtins(): Vars {
  const d = new Date();
  return {
    время: d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
    дата: d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" }),
    деньнедели: d.toLocaleDateString("ru-RU", { weekday: "long" }),
  };
}

function compare(left: string, op: CompareOp, right: string): boolean {
  const l = left.toLowerCase().trim();
  const r = right.toLowerCase().trim();
  switch (op) {
    case "contains": return l.includes(r);
    case "equals": return l === r;
    case "notEmpty": return l !== "";
    case "empty": return l === "";
    case "gt": return parseFloat(l) > parseFloat(r);
    case "lt": return parseFloat(l) < parseFloat(r);
  }
}

/** Разбор строки аргументов с учётом кавычек: `-a "C:\\My Files"` → ["-a", "C:\\My Files"]. */
function splitArgs(s: string): string[] {
  return [...s.matchAll(/"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2]);
}

async function runSteps(steps: Step[], vars: Vars, host: RunnerHost): Promise<void> {
  for (const step of steps) {
    const r = (t: string) => render(t, vars);
    /** Для адресов: значения переменных кодируются (пробелы, &, ? и т.п.). */
    const rUrl = (t: string) => render(t, vars, encodeURIComponent);
    switch (step.type) {
      case "say":
        host.say(r(step.text));
        break;
      case "ai": {
        const answer = await host.ask(r(step.prompt));
        if (step.saveAs) vars[step.saveAs] = answer;
        if (step.show) host.say(answer);
        break;
      }
      case "chat":
        await host.chat(r(step.text));
        break;
      case "openUrl": {
        let url = rUrl(step.url).trim();
        if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) url = `https://${url}`;
        await host.openTarget(url);
        break;
      }
      case "openApp":
        await host.runProgram(r(step.path).trim(), splitArgs(r(step.args)));
        break;
      case "shell": {
        const cmd = r(step.command);
        if (step.confirm && !(await host.confirm(`Выполнить команду?\n\n${cmd}`))) throw new StopSignal();
        const out = await host.runShell(cmd);
        if (step.saveAs) vars[step.saveAs] = out;
        break;
      }
      case "http": {
        const out = await host.http(step.method, rUrl(step.url), step.method === "POST" ? r(step.body) : undefined);
        if (step.saveAs) vars[step.saveAs] = out;
        break;
      }
      case "clipboardWrite":
        await navigator.clipboard.writeText(r(step.text));
        break;
      case "clipboardRead":
        if (step.saveAs) vars[step.saveAs] = await navigator.clipboard.readText();
        break;
      case "setVar":
        if (step.name) vars[step.name] = r(step.value);
        break;
      case "wait":
        await new Promise((res) => setTimeout(res, Math.max(0, Math.min(step.seconds, 600)) * 1000));
        break;
      case "if":
        await runSteps(compare(r(step.left), step.op, r(step.right)) ? step.then : step.else, vars, host);
        break;
      case "stop":
        throw new StopSignal();
    }
  }
}

/** Выполнить сценарий. input — часть фразы, захваченная «*». */
export async function runScenario(s: Scenario, input: string, host: RunnerHost): Promise<void> {
  const vars: Vars = { ...builtins(), ввод: input, input };
  try {
    await runSteps(s.steps, vars, host);
  } catch (e) {
    if (e instanceof StopSignal) return;
    throw e;
  }
}
