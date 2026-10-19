// Простой разбор аргументов: свои флаги, понятные ошибки, без зависимостей.
import { UserError } from './errors.js';

export function parse(argv, spec) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === '--') {
      out._.push(...argv.slice(i + 1));
      break;
    }

    if (!token.startsWith('--')) {
      out._.push(token);
      continue;
    }

    const eq = token.indexOf('=');
    const name = eq === -1 ? token.slice(2) : token.slice(2, eq);
    const inline = eq === -1 ? undefined : token.slice(eq + 1);
    const def = spec[name];

    if (!def) {
      throw new UserError(
        `Не знаю флаг --${name}.`,
        `Для этой команды есть: ${Object.keys(spec).map((f) => `--${f}`).join(', ')}`,
      );
    }

    if (def.type === 'boolean') {
      out[name] = inline === undefined ? true : /^(1|true|да|yes)$/i.test(inline);
      continue;
    }

    const value = inline ?? argv[(i += 1)];
    if (value === undefined || value.startsWith('--')) {
      throw new UserError(`У флага --${name} не хватает значения.`, def.hint);
    }

    if (def.type === 'number') {
      const num = Number(value);
      if (!Number.isFinite(num)) throw new UserError(`--${name} ждёт число, а получил «${value}».`);
      out[name] = num;
      continue;
    }

    if (def.multiple) {
      out[name] = [...(out[name] || []), value];
      continue;
    }

    out[name] = value;
  }
  return out;
}

/** Промпт можно писать в кавычках или просто словами — склеим. */
export function joinPrompt(parts) {
  return parts.join(' ').trim();
}

/** 4k / 2K / 1k -> 4K / 2K / 1K */
export function normalizeQuality(value) {
  if (!value) return undefined;
  const upper = String(value).toUpperCase().replace('К', 'K');
  if (!['1K', '2K', '4K'].includes(upper)) {
    throw new UserError(`Не знаю качество «${value}».`, 'Бывает 1k, 2k, 4k.');
  }
  return upper;
}

/** 480 / 480p / 720p / 1080p -> 480p ... */
export function normalizeResolution(value) {
  if (!value) return undefined;
  const text = String(value).toLowerCase().replace(/p$/, '');
  if (!['480', '720', '1080'].includes(text)) {
    throw new UserError(`Не знаю разрешение «${value}».`, 'Бывает 480p, 720p, 1080p.');
  }
  return `${text}p`;
}
