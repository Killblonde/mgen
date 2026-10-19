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
  force: { type: 'boolean', hint: 'перезаписать файлы, если они уже есть' },
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
  if (name === 'scroll') {
    say('');
    say('Как подключить (вставьте в свою страницу):');
    say(dim('  <link rel="stylesheet" href="scroll-frames.css">'));
    say(dim('  <section class="mgen-scroll" data-frames="frames/frame-$.jpg" data-count="120" data-pad="4">'));
    say(dim('    <div class="mgen-scroll__sticky">'));
    say(dim('      <canvas class="mgen-scroll__canvas"></canvas>'));
    say(dim('      <img class="mgen-scroll__fallback" src="frames/frame-0001.jpg" alt="">'));
    say(dim('      <div class="mgen-scroll__overlay"><h1>Заголовок поверх кадров</h1></div>'));
    say(dim('    </div>'));
    say(dim('  </section>'));
    say(dim('  <script src="scroll-frames.js"></script>'));
    say('');
    say(dim('data-count — сколько кадров нарезала команда frames, она сама это печатает.'));
  }
  return { copied, outDir };
}
