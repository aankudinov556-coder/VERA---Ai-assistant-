import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "../store/settings";

/** Системные действия: в приложении — через Rust, в браузере (разработка) — упрощённо. */
export async function openTarget(target: string) {
  if (isTauri) await invoke("open_target", { target });
  else window.open(target, "_blank");
}

export async function runProgram(path: string, args: string[]) {
  if (!isTauri) throw new Error("Запуск программ доступен только в приложении VERA.");
  await invoke("run_program", { path, args });
}

export async function runShell(command: string): Promise<string> {
  if (!isTauri) throw new Error("Команды PowerShell доступны только в приложении VERA.");
  return invoke<string>("run_shell", { command });
}

export async function httpRequest(method: string, url: string, body?: string): Promise<string> {
  // В приложении запрос идёт через Rust — без ограничений CORS.
  const doFetch = isTauri ? (await import("@tauri-apps/plugin-http")).fetch : window.fetch.bind(window);
  const res = await doFetch(url, {
    method,
    body,
    headers: body ? { "Content-Type": "application/json" } : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  return text.trim();
}
