// mgen doctor — проверить, что всё на месте, и по-русски сказать, что чинить.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getCredits } from '../api.js';
import { configPath, findKey, keySource } from '../config.js';
import { findFfmpeg } from '../ffmpeg.js';
import { toUsd } from '../price.js';
import { ApiError } from '../errors.js';
import { CLI_NAME, CLI_VERSION } from '../brand.js';
import { bold, creditsText, dim, green, red, say, usd, yellow } from '../ui.js';

const good = (text, note) => say(`${green('✓')} ${text}${note ? dim(`  ${note}`) : ''}`);
const warnLine = (text, fix) => {
  say(`${yellow('!')} ${text}`);
  if (fix) say(dim(`   ${fix}`));
};
const badLine = (text, fix) => {
  say(`${red('✗')} ${text}`);
  if (fix) say(dim(`   ${fix}`));
};

export async function doctor() {
  let problems = 0;
  say('');
  say(bold(`Проверка ${CLI_NAME} ${CLI_VERSION}`));
  say('');

  // 1. Node
  const major = Number(process.versions.node.split('.')[0]);
  if (major >= 18) good(`Node.js ${process.versions.node}`, 'подходит');
  else {
    problems += 1;
    badLine(`Node.js ${process.versions.node} слишком старый`, 'Поставьте версию 18 или новее с https://nodejs.org');
  }

  // 2. Ключ
  const key = findKey();
  if (!key) {
    problems += 1;
    badLine('Ключ kie.ai не найден', `Возьмите ключ на https://kie.ai/api-key и запустите «${CLI_NAME} setup»`);
  } else {
    good('Ключ kie.ai найден', `источник: ${keySource()}`);
    if (fs.existsSync(configPath)) {
      const mode = fs.statSync(configPath).mode & 0o777;
      if (process.platform !== 'win32' && mode !== 0o600) {
        warnLine(
          `У файла с ключом права ${mode.toString(8)}, а должны быть 600`,
          `Исправить: chmod 600 ${configPath}`,
        );
      }
    }

    // 3. Баланс
    try {
      const balance = await getCredits(key);
      const line = `${creditsText(balance)} (примерно ${usd(toUsd(balance))})`;
      if (balance >= 50) good(`Баланс: ${line}`);
      else if (balance > 0) warnLine(`Баланс маловат: ${line}`, 'Пополните на https://kie.ai, 200 кредитов = $1');
      else {
        problems += 1;
        badLine('На балансе пусто', 'Пополните счёт на https://kie.ai');
      }
    } catch (error) {
      problems += 1;
      if (error instanceof ApiError && error.code === 401) {
        badLine('kie.ai не принял ключ', `Возьмите свежий на https://kie.ai/api-key и повторите «${CLI_NAME} setup»`);
      } else {
        badLine(`Не получилось спросить баланс: ${error.message}`, 'Проверьте интернет');
      }
    }
  }

  // 4. ffmpeg
  const ffmpeg = findFfmpeg();
  if (ffmpeg) {
    good('ffmpeg на месте', ffmpeg.own ? 'стоит рядом с mgen' : 'системный');
  } else {
    warnLine(
      'ffmpeg не найден — без него не работает только команда frames',
      `mgen поставит его сам при первом «${CLI_NAME} frames», по вашему согласию и без прав администратора`,
    );
  }

  // 5. Куда писать результаты
  try {
    const probe = path.join(process.cwd(), `.${CLI_NAME}-probe`);
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    good('В текущую папку можно записывать результаты', process.cwd());
  } catch {
    problems += 1;
    badLine('В текущую папку нельзя записывать', 'Перейдите в свою рабочую папку и повторите');
  }

  // 6. Навыки для Claude Code
  const skillsDir = path.join(os.homedir(), '.claude', 'skills');
  const installed = ['mgen', 'mgen-site'].filter((name) =>
    fs.existsSync(path.join(skillsDir, name, 'SKILL.md')),
  );
  if (installed.length === 2) good('Оба навыка для Claude Code установлены');
  else if (installed.length === 1) {
    warnLine(
      `Установлен только навык ${installed[0]}`,
      'Второй ставится копированием папки skill или skill-site в ~/.claude/skills (см. README)',
    );
  } else {
    warnLine(
      'Навыки для Claude Code не установлены',
      'Это не обязательно: команды работают и без них. Установка описана в README, раздел 8',
    );
  }

  say('');
  if (problems === 0) {
    say(green('Всё в порядке, можно работать.'));
  } else {
    say(red(`Нужно починить: ${problems}. Что именно — отмечено значком ✗ выше.`));
    process.exitCode = 1;
  }
  say('');
  return problems;
}
