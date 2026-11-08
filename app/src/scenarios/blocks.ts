import type { Step, StepType } from "./types";

export type FieldKind = "text" | "textarea" | "number" | "checkbox" | "select";

export interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  placeholder?: string;
  options?: { value: string; label: string }[];
}

export interface BlockDef {
  type: StepType;
  label: string;
  icon: string;
  category: "Ответ" | "Действия" | "Данные" | "Логика";
  color: string;
  fields: FieldDef[];
  make: () => Omit<Step, "id">;
}

const VAR_HINT = "Имя переменной (без скобок)";

/** Каталог блоков: из него строится палитра и формы редактора. */
export const BLOCKS: BlockDef[] = [
  {
    type: "say", label: "Ответить", icon: "💬", category: "Ответ", color: "#8ee7ff",
    fields: [{ key: "text", label: "Текст", kind: "textarea", placeholder: "Сейчас {{время}}" }],
    make: () => ({ type: "say", text: "" }),
  },
  {
    type: "ai", label: "Спросить ИИ", icon: "✨", category: "Ответ", color: "#c4b5fd",
    fields: [
      { key: "prompt", label: "Запрос к модели", kind: "textarea", placeholder: "Переведи на английский: {{ввод}}" },
      { key: "saveAs", label: "Сохранить ответ в", kind: "text", placeholder: VAR_HINT },
      { key: "show", label: "Показать ответ", kind: "checkbox" },
    ],
    make: () => ({ type: "ai", prompt: "", saveAs: "ответ", show: true }),
  },
  {
    type: "chat", label: "Написать в чат VERA", icon: "🗨️", category: "Ответ", color: "#c4b5fd",
    fields: [{ key: "text", label: "Сообщение", kind: "textarea", placeholder: "{{ввод}}" }],
    make: () => ({ type: "chat", text: "{{ввод}}" }),
  },
  {
    type: "openUrl", label: "Открыть сайт", icon: "🌐", category: "Действия", color: "#7dd3fc",
    fields: [{ key: "url", label: "Адрес", kind: "text", placeholder: "https://youtube.com" }],
    make: () => ({ type: "openUrl", url: "https://" }),
  },
  {
    type: "openApp", label: "Запустить программу", icon: "🚀", category: "Действия", color: "#7dd3fc",
    fields: [
      { key: "path", label: "Программа или файл", kind: "text", placeholder: "notepad.exe или C:\\Games\\game.exe" },
      { key: "args", label: "Аргументы (необязательно)", kind: "text" },
    ],
    make: () => ({ type: "openApp", path: "", args: "" }),
  },
  {
    type: "shell", label: "Команда PowerShell", icon: "⌨️", category: "Действия", color: "#fda4af",
    fields: [
      { key: "command", label: "Команда", kind: "textarea", placeholder: "Get-Date -Format 'dd.MM.yyyy'" },
      { key: "saveAs", label: "Сохранить вывод в", kind: "text", placeholder: VAR_HINT },
      { key: "confirm", label: "Спрашивать подтверждение", kind: "checkbox" },
    ],
    make: () => ({ type: "shell", command: "", saveAs: "вывод", confirm: true }),
  },
  {
    type: "http", label: "HTTP-запрос", icon: "🔗", category: "Данные", color: "#86efac",
    fields: [
      { key: "method", label: "Метод", kind: "select", options: [{ value: "GET", label: "GET" }, { value: "POST", label: "POST" }] },
      { key: "url", label: "Адрес", kind: "text", placeholder: "https://wttr.in/Moscow?format=3" },
      { key: "body", label: "Тело (для POST)", kind: "textarea" },
      { key: "saveAs", label: "Сохранить ответ в", kind: "text", placeholder: VAR_HINT },
    ],
    make: () => ({ type: "http", method: "GET", url: "", body: "", saveAs: "данные" }),
  },
  {
    type: "clipboardWrite", label: "Копировать в буфер", icon: "📋", category: "Данные", color: "#86efac",
    fields: [{ key: "text", label: "Текст", kind: "textarea" }],
    make: () => ({ type: "clipboardWrite", text: "" }),
  },
  {
    type: "clipboardRead", label: "Прочитать буфер", icon: "📥", category: "Данные", color: "#86efac",
    fields: [{ key: "saveAs", label: "Сохранить в", kind: "text", placeholder: VAR_HINT }],
    make: () => ({ type: "clipboardRead", saveAs: "буфер" }),
  },
  {
    type: "setVar", label: "Переменная", icon: "🏷️", category: "Данные", color: "#86efac",
    fields: [
      { key: "name", label: "Имя", kind: "text", placeholder: VAR_HINT },
      { key: "value", label: "Значение", kind: "text" },
    ],
    make: () => ({ type: "setVar", name: "", value: "" }),
  },
  {
    type: "wait", label: "Пауза", icon: "⏱️", category: "Логика", color: "#fcd34d",
    fields: [{ key: "seconds", label: "Секунд", kind: "number" }],
    make: () => ({ type: "wait", seconds: 1 }),
  },
  {
    type: "if", label: "Если … иначе", icon: "🔀", category: "Логика", color: "#fcd34d",
    fields: [
      { key: "left", label: "Значение", kind: "text", placeholder: "{{ввод}}" },
      {
        key: "op", label: "Условие", kind: "select",
        options: [
          { value: "contains", label: "содержит" },
          { value: "equals", label: "равно" },
          { value: "notEmpty", label: "не пусто" },
          { value: "empty", label: "пусто" },
          { value: "gt", label: "больше (число)" },
          { value: "lt", label: "меньше (число)" },
        ],
      },
      { key: "right", label: "С чем сравнить", kind: "text" },
    ],
    make: () => ({ type: "if", left: "{{ввод}}", op: "contains", right: "", then: [], else: [] }),
  },
  {
    type: "stop", label: "Остановить сценарий", icon: "⏹️", category: "Логика", color: "#fcd34d",
    fields: [],
    make: () => ({ type: "stop" }),
  },
];

export const blockDef = (type: StepType) => BLOCKS.find((b) => b.type === type)!;

export const newStep = (type: StepType): Step => ({ ...blockDef(type).make(), id: crypto.randomUUID() }) as Step;
