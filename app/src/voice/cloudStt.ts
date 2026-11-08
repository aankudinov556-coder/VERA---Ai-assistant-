/** Облачное распознавание через OpenRouter (модель с поддержкой аудио, напр. Gemini Flash). */

function toWav16k(audio: Float32Array, rate: number): Uint8Array {
  const target = 16000;
  const ratio = rate / target;
  const len = Math.floor(audio.length / ratio);
  const pcm = new Int16Array(len);
  for (let i = 0; i < len; i++) {
    const s = Math.max(-1, Math.min(1, audio[Math.floor(i * ratio)]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const buf = new ArrayBuffer(44 + pcm.byteLength);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + pcm.byteLength, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, target, true);
  v.setUint32(28, target * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, pcm.byteLength, true);
  new Int16Array(buf, 44).set(pcm);
  return new Uint8Array(buf);
}

function base64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function transcribeCloud(audio: Float32Array, rate: number, apiKey: string, model: string) {
  if (!apiKey) throw new Error("Для облачного распознавания нужен API-ключ OpenRouter.");
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "X-Title": "VERA" },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Дословно транскрибируй русскую речь из аудио. Ответь только текстом речи, без кавычек и пояснений. Если речи нет — пустой ответ.",
            },
            { type: "input_audio", input_audio: { data: base64(toWav16k(audio, rate)), format: "wav" } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Распознавание (облако) ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  return String(json.choices?.[0]?.message?.content ?? "").trim();
}
