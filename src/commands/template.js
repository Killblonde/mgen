// mgen template scroll --out ./site — положить готовые файлы анимации при прокрутке
// в папку проекта. Ничего не скачивает и не стоит денег: файлы лежат внутри mgen.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '../args.js';
import { UserError } from '../errors.js';
import { CLI_NAME } from '../brand.js';
import { dim, ok, say } from '../ui.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const templatesDir = path.join(here, '..', '..', 'templates');

export const templateFlags = {
  out: { type: 'string', hint: 'куда положить файлы: --out ./site' },
  force: { type: 'boolean' },
};

export const TEMPLATES = {
  scroll: {
    about: 'анимация при прокрутке: кадры рисуются на холсте',
    dir: 'scroll',
    files: ['scroll-frames.js', 'scroll-frames.css'],
    extra: ['README.md', 'example.html'],
  },
};

export async function template(argv) {
  const args = parse(argv, templateFlags);
  const name = args._[0];

  if (!name) {
    say('');
    say('Готовые куски для сайта:');
    for (const [key, item] of Object.entries(TEMPLATES)) {
      say(`  ${key.padEnd(8)} ${item.about}`);
    }
    say('');
    say(dim(`Положить к себе: ${CLI_NAME} template scroll --out ./site`));
    return;
  }

  const item = TEMPLATES[name];
  if (!item) {
    throw new UserError(
      `Не знаю шаблон «${name}».`,
      `Есть: ${Object.keys(TEMPLATES).join(', ')}`,
    );
  }

  const outDir = path.resolve(args.out || process.cwd());
  fs.mkdirSync(outDir, { recursive: true });

  const copied = [];
  for (const file of item.files) {
    const from = path.join(templatesDir, item.dir, file);
    const to = path.join(outDir, file);
    if (fs.existsSync(to) && !args.force) {
      say(dim(`Пропускаю ${file}: такой файл уже есть (перезаписать: --force)`));
      continue;
    }
    fs.copyFileSync(from, to);
    copied.push(to);
  }

  if (copied.length) {
    ok(`Положил ${copied.length} файла в ${outDir}`);
    for (const file of copied) say(`  ${path.basename(file)}`);
  }
  say('');
  say(dim('Как подключить: смотрите templates/scroll/README.md в репозитории mgen'));
  say(dim(`или пример разметки там же в example.html.`));
  return { copied, outDir };
}
