export type Role = "system" | "user" | "assistant";

export interface ChatMessage {
  role: Role;
  content: string;
}

export interface ModelInfo {
  id: string;
  name: string;
}

export interface StreamOptions {
  model: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
  onToken: (token: string) => void;
}

/** Единый интерфейс для любых моделей: OpenRouter, Ollama, Claude API и т.д. */
export interface Provider {
  id: string;
  label: string;
  listModels(): Promise<ModelInfo[]>;
  stream(opts: StreamOptions): Promise<void>;
}
