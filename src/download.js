// Скачиваем результат в ./generated/ рядом с JSON-описанием генерации.
import fs from 'node:fs';
import path from 'node:path';
import { UserError } from './errors.js';

export const OUT_DIR_NAME = 'generated';

export function outDir(custom) {
  const dir = path.resolve(custom || path.join(process.cwd(), OUT_DIR_NAME));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function extensionFrom(url, fallback) {
  const clean = url.split('?')[0];
  const ext = path.extname(clean).toLowerCase();
  return /^\.[a-z0-9]{2,4}$/.test(ext) ? ext : fallback;
}

/** Если файл с таким именем уже есть — добавляем -2, -3 и так далее. */
function freePath(dir, base, ext) {
  let candidate = path.join(dir, `${base}${ext}`);
  let n = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${base}-${n}${ext}`);
    n += 1;
  }
  return candidate;
}

export async function downloadTo(url, { dir, base, fallbackExt = '.jpg' }) {
  let response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new UserError(
      'Готовый файл не скачался — связь оборвалась.',
      `Ссылка живёт 14 дней, можно скачать вручную: ${url}`,
    );
  }
  if (!response.ok) {
    throw new UserError(
      `Готовый файл не скачался (ответ ${response.status}).`,
      `Ссылка: ${url}`,
    );
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const filePath = freePath(dir, base, extensionFrom(url, fallbackExt));
  await fs.promises.writeFile(filePath, buffer);
  return filePath;
}

export async function writeSidecar(filePath, info) {
  const jsonPath = `${filePath.replace(/\.[^.]+$/, '')}.json`;
  await fs.promises.writeFile(jsonPath, `${JSON.stringify(info, null, 2)}\n`, 'utf8');
  return jsonPath;
}
