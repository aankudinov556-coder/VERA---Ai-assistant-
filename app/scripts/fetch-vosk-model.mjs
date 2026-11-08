// Скачивает русскую модель Vosk (~45 МБ) и перепаковывает в .tar.gz, который понимает vosk-browser.
// Модель попадает в public/models и встраивается в установщик — распознавание работает офлайн.
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";
import { create } from "tar";

const NAME = "vosk-model-small-ru-0.22";
const URL = `https://alphacephei.com/vosk/models/${NAME}.zip`;
const OUT_DIR = fileURLToPath(new globalThis.URL("../public/models/", import.meta.url));
const OUT = join(OUT_DIR, "vosk-ru.tar.gz");

if (existsSync(OUT)) {
  console.log(`Модель уже есть: ${OUT}`);
  process.exit(0);
}

async function download() {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      console.log(`Скачиваю ${URL} (попытка ${attempt})…`);
      const res = await fetch(URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      console.warn(`Ошибка: ${e.message}`);
      if (attempt === 4) throw e;
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
    }
  }
}

const zip = new AdmZip(await download());
const tmp = join(tmpdir(), `vosk-${Date.now()}`);
zip.extractAllTo(tmp, true);
mkdirSync(OUT_DIR, { recursive: true });
await create({ gzip: true, file: OUT, cwd: tmp }, [NAME]);
rmSync(tmp, { recursive: true, force: true });
writeFileSync(join(OUT_DIR, "README.txt"), `${NAME} (Apache-2.0), https://alphacephei.com/vosk/models\n`);
console.log(`Готово: ${OUT}`);
