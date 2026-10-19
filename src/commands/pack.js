// mgen pack ./site --out сайт.html — собрать готовый сайт в один файл.
// Такой файл открывается двойным щелчком, работает без интернета и его удобно
// переслать в мессенджере: ни стилей, ни кадров рядом искать не нужно.
// Денег не стоит: kie.ai здесь не участвует.
import fs from 'node:fs';
import path from 'node:path';
import { parse } from '../args.js';
import { UserError } from '../errors.js';
import { confirm } from '../confirm.js';
import { CLI_NAME } from '../brand.js';
import { bold, dim, ok, say, step, warn } from '../ui.js';

export const packFlags = {
  out: { type: 'string', hint: 'куда положить готовый файл: --out сайт.html' },
  frames: { type: 'number', hint: 'сколько кадров оставить: --frames 60, а --frames 0 — все' },
  'max-mb': { type: 'number', hint: 'спросить, если файл тяжелее: --max-mb 30' },
  yes: { type: 'boolean', hint: 'согласиться на тяжёлый файл заранее' },
};

// 90 кадров — заметно легче, чем 120-150, а движение на глаз такое же плавное.
export const DEFAULT_FRAMES = 90;
export const DEFAULT_MAX_MB = 20;

// Наборы символов Google Fonts, которые нужны русской странице. Греческий
// и вьетнамский тянуть незачем: это лишние сотни килобайт.
export const FONT_SUBSETS = ['latin', 'latin-ext', 'cyrillic', 'cyrillic-ext'];

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
};

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} МБ`;

export function mimeFor(file) {
  return MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

export function dataUri(file, bytes) {
  return `data:${mimeFor(file)};base64,${bytes.toString('base64')}`;
}

/** Какого рода файл встроили — нужно только для понятного отчёта. */
function kindFor(file) {
  const ext = path.extname(file).toLowerCase();
  if (['.woff2', '.woff', '.ttf', '.otf'].includes(ext)) return 'fonts';
  if (['.mp4', '.webm', '.mov', '.mp3'].includes(ext)) return 'media';
  return 'images';
}

/** Ровно limit кадров из total через равные промежутки: первый и последний на месте. */
export function pickFrames(total, limit) {
  const all = [];
  for (let i = 0; i < total; i += 1) all.push(i);
  if (limit === undefined || limit === null || limit <= 0 || limit >= total) return all;
  if (limit === 1) {
    throw new UserError(
      'Кадров должно остаться хотя бы два.',
      'Например --frames 60, а --frames 0 оставит все кадры как есть.',
    );
  }
  const chosen = [];
  for (let i = 0; i < limit; i += 1) chosen.push(Math.round((i * (total - 1)) / (limit - 1)));
  return [...new Set(chosen)];
}

/** frames/frame-$.jpg + номер 0 → frames/frame-0001.jpg */
export function framePath(pattern, index, pad) {
  return pattern.replace('$', String(index + 1).padStart(pad, '0'));
}

function attr(tag, name) {
  const found = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'));
  if (!found) return undefined;
  return found[2] !== undefined ? found[2] : found[3];
}

/** Свой файл рядом со страницей, а не адрес в интернете и не якорь. */
function isLocal(href) {
  if (!href) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return false;
  return !href.startsWith('//') && !href.startsWith('#');
}

function localPath(base, href) {
  const clean = href.split(/[?#]/)[0];
  let name = clean;
  try {
    name = decodeURIComponent(clean);
  } catch {
    name = clean;
  }
  return path.resolve(base, name);
}

/**
 * Прорежаем кадры и пересчитываем data-count: иначе анимация будет просить
 * кадры, которых в файле уже нет.
 */
export function rewriteFrameSections(html, limit) {
  const sections = [];
  const out = html.replace(/<section\b[^>]*>/gi, (tag) => {
    if (!/class\s*=\s*["'][^"']*\bmgen-scroll\b/i.test(tag)) return tag;
    const pattern = attr(tag, 'data-frames');
    const count = Number(attr(tag, 'data-count'));
    if (!pattern || !Number.isFinite(count) || count < 2) return tag;
    const pad = Number(attr(tag, 'data-pad')) || 4;
    const chosen = pickFrames(count, limit);
    sections.push({ pattern, pad, sourceCount: count, chosen });
    return tag.replace(/(\sdata-count\s*=\s*["'])[^"']*(["'])/i, `$1${chosen.length}$2`);
  });
  return { html: out, sections };
}

/** Из ответа Google Fonts оставляем только латиницу и кириллицу. */
export function keepSubsets(css, subsets = FONT_SUBSETS) {
  const blocks = [];
  const re = /(?:\/\*\s*([^*]+?)\s*\*\/\s*)?@font-face\s*\{[^}]*\}/g;
  let found = re.exec(css);
  while (found) {
    const label = (found[1] || '').trim();
    if (!label || subsets.includes(label)) {
      blocks.push(found[0].slice(found[0].indexOf('@font-face')));
    }
    found = re.exec(css);
  }
  return blocks.join('\n');
}

function makeContext(dir, { note = () => {}, alert = () => {} } = {}) {
  return {
    dir,
    note,
    alert,
    files: new Map(),
    bytes: 0,
    missing: [],
    kinds: { frames: 0, images: 0, media: 0, fonts: 0, styles: 0, scripts: 0 },
    /** Файл → data:URI. Один и тот же файл встраиваем один раз. */
    uri(file, kind) {
      const abs = path.resolve(file);
      if (this.files.has(abs)) return this.files.get(abs);
      if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
        if (!this.missing.includes(abs)) this.missing.push(abs);
        return null;
      }
      const bytes = fs.readFileSync(abs);
      const uri = dataUri(abs, bytes);
      this.files.set(abs, uri);
      this.bytes += bytes.length;
      this.kinds[kind || kindFor(abs)] += 1;
      return uri;
    },
  };
}

function inlineCssUrls(css, cssDir, ctx) {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (whole, quote, href) => {
    if (!isLocal(href)) return whole;
    const uri = ctx.uri(localPath(cssDir, href));
    return uri ? `url(${uri})` : whole;
  });
}

/** Ссылки-разогрев на серверы шрифтов: без интернета они бесполезны. */
function dropFontPreconnect(html) {
  return html.replace(/[ \t]*<link\b[^>]*>\n?/gi, (tag) => {
    const rel = (attr(tag, 'rel') || '').toLowerCase();
    const href = attr(tag, 'href') || '';
    const isHint = rel.includes('preconnect') || rel.includes('dns-prefetch');
    return isHint && /fonts\.(googleapis|gstatic)\.com/i.test(href) ? '' : tag;
  });
}

async function fetchFont(url, asText) {
  const answer = await fetch(url, {
    headers: { 'user-agent': BROWSER_UA },
    signal: AbortSignal.timeout(20000),
  });
  if (!answer.ok) throw new Error(`сервер ответил ${answer.status}`);
  return asText ? answer.text() : Buffer.from(await answer.arrayBuffer());
}

async function inlineFontFiles(css, ctx) {
  const urls = [...new Set([...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map((m) => m[1]))];
  let out = css;
  for (const url of urls) {
    const bytes = await fetchFont(url, false);
    const name = url.split('?')[0];
    out = out.split(url).join(`data:${mimeFor(name)};base64,${bytes.toString('base64')}`);
    ctx.bytes += bytes.length;
    ctx.kinds.fonts += 1;
  }
  return out;
}

async function inlineGoogleFonts(html, ctx) {
  const tags = [...html.matchAll(/<link\b[^>]*>/gi)]
    .map((m) => m[0])
    .filter((tag) => /fonts\.googleapis\.com\/css/i.test(attr(tag, 'href') || ''));
  let out = html;
  for (const tag of tags) {
    const href = attr(tag, 'href');
    ctx.note('Скачиваю шрифты Google, чтобы положить их внутрь файла…');
    try {
      const css = await fetchFont(href, true);
      const kept = keepSubsets(css);
      if (!kept) throw new Error('в ответе не нашлось шрифтов');
      const inlined = await inlineFontFiles(kept, ctx);
      out = out.replace(tag, `<style>\n/* шрифты Google лежат внутри файла */\n${inlined}\n</style>`);
    } catch (error) {
      ctx.alert(`Шрифты не скачались (${error.message}). Ссылку убрал — страница покажет системный шрифт.`);
      out = out.replace(tag, '');
    }
  }
  return out;
}

function inlineStyles(html, ctx) {
  return html.replace(/<link\b[^>]*>/gi, (tag) => {
    const rel = (attr(tag, 'rel') || '').toLowerCase();
    const href = attr(tag, 'href');
    if (!isLocal(href)) return tag;
    if (rel.includes('stylesheet')) {
      const file = localPath(ctx.dir, href);
      if (!fs.existsSync(file)) {
        if (!ctx.missing.includes(file)) ctx.missing.push(file);
        return tag;
      }
      const css = fs.readFileSync(file, 'utf8');
      ctx.bytes += Buffer.byteLength(css);
      ctx.kinds.styles += 1;
      return `<style>\n/* ${path.basename(file)} */\n${inlineCssUrls(css, path.dirname(file), ctx)}\n</style>`;
    }
    if (rel.includes('icon')) {
      const uri = ctx.uri(localPath(ctx.dir, href));
      return uri ? tag.replace(href, uri) : tag;
    }
    return tag;
  });
}

function inlineScripts(html, ctx) {
  return html.replace(/<script\b[^>]*\bsrc\s*=\s*("[^"]*"|'[^']*')[^>]*>\s*<\/script>/gi, (tag) => {
    const src = attr(tag, 'src');
    if (!isLocal(src)) return tag;
    const file = localPath(ctx.dir, src);
    if (!fs.existsSync(file)) {
      if (!ctx.missing.includes(file)) ctx.missing.push(file);
      return tag;
    }
    const code = fs.readFileSync(file, 'utf8').replace(/<\/script/gi, '<\\/script');
    ctx.bytes += Buffer.byteLength(code);
    ctx.kinds.scripts += 1;
    const open = tag
      .slice(0, tag.indexOf('>') + 1)
      .replace(/\s(src|integrity|crossorigin)\s*=\s*("[^"]*"|'[^']*')/gi, '')
      .replace(/\s(defer|async)(?=[\s>])/gi, '');
    return `${open}\n/* ${path.basename(file)} */\n${code}\n</script>`;
  });
}

function inlineMedia(html, ctx) {
  return html.replace(/<(img|source|video|audio|embed)\b[^>]*>/gi, (tag) => {
    let out = tag;
    for (const name of ['src', 'poster']) {
      const value = attr(out, name);
      if (!isLocal(value)) continue;
      const uri = ctx.uri(localPath(ctx.dir, value));
      if (uri) out = out.replace(value, uri);
    }
    const srcset = attr(out, 'srcset');
    if (srcset) {
      const next = srcset
        .split(',')
        .map((item) => {
          const parts = item.trim().split(/\s+/);
          if (!isLocal(parts[0])) return item.trim();
          const uri = ctx.uri(localPath(ctx.dir, parts[0]));
          if (uri) parts[0] = uri;
          return parts.join(' ');
        })
        .join(', ');
      out = out.replace(srcset, next);
    }
    return out;
  });
}

/** Кадры прокрутки: ключ — путь, который попросит скрипт после прореживания. */
function collectFrames(sections, ctx) {
  const packed = new Map();
  for (const section of sections) {
    section.chosen.forEach((source, index) => {
      const key = framePath(section.pattern, index, section.pad);
      const file = localPath(ctx.dir, framePath(section.pattern, source, section.pad));
      const uri = ctx.uri(file, 'frames');
      if (uri) packed.set(key, uri);
    });
  }
  return packed;
}

/**
 * Скрипт прокрутки просит кадры по именам файлов. Их рядом больше нет, поэтому
 * подменяем путь на встроенную картинку в тот момент, когда скрипт ставит src.
 */
function injectFrameShim(html, packed) {
  const map = JSON.stringify(Object.fromEntries(packed)).replace(/</g, '\\u003c');
  const script = `<script>
/* Кадры прокрутки лежат внутри этого файла. */
(function () {
  var files = ${map};
  window.mgenPackedFrames = files;
  var own = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  if (!own || !own.set) return;
  function find(value) {
    if (typeof value !== 'string' || value.slice(0, 5) === 'data:') return null;
    var key = value.replace(/^\\.\\//, '');
    if (files[key]) return files[key];
    for (var name in files) {
      if (files.hasOwnProperty(name) && value.length > name.length && value.slice(-name.length) === name) {
        return files[name];
      }
    }
    return null;
  }
  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    configurable: true,
    enumerable: own.enumerable,
    get: own.get,
    set: function (value) {
      own.set.call(this, find(value) || value);
    },
  });
})();
</script>`;
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${script}\n</head>`);
  return `${script}\n${html}`;
}

/** Собирает страницу в памяти: один файл без единого внешнего запроса. */
export async function buildPack({ dir, limit = DEFAULT_FRAMES, note, alert } = {}) {
  const indexPath = path.join(dir, 'index.html');
  if (!fs.existsSync(indexPath)) {
    throw new UserError(
      `В папке ${dir} нет index.html.`,
      `Укажите папку сайта: ${CLI_NAME} pack ./site --out сайт.html`,
    );
  }
  const ctx = makeContext(dir, { note, alert });
  let html = fs.readFileSync(indexPath, 'utf8');

  html = dropFontPreconnect(html);

  // Кадры считаем по исходной разметке: после инлайна скрипта в файле появится
  // его комментарий с примером разметки, и замена поймала бы пример вместо дела.
  const framed = rewriteFrameSections(html, limit);
  html = framed.html;

  html = await inlineGoogleFonts(html, ctx);
  html = inlineStyles(html, ctx);
  html = inlineScripts(html, ctx);

  const packed = collectFrames(framed.sections, ctx);

  html = inlineMedia(html, ctx);
  if (packed.size) html = injectFrameShim(html, packed);

  return { html, ctx, sections: framed.sections, indexPath };
}

function reportParts(kinds) {
  const parts = [
    [kinds.frames, ['кадр', 'кадра', 'кадров']],
    [kinds.images, ['картинка', 'картинки', 'картинок']],
    [kinds.styles, ['стиль', 'стиля', 'стилей']],
    [kinds.scripts, ['скрипт', 'скрипта', 'скриптов']],
    [kinds.fonts, ['шрифт', 'шрифта', 'шрифтов']],
    [kinds.media, ['видео', 'видео', 'видео']],
  ];
  const words = [];
  for (const [count, forms] of parts) {
    if (!count) continue;
    const tens = count % 100;
    const ones = count % 10;
    let form = forms[2];
    if (tens < 11 || tens > 14) {
      if (ones === 1) form = forms[0];
      else if (ones >= 2 && ones <= 4) form = forms[1];
    }
    words.push(`${count} ${form}`);
  }
  return words.join(', ');
}

export async function pack(argv) {
  const args = parse(argv, packFlags);
  const asked = args._[0] || '.';
  const dir = path.resolve(asked);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw new UserError(
      `Не вижу папку «${asked}».`,
      `Нужна папка сайта с index.html: ${CLI_NAME} pack ./site --out сайт.html`,
    );
  }

  const limit = args.frames === undefined ? DEFAULT_FRAMES : Math.round(args.frames);
  const maxMb = args['max-mb'] === undefined ? DEFAULT_MAX_MB : args['max-mb'];
  const outPath = path.resolve(args.out || `${path.basename(dir)}.html`);
  if (outPath === path.join(dir, 'index.html')) {
    throw new UserError(
      'Готовый файл затёр бы сам index.html.',
      'Положите его рядом: --out сайт.html',
    );
  }

  step(`Собираю ${path.basename(dir)}/index.html в один файл…`);
  const built = await buildPack({
    dir,
    limit,
    note: (text) => say(dim(`  ${text}`)),
    alert: (text) => warn(text),
  });

  const size = Buffer.byteLength(built.html);
  const total = built.ctx.files.size + built.ctx.kinds.styles + built.ctx.kinds.scripts + built.ctx.kinds.fonts;

  if (built.ctx.missing.length) {
    say('');
    warn(`Не нашёл ${built.ctx.missing.length} файл(ов) — они останутся ссылками:`);
    for (const file of built.ctx.missing.slice(0, 5)) say(dim(`  ${path.relative(dir, file)}`));
  }

  if (size > maxMb * 1024 * 1024) {
    say('');
    say(bold(`Файл получился тяжёлый: ${mb(size)}, а порог ${maxMb} МБ.`));
    say(dim(`Сделать легче: --frames 60, или поднять порог: --max-mb ${Math.ceil(size / 1024 / 1024)}`));
    if (!(await confirm({ yes: args.yes }))) {
      say('Ничего не записал.');
      return { written: false, size, built };
    }
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, built.html);

  say('');
  ok(`Готово: ${outPath}`);
  say(`  вес файла: ${mb(size)}`);
  say(`  внутри ${total} файлов: ${reportParts(built.ctx.kinds)}`);
  for (const section of built.sections) {
    if (section.chosen.length < section.sourceCount) {
      say(
        `  кадров было ${section.sourceCount}, оставил ${section.chosen.length} — data-count пересчитал`,
      );
    }
  }
  say('');
  say(dim('Файл открывается двойным щелчком и работает без интернета: внешних запросов нет.'));
  say(dim('Его можно переслать в мессенджере одним вложением.'));

  return { written: true, size, outPath, built };
}
