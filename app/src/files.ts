import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./store/settings";

const JSON_FILTER = [{ name: "Резервная копия VERA", extensions: ["json"] }];

/** Сохранить текст в файл: в приложении — системный диалог Windows, в браузере — скачивание. */
export async function saveTextFile(defaultName: string, text: string): Promise<boolean> {
  if (isTauri) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const path = await save({ defaultPath: defaultName, filters: JSON_FILTER });
    if (!path) return false;
    await invoke("write_text_file", { path, contents: text });
    return true;
  }
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: defaultName });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

/** Выбрать и прочитать текстовый файл. null — пользователь отменил выбор. */
export async function openTextFile(): Promise<string | null> {
  if (isTauri) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const path = await open({ multiple: false, directory: false, filters: JSON_FILTER });
    if (!path || Array.isArray(path)) return null;
    return invoke<string>("read_text_file", { path });
  }
  return new Promise((resolve) => {
    const input = Object.assign(document.createElement("input"), { type: "file", accept: ".json,application/json" });
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      f.text().then(resolve, () => resolve(null));
    };
    input.click();
  });
}
