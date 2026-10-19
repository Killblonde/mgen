// mgen frames видео.mp4 — нарезать видео на кадры для анимации при прокрутке страницы.
import fs from 'node:fs';
import path from 'node:path';
import { parse } from '../args.js';
import { UserError } from '../errors.js';
import { checkLocalFile } from '../upload.js';
import { ensureFfmpeg, extractFrames } from '../ffmpeg.js';
import { CLI_NAME } from '../brand.js';
import { bold, dim, ok, say, step } from '../ui.js';

export const framesFlags = {
  count: { type: 'number', hint: 'сколько кадров: --count 150' },
  width: { type: 'number', hint: 'ширина кадра в пикселях: --width 1600' },
  quality: { type: 'number', hint: 'качество JPEG, 2 лучше и тяжелее, 8 хуже и легче' },
  out: { type: 'string', hint: 'куда положить кадры: --out ./site/frames' },
  yes: { type: 'boolean', hint: 'согласиться на установку ffmpeg заранее' },
};

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} МБ`;

/** Разумные пределы: 150 кадров по 1600 пикселей — обычная настройка для прокрутки. */
export function frameOptions(args = {}) {
  const count = Math.round(args.count || 150);
  if (count < 10 || count > 600) {
    throw new UserError(
      `Кадров должно быть от 10 до 600, а запрошено ${count}.`,
      'Для прокрутки обычно хватает 120-180 кадров.',
    );
  }
  const width = Math.round(args.width || 1600);
  if (width < 320 || width > 3840) {
    throw new UserError(`Ширина кадра должна быть от 320 до 3840 пикселей, а запрошено ${width}.`);
  }
  const quality = Math.min(15, Math.max(2, Math.round(args.quality || 5)));
  return { count, width, quality };
}

export async function frames(argv) {
  const args = parse(argv, framesFlags);
  const input = args._[0];
  if (!input) {
    throw new UserError(
      'Не вижу, какое видео резать.',
      `Например: ${CLI_NAME} frames shapka.mp4 --out ./frames`,
    );
  }
  checkLocalFile(input);

  const { count, width, quality } = frameOptions(args);
  const outDir = path.resolve(args.out || path.join(process.cwd(), 'frames'));

  if (fs.existsSync(outDir) && fs.readdirSync(outDir).some((name) => /^frame-\d+\.jpg$/.test(name))) {
    say(dim(`В папке ${outDir} уже лежат кадры — они будут заменены.`));
  }

  const ffmpeg = await ensureFfmpeg({ yes: args.yes });
  step('Смотрю, что внутри видео…');

  const result = await extractFrames({
    bin: ffmpeg.path,
    input,
    outDir,
    count,
    width,
    quality,
    onAdjust: ({ what, from, to, info }) => {
      if (what === 'count') {
        say(
          dim(
            `В видео всего ${to} кадров (${info.fps} в секунду), поэтому режу ${to}, а не ${from}: лишние были бы дублями.`,
          ),
        );
      } else {
        say(dim(`Ширина исходного видео ${to} пикселей, беру её: растягивать до ${from} незачем.`));
      }
    },
  });

  const average = result.bytes / Math.max(1, result.files.length);
  say('');
  ok(`Готово: ${result.files.length} кадров в ${outDir}`);
  say(`  вес всех кадров: ${mb(result.bytes)} (в среднем ${Math.round(average / 1024)} КБ на кадр)`);
  say(`  длительность исходного видео: ${result.duration.toFixed(1)} сек`);
  say(dim(`  в разметке страницы поставьте data-count="${result.files.length}"`));

  if (average > 220 * 1024) {
    say('');
    say(bold('Кадры тяжеловаты для сайта.'));
    say(`Сделайте легче: ${CLI_NAME} frames ${input} --width 1280 --quality 7`);
  }

  say('');
  say(dim('Кадры называются frame-0001.jpg и дальше по порядку — ровно так их ждёт'));
  say(dim('шаблон анимации при прокрутке из папки templates/scroll в репозитории mgen.'));

  return { dir: outDir, ...result };
}
