// Всё, что видит человек. Сообщения простыми словами, без технического жаргона.
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;

const paint = (code, text) => (useColor ? `\u001b[${code}m${text}\u001b[0m` : text);

export const bold = (t) => paint('1', t);
export const dim = (t) => paint('2', t);
export const green = (t) => paint('32', t);
export const yellow = (t) => paint('33', t);
export const red = (t) => paint('31', t);
export const cyan = (t) => paint('36', t);

export function say(text = '') {
  process.stdout.write(`${text}\n`);
}

export function ok(text) {
  say(`${green('✓')} ${text}`);
}

export function warn(text) {
  say(`${yellow('!')} ${text}`);
}

export function fail(text) {
  process.stderr.write(`${red('✗')} ${text}\n`);
}

export function step(text) {
  say(`${cyan('→')} ${text}`);
}

/** Строка прогресса: в терминале перерисовывается на месте, в логах — обычные строки. */
export function progress(text) {
  if (process.stdout.isTTY) {
    process.stdout.write(`\r\u001b[K${text}`);
  } else {
    process.stdout.write(`${text}\n`);
  }
}

export function progressDone() {
  if (process.stdout.isTTY) process.stdout.write('\n');
}

/** 18 → "18", 3.8 → "3.8", 12.00 → "12" */
export function credits(value) {
  const rounded = Math.round(value * 100) / 100;
  return String(rounded);
}

export function usd(value) {
  return `$${(Math.round(value * 1000) / 1000).toFixed(value < 1 ? 3 : 2)}`;
}

export function seconds(value) {
  const m = Math.floor(value / 60);
  const s = value % 60;
  return m > 0 ? `${m} мин ${s} сек` : `${s} сек`;
}
