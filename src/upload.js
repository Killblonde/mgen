// Свои файлы (референсы, картинка для видео) kie.ai принимает только по ссылке,
// поэтому сначала загружаем их в хранилище kie.ai. Загрузка бесплатна,
// файл там живёт 24 часа — для генерации этого с запасом.
import fs from 'node:fs';
import path from 'node:path';
import { request, UPLOAD_BASE } from './api.js';
import { UserError } from './errors.js';
import { CLI_NAME } from './brand.js';

const MAX_BYTES = 30 * 1024 * 1024; // ограничение kie.ai на одну картинку

const MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
};

export function isUrl(value) {
  return /^https?:\/\//i.test(value);
}

export function checkLocalFile(filePath) {
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    throw new UserError(
      `Файл не найден: ${filePath}`,
      'Проверь путь. Удобно перетащить файл в терминал — путь подставится сам.',
    );
  }
  if (!stat.isFile()) {
    throw new UserError(`Это не файл, а папка: ${filePath}`);
  }
  if (stat.size > MAX_BYTES) {
    throw new UserError(
      `Файл слишком большой: ${(stat.size / 1024 / 1024).toFixed(1)} МБ, а kie.ai принимает до 30 МБ.`,
      'Уменьши картинку (например, экспортируй в JPEG) и повтори.',
    );
  }
  const ext = path.extname(filePath).toLowerCase();
  if (!MIME[ext]) {
    throw new UserError(
      `Не знаю такой формат файла: ${ext || 'без расширения'}`,
      'Подойдут jpg, png, webp (для видео — mp4, mov).',
    );
  }
  return { size: stat.size, ext, mime: MIME[ext] };
}

/** Загружает локальный файл и возвращает ссылку на него. Готовую ссылку отдаёт как есть. */
export async function toRemoteUrl(key, fileOrUrl, onRetry) {
  if (isUrl(fileOrUrl)) return fileOrUrl;

  const info = checkLocalFile(fileOrUrl);
  const buffer = await fs.promises.readFile(fileOrUrl);
  const form = new FormData();
  const safeName = path
    .basename(fileOrUrl)
    .replace(/[^\w.\-]+/g, '_')
    .slice(-60);
  form.append('file', new Blob([buffer], { type: info.mime }), safeName);
  form.append('uploadPath', `${CLI_NAME}/refs`);
  form.append('fileName', `${Date.now()}-${safeName}`);

  const payload = await request(key, {
    path: '/api/file-stream-upload',
    method: 'POST',
    baseUrl: UPLOAD_BASE,
    body: form,
    onRetry,
  });

  const url = payload?.data?.downloadUrl;
  if (!url) throw new UserError(`Не получилось загрузить файл: ${fileOrUrl}`, 'Попробуй ещё раз.');
  return url;
}
