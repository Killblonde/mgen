// Ключ kie.ai. Переменная окружения KIE_API_KEY важнее конфига.
// Конфиг лежит в домашней папке пользователя, в папку проекта ключ не попадает никогда.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { UserError } from './errors.js';
import { CLI_NAME } from './brand.js';

export const configDir = path.join(os.homedir(), `.${CLI_NAME}`);
export const configPath = path.join(configDir, 'config.json');

export function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return {};
  }
}

export function writeConfig(patch) {
  const next = { ...readConfig(), ...patch };
  fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(configPath, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(configPath, 0o600);
  } catch {
    // На Windows прав как в unix нет — это нормально.
  }
  return next;
}

/** Откуда взят ключ — чтобы честно сказать человеку, что сейчас используется. */
export function keySource() {
  if (process.env.KIE_API_KEY?.trim()) return 'переменная окружения KIE_API_KEY';
  if (readConfig().apiKey) return `файл ${configPath}`;
  return null;
}

export function findKey() {
  const fromEnv = process.env.KIE_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  const fromFile = readConfig().apiKey;
  return fromFile ? String(fromFile).trim() : null;
}

/** Ключ обязателен — иначе понятная подсказка, где его взять. */
export function requireKey() {
  const key = findKey();
  if (key) return key;
  throw new UserError(
    'Не вижу ключа kie.ai — без него генерировать нечем.',
    `Возьми ключ на https://kie.ai/api-key и запусти «${CLI_NAME} setup». Или положи его в переменную KIE_API_KEY.`,
  );
}
