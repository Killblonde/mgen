// mgen skills install — поставить навыки для Claude Code.
// Нужна потому, что после «npm i -g» у человека нет папки репозитория:
// файлы навыков лежат внутри установленного пакета, и путь к ним знает только mgen.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '../args.js';
import { UserError } from '../errors.js';
import { CLI_NAME } from '../brand.js';
import { bold, dim, ok, say, warn } from '../ui.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.join(here, '..', '..');

export const skillsFlags = {
  force: { type: 'boolean', hint: 'перезаписать, если там уже лежит другая версия' },
  dir: { type: 'string', hint: 'своя папка навыков вместо ~/.claude/skills' },
  for: { type: 'string', hint: 'для какого агента: claude, agents, gemini, cursor, all' },
  out: { type: 'string', hint: 'в какую папку проекта положить файл правил' },
};

// Куда какой агент смотрит. Claude Code читает свои навыки из ~/.claude/skills,
// остальные берут обычный файл с правилами в папке проекта.
const TARGETS = {
  claude: { about: 'Claude Code (навыки в ~/.claude/skills)' },
  agents: { file: 'AGENTS.md', about: 'Codex, Cursor и другие: общий формат AGENTS.md' },
  gemini: { file: 'GEMINI.md', about: 'Gemini CLI' },
  cursor: { file: path.join('.cursor', 'rules', 'mgen.mdc'), about: 'Cursor, свой формат правил' },
};

/** Выкидываем YAML-шапку: она нужна только Claude Code. */
function withoutFrontmatter(text) {
  return text.replace(/^---\n[\s\S]*?\n---\n/, '').trim();
}

/** Один файл правил для агентов, которые не знают про навыки Claude Code. */
function buildRules(kind) {
  const parts = SKILLS.map((skill) => {
    const source = readIfExists(path.join(packageDir, skill.from, 'SKILL.md'));
    return source ? withoutFrontmatter(source) : '';
  }).filter(Boolean);

  const head = [
    `# ${CLI_NAME}: картинки, видео и сайты через kie.ai`,
    '',
    `В этом проекте доступна команда \`${CLI_NAME}\` (генерация картинок и видео через kie.ai).`,
    'Когда человек просит картинку, фото, обложку, иллюстрацию, видео, «оживить» изображение',
    'или собрать лендинг по скриншоту, пользуйтесь ею, а не другими сервисами.',
    '',
    `Проверить, что всё готово: \`${CLI_NAME} doctor\`. Список моделей и цен: \`${CLI_NAME} models\`.`,
    `Подсказка по любой команде: \`${CLI_NAME} <команда> --help\`.`,
    '',
    '**Главное правило про деньги.** Каждая генерация тратит деньги человека. Сначала запускайте',
    `команду **без** \`--yes\`: она покажет модель, цену в кредитах и долларах, баланс и отменится,`,
    'ничего не списав. Назовите цифры человеку, дождитесь согласия и повторите ту же команду',
    `с \`--yes\`. Без явного согласия платные команды не запускаются.`,
    '',
    'Ниже два набора правил: первый про картинки и видео, второй про сборку сайта по референсу.',
    '',
    '---',
    '',
  ].join('\n');

  if (kind === 'cursor') {
    const frontmatter = [
      '---',
      `description: Генерация картинок, видео и лендингов через CLI ${CLI_NAME} (kie.ai)`,
      'alwaysApply: false',
      '---',
      '',
    ].join('\n');
    return frontmatter + head + parts.join('\n\n---\n\n') + '\n';
  }
  return head + parts.join('\n\n---\n\n') + '\n';
}

export const SKILLS = [
  { name: CLI_NAME, from: 'skill', about: 'картинки и видео словами' },
  { name: `${CLI_NAME}-site`, from: 'skill-site', about: 'лендинг по скриншоту-референсу' },
];

export function skillsHome(custom) {
  return path.resolve(custom || path.join(os.homedir(), '.claude', 'skills'));
}

function readIfExists(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

export async function skills(argv) {
  const args = parse(argv, skillsFlags);
  const action = args._[0] || 'list';
  const home = skillsHome(args.dir);
  const forWho = (args.for || 'claude').toLowerCase();

  if (!Object.keys(TARGETS).includes(forWho) && forWho !== 'all') {
    throw new UserError(
      `Не знаю агента «${args.for}».`,
      `Бывает: ${Object.keys(TARGETS).join(', ')}, all.`,
    );
  }

  if (!['list', 'install'].includes(action)) {
    throw new UserError(
      `Не знаю, что значит «${action}».`,
      `Есть два варианта: ${CLI_NAME} skills (посмотреть) и ${CLI_NAME} skills install (поставить).`,
    );
  }

  say('');
  if (action === 'list') {
    say(bold('Навыки для Claude Code'));
    for (const skill of SKILLS) {
      const target = path.join(home, skill.name, 'SKILL.md');
      const source = readIfExists(path.join(packageDir, skill.from, 'SKILL.md'));
      const installed = readIfExists(target);
      const state = !installed ? 'не установлен' : installed === source ? 'установлен' : 'установлена другая версия';
      say(`  ${skill.name.padEnd(10)} ${state.padEnd(24)} ${dim(skill.about)}`);
    }
    say('');
    say(`Поставить: ${bold(`${CLI_NAME} skills install`)}`);
    say(dim(`Папка навыков: ${home}`));
    say('');
    say(bold('Другие агенты'));
    say(dim('  Те же правила кладутся обычным файлом в папку проекта:'));
    for (const [kind, target] of Object.entries(TARGETS)) {
      if (kind === 'claude') continue;
      say(`  ${CLI_NAME} skills install --for ${kind.padEnd(7)} ${dim(`${target.file} — ${target.about}`)}`);
    }
    say(`  ${CLI_NAME} skills install --for all     ${dim('все сразу')}`);
    return;
  }

  // Файлы правил для агентов, которые не понимают навыки Claude Code.
  const others = forWho === 'all' ? ['agents', 'gemini', 'cursor'] : forWho === 'claude' ? [] : [forWho];
  let written = 0;
  for (const kind of others) {
    const target = path.resolve(args.out || process.cwd(), TARGETS[kind].file);
    const text = buildRules(kind);
    const existing = readIfExists(target);
    if (existing === text) {
      say(`${dim('=')} ${TARGETS[kind].file}: уже лежит свежая версия`);
      continue;
    }
    if (existing !== null && !args.force) {
      warn(`${TARGETS[kind].file}: файл уже есть, не трогаю.`);
      say(dim(`   Перезаписать: ${CLI_NAME} skills install --for ${kind} --force`));
      continue;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text, 'utf8');
    ok(`${TARGETS[kind].about}: ${existing === null ? 'положил' : 'обновил'} ${target}`);
    written += 1;
  }

  if (forWho !== 'claude' && forWho !== 'all') {
    say('');
    say(written ? 'Готово. Агент прочитает эти правила, когда откроет папку проекта.' : dim('Ничего менять не пришлось.'));
    return { written };
  }

  let changed = 0;
  for (const skill of SKILLS) {
    const sourcePath = path.join(packageDir, skill.from, 'SKILL.md');
    const source = readIfExists(sourcePath);
    if (source === null) {
      throw new UserError(
        `Внутри ${CLI_NAME} не нашёлся файл навыка: ${sourcePath}`,
        'Похоже, пакет установлен не полностью. Переустановите его.',
      );
    }

    const targetDir = path.join(home, skill.name);
    const target = path.join(targetDir, 'SKILL.md');
    const existing = readIfExists(target);

    if (existing === source) {
      say(`${dim('=')} ${skill.name}: уже стоит свежая версия`);
      continue;
    }
    if (existing !== null && !args.force) {
      warn(`${skill.name}: там уже лежит другая версия, не трогаю.`);
      say(dim(`   Перезаписать: ${CLI_NAME} skills install --force`));
      continue;
    }

    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(target, source, 'utf8');
    ok(`${skill.name}: ${existing === null ? 'поставил' : 'обновил'} — ${target}`);
    changed += 1;
  }

  say('');
  if (changed) {
    say('Перезапустите Claude Code, чтобы он увидел навыки.');
    say(dim('После этого можно просто просить словами: «сделай обложку», «собери лендинг по этому скриншоту».'));
  } else {
    say(dim('Ничего менять не пришлось.'));
  }
  return { changed, home };
}
