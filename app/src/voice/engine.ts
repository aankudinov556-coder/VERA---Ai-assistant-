import type { KaldiRecognizer, Model } from "vosk-browser";

export type VoiceMode = "off" | "loading" | "wake" | "listening" | "processing";

export interface VoiceEvents {
  onMode: (mode: VoiceMode) => void;
  onPartial: (text: string) => void;
  /** Конец фразы: распознанный Vosk текст и записанный звук (для облачного распознавания). */
  onUtterance: (text: string, audio: Float32Array, sampleRate: number) => void;
  onError: (message: string) => void;
  /** Громкость входа 0..1 во время записи (для анимации кнопки). */
  onLevel?: (level: number) => void;
}

const MODEL_URL = "/models/vosk-ru.tar.gz";
/** Сколько ждать начала речи после слова активации или нажатия кнопки. */
const NO_SPEECH_TIMEOUT_MS = 7000;
/** Максимальная длина одной фразы. */
const MAX_UTTERANCE_MS = 30000;

/**
 * Голосовой движок на Vosk (WebAssembly, работает офлайн и на старых процессорах без AVX2).
 * - «wake»: маленький распознаватель с грамматикой из одного слова ждёт слово активации;
 * - «listening»: полный распознаватель записывает команду до паузы в речи.
 */
export class VoiceEngine {
  private model: Model | null = null;
  private modelPromise: Promise<Model> | null = null;
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: ScriptProcessorNode | null = null;
  private wakeRec: KaldiRecognizer | null = null;
  private cmdRec: KaldiRecognizer | null = null;
  private mode: VoiceMode = "off";
  private wakeEnabled = false;
  private wakeWord = "вера";
  private chunks: Float32Array[] = [];
  private heardSpeech = false;
  private timers: number[] = [];

  constructor(private ev: VoiceEvents) {}

  get current() {
    return this.mode;
  }

  private setMode(m: VoiceMode) {
    if (m !== "listening") this.ev.onLevel?.(0);
    this.mode = m;
    this.ev.onMode(m);
  }

  private loadModel(): Promise<Model> {
    this.modelPromise ??= (async () => {
      const { createModel } = await import("vosk-browser");
      const url = new URL(MODEL_URL, window.location.href).href;
      const head = await fetch(url, { method: "HEAD" }).catch(() => null);
      if (!head?.ok || head.headers.get("content-type")?.includes("html")) {
        throw new Error("Модель распознавания речи не найдена (выполните npm run fetch-model).");
      }
      const model = await createModel(url, -1);
      this.model = model;
      return model;
    })();
    this.modelPromise.catch(() => (this.modelPromise = null));
    return this.modelPromise;
  }

  private async ensureAudio() {
    if (this.ctx) return;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    this.ctx = new AudioContext();
    const src = this.ctx.createMediaStreamSource(this.stream);
    // ScriptProcessor устарел, но работает везде и не требует отдельного файла воркера.
    this.node = this.ctx.createScriptProcessor(4096, 1, 1);
    this.node.onaudioprocess = (e) => this.onAudio(e.inputBuffer.getChannelData(0));
    src.connect(this.node);
    this.node.connect(this.ctx.destination);
  }

  private releaseAudio() {
    this.node?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close().catch(() => {});
    this.node = null;
    this.stream = null;
    this.ctx = null;
  }

  private onAudio(data: Float32Array) {
    if (!this.ctx) return;
    const rate = this.ctx.sampleRate;
    if (this.mode === "wake" && this.wakeRec) {
      this.wakeRec.acceptWaveformFloat(data, rate);
    } else if (this.mode === "listening" && this.cmdRec) {
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) sum += data[i] * data[i];
      this.ev.onLevel?.(Math.min(1, Math.sqrt(sum / (data.length / 4)) * 6));
      this.chunks.push(new Float32Array(data));
      this.cmdRec.acceptWaveformFloat(data, rate);
    }
  }

  private clearTimers() {
    this.timers.forEach((t) => clearTimeout(t));
    this.timers = [];
  }

  private createRecognizers(model: Model) {
    const rate = this.ctx!.sampleRate;
    this.wakeRec?.remove();
    this.wakeRec = new model.KaldiRecognizer(rate, JSON.stringify([this.wakeWord, "[unk]"]));
    this.wakeRec.on("result", (msg) => {
      if (msg.event !== "result" || this.mode !== "wake") return;
      if (msg.result.text.split(/\s+/).includes(this.wakeWord)) this.listen();
    });

    this.cmdRec?.remove();
    this.cmdRec = new model.KaldiRecognizer(rate);
    this.cmdRec.on("partialresult", (msg) => {
      if (msg.event !== "partialresult" || this.mode !== "listening") return;
      if (msg.result.partial) this.heardSpeech = true;
      this.ev.onPartial(msg.result.partial);
    });
    this.cmdRec.on("result", (msg) => {
      if (msg.event !== "result" || this.mode !== "listening") return;
      const text = msg.result.text.trim();
      // Пустой результат до начала речи (шум) — продолжаем слушать.
      if (!text && !this.heardSpeech) return;
      this.finish(text);
    });
  }

  /** Включить/выключить ожидание слова активации. */
  async setWake(enabled: boolean, word: string) {
    const normalized = word.trim().toLowerCase() || "вера";
    const changed = normalized !== this.wakeWord;
    this.wakeWord = normalized;
    this.wakeEnabled = enabled;
    if (!enabled) {
      if (this.mode === "wake") this.stop();
      return;
    }
    if (this.mode === "listening" || this.mode === "processing") return;
    try {
      this.setMode("loading");
      const model = await this.loadModel();
      await this.ensureAudio();
      if (changed || !this.wakeRec) this.createRecognizers(model);
      this.setMode("wake");
    } catch (e) {
      this.fail(e);
    }
  }

  /** Начать слушать команду (кнопка микрофона или слово активации). */
  async listen() {
    if (this.mode === "listening") return;
    try {
      if (!this.model) this.setMode("loading");
      const model = await this.loadModel();
      await this.ensureAudio();
      if (!this.cmdRec) this.createRecognizers(model);
      this.chunks = [];
      this.heardSpeech = false;
      this.ev.onPartial("");
      this.setMode("listening");
      this.clearTimers();
      this.timers.push(
        window.setTimeout(() => !this.heardSpeech && this.mode === "listening" && this.cancel(), NO_SPEECH_TIMEOUT_MS),
        window.setTimeout(() => this.mode === "listening" && this.cmdRec?.retrieveFinalResult(), MAX_UTTERANCE_MS),
      );
    } catch (e) {
      this.fail(e);
    }
  }

  /** Досрочно закончить фразу (повторное нажатие кнопки). */
  finishNow() {
    if (this.mode === "listening") this.cmdRec?.retrieveFinalResult();
  }

  cancel() {
    this.clearTimers();
    this.ev.onPartial("");
    this.idle();
  }

  private finish(text: string) {
    this.clearTimers();
    const audio = concat(this.chunks);
    this.chunks = [];
    const rate = this.ctx?.sampleRate ?? 48000;
    this.ev.onPartial("");
    this.setMode("processing");
    this.ev.onUtterance(text, audio, rate);
  }

  /** Вернуться в режим ожидания (вызывается после обработки фразы). */
  idle() {
    if (this.wakeEnabled && this.ctx) this.setMode("wake");
    else this.stop();
  }

  stop() {
    this.clearTimers();
    this.releaseAudio();
    this.setMode("off");
  }

  private fail(e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    this.ev.onError(
      /Permission|NotAllowed/i.test(msg) ? "Нет доступа к микрофону. Разрешите его в настройках Windows." : msg,
    );
    this.stop();
  }

  destroy() {
    this.stop();
    this.wakeRec?.remove();
    this.cmdRec?.remove();
    this.model?.terminate();
  }
}

function concat(chunks: Float32Array[]): Float32Array {
  const out = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}
