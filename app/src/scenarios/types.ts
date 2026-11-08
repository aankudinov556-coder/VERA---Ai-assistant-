/**
 * Формат сценариев (блоков команд). Сценарий — это данные (JSON), поэтому его можно
 * хранить в базе, синхронизировать между устройствами и выполнять на любом из них.
 */
export interface Scenario {
  id: string;
  name: string;
  enabled: boolean;
  /** Фразы-триггеры. «*» захватывает часть фразы в переменную {{ввод}}. */
  phrases: string[];
  steps: Step[];
  updated_at: number;
}

export type CompareOp = "contains" | "equals" | "notEmpty" | "empty" | "gt" | "lt";

export type Step =
  | { id: string; type: "say"; text: string }
  | { id: string; type: "ai"; prompt: string; saveAs: string; show: boolean }
  | { id: string; type: "chat"; text: string }
  | { id: string; type: "openUrl"; url: string }
  | { id: string; type: "openApp"; path: string; args: string }
  | { id: string; type: "shell"; command: string; saveAs: string; confirm: boolean }
  | { id: string; type: "http"; method: "GET" | "POST"; url: string; body: string; saveAs: string }
  | { id: string; type: "clipboardWrite"; text: string }
  | { id: string; type: "clipboardRead"; saveAs: string }
  | { id: string; type: "setVar"; name: string; value: string }
  | { id: string; type: "wait"; seconds: number }
  | { id: string; type: "if"; left: string; op: CompareOp; right: string; then: Step[]; else: Step[] }
  | { id: string; type: "stop" };

export type StepType = Step["type"];
