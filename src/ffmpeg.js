// ffmpeg нужен только команде frames. Это отдельная программа, а не зависимость пакета:
// её может не быть, и тогда mgen предлагает поставить её рядом с собой, без прав администратора.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { configDir } from './config.js';
import { UserError } from './errors.js';
import { confirm } from './confirm.js';
import { bold, dim, ok, say, step, progress, progressDone } from './ui.js';
import { CLI_NAME } from './brand.js';

// Готовые сборки ffmpeg, по одному файлу на систему. Версия зафиксирована намеренно.
const RELEASE = 'b6.1.1';
const BASE = `https://github.com/eugeneware/ffmpeg-static/releases/download/${RELEASE}`;

const BUILDS = {
  'darwin-arm64': { asset: 'ffmpeg-darwin-arm64.gz', mb: 18.4 },
  'darwin-x64': { asset: 'ffmpeg-darwin-x64.gz', mb: 24.1 },
  'win32-x64': { asset: 'ffmpeg-win32-x64.gz', mb: 28.2 },
  'linux-x64': { asset: 'ffmpeg-linux-x64.gz', mb: 27.0 },
  'linux-arm64': { asset: 'ffmpeg-linux-arm64.gz', mb: 24.0 },
};

export const binDir = path.join(configDir, 'bin');
export const localFfmpeg = path.join(binDir, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');

function works(candidate) {
  try {
    const result = spawnSync(candidate, ['-version'], { encoding: 'utf8' });
    return result.status === 0 ? String(result.stdout).split('\n')[0] : null;
  } catch {
    return null;
  }
}

/** Где взять ffmpeg: переменная окружения, наша папка, системный. Иначе null. */
export function findFfmpeg() {
  const candidates = [process.env.MGEN_FFMPEG, localFfmpeg, 'ffmpeg'].filter(Boolean);
  for (const candidate of candidates) {
    const version = works(candidate);
    if (version) return { path: candidate, version, own: candidate === localFfmpeg };
  }
  return null;
}

/** Есть ffmpeg — отдаём. Нет — честно рассказываем, что и куда скачаем, и спрашиваем. */
export async function ensureFfmpeg({ yes } = {}) {
  const found = findFfmpeg();
  if (found) return found;

  const key = `${process.platform}-${process.arch}`;
  const build = BUILDS[key];
  if (!build) {
    throw new UserError(
      `Для вашей системы (${key}) у меня нет готовой сборки ffmpeg.`,
      'Поставьте ffmpeg сами (на Mac: brew install ffmpeg) и повторите команду.',
    );
  }

  say('');
  say(bold('Для нарезки видео на кадры нужна программа ffmpeg, её на компьютере нет.'));
  say(`  что скачаю:  ffmpeg ${RELEASE} (официальная сборка проекта ffmpeg-static)`);
  say(`  откуда:      ${BASE}/${build.asset}`);
  say(`  сколько:     примерно ${build.mb} МБ`);
  say(`  куда:        ${localFfmpeg}`);
  say(dim('  Права администратора не нужны, в систему ничего не прописывается.'));
  say(dim(`  Удалить потом: просто сотрите папку ${binDir}`));
  say('');

  if (!(await confirm({ yes }))) {
    throw new UserError(
      'Без ffmpeg нарезать видео на кадры нечем.',
      `Можно поставить его самому (на Mac: brew install ffmpeg) и повторить «${CLI_NAME} frames».`,
    );
  }

  step('Скачиваю ffmpeg…');
  const response = await fetch(`${BASE}/${build.asset}`, { redirect: 'follow' });
  if (!response.ok) {
    throw new UserError(
      `Не получилось скачать ffmpeg (ответ ${response.status}).`,
      'Проверьте интернет или поставьте ffmpeg сами.',
    );
  }
  const packed = Buffer.from(await response.arrayBuffer());
  const binary = zlib.gunzipSync(packed);

  fs.mkdirSync(binDir, { recursive: true, mode: 0o755 });
  fs.writeFileSync(localFfmpeg, binary, { mode: 0o755 });
  try {
    fs.chmodSync(localFfmpeg, 0o755);
  } catch {
    // На Windows прав как в unix нет.
  }

  const version = works(localFfmpeg);
  if (!version) {
    throw new UserError(
      'Скачал ffmpeg, но запустить его не удалось.',
      `Попробуйте удалить ${localFfmpeg} и поставить ffmpeg обычным способом.`,
    );
  }
  ok(`ffmpeg готов: ${localFfmpeg}`);
  return { path: localFfmpeg, version, own: true };
}

function run(bin, args) {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk) => {
      out += chunk;
    });
    child.stderr.on('data', (chunk) => {
      err += chunk;
    });
    child.on('error', (error) => resolve({ code: -1, out, err: String(error) }));
    child.on('close', (code) => resolve({ code, out, err }));
  });
}

/** Длительность в секундах из обычного вывода ffmpeg. ffprobe не нужен. */
export function parseDuration(text) {
  const match = String(text).match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

export async function videoDuration(bin, file) {
  const { err } = await run(bin, ['-hide_banner', '-i', file]);
  const duration = parseDuration(err);
  if (duration === null) {
    throw new UserError(
      `Не удалось прочитать видео: ${file}`,
      'Проверьте, что это обычный mp4 или mov.',
    );
  }
  return duration;
}

/** Режем видео на кадры: ровно count штук, ширина width, разумный вес. */
export async function extractFrames({ bin, input, outDir, count, width, quality }) {
  const duration = await videoDuration(bin, input);
  const fps = count / duration;
  fs.mkdirSync(outDir, { recursive: true });

  const pattern = path.join(outDir, 'frame-%04d.jpg');
  progress(`Режу видео на кадры (${count} шт.)…`);
  const { code, err } = await run(bin, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    input,
    '-vf',
    `fps=${fps.toFixed(6)},scale=${width}:-2:flags=lanczos`,
    '-frames:v',
    String(count),
    '-q:v',
    String(quality),
    pattern,
  ]);
  progressDone();

  if (code !== 0) {
    throw new UserError(
      'ffmpeg не справился с нарезкой видео.',
      err.split('\n').filter(Boolean).slice(-2).join(' ') || 'Проверьте файл видео.',
    );
  }

  const files = fs
    .readdirSync(outDir)
    .filter((name) => /^frame-\d+\.jpg$/.test(name))
    .sort();
  const bytes = files.reduce((sum, name) => sum + fs.statSync(path.join(outDir, name)).size, 0);
  return { files, bytes, duration };
}
