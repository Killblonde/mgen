// Общий сценарий любой генерации: показать план и цену, спросить согласие,
// создать задачи, спокойно дождаться результата, скачать файлы.
import { createTask, getCredits, getTask } from './api.js';
import { confirm } from './confirm.js';
import { downloadTo, outDir, writeSidecar } from './download.js';
import { UserError } from './errors.js';
import { fileBaseName } from './naming.js';
import { CREDITS_PER_USD, toUsd } from './price.js';
import { CLI_NAME } from './brand.js';
import { bold, credits as fmtCredits, dim, ok, progress, progressDone, say, seconds, step, usd, warn, yellow } from './ui.js';

const STATE_RU = {
  waiting: 'ждёт своей очереди',
  queuing: 'в очереди',
  generating: 'генерирую',
  success: 'готово',
  fail: 'не получилось',
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const onRetry = ({ waitMs, reason }) => {
  progressDone();
  warn(`${reason}. Подожду ${Math.round(waitMs / 1000)} сек и повторю.`);
};

/** Сколько ждать результат, прежде чем предложить вернуться позже. */
const maxWaitMs = (kind) => (kind === 'video' ? 60 : 20) * 60 * 1000;

/** Интервал опроса: сначала часто, потом спокойнее — чтобы не ловить лимит частоты. */
function pollInterval(elapsedMs) {
  if (elapsedMs < 30_000) return 3000;
  if (elapsedMs < 3 * 60_000) return 5000;
  return 10_000;
}

function printPlan({ modelTitle, kind, count, estimate, balance, extraLines }) {
  const what = kind === 'video' ? 'видео' : count > 1 ? 'картинок' : 'картинка';
  say('');
  say(bold('Что собираюсь сделать'));
  say(`  модель:    ${modelTitle}`);
  say(`  сколько:   ${count} ${what}`);
  for (const line of extraLines || []) say(`  ${line}`);
  say(`  цена:      ${fmtCredits(estimate.credits)} кредитов (примерно ${usd(estimate.usd)})`);
  say(`  баланс:    ${fmtCredits(balance)} кредитов (примерно ${usd(toUsd(balance))})`);
  say(dim(`  останется: ${fmtCredits(balance - estimate.credits)} кредитов`));
  say('');
}

/**
 * @param {object} job
 * @param {string} job.key ключ kie.ai
 * @param {string} job.modelId точное имя модели в API
 * @param {string} job.modelTitle человеческое имя модели
 * @param {'image'|'video'} job.kind
 * @param {object} job.input тело input для createTask
 * @param {number} job.count сколько вариантов
 * @param {object} job.estimate результат estimateImage/estimateVideo
 * @param {string[]} job.extraLines дополнительные строки плана
 * @param {object} job.meta что записать в JSON рядом с результатом
 * @param {object} job.options {yes, out}
 */
export async function runGeneration(job) {
  const { key, modelId, modelTitle, kind, input, count, estimate, extraLines, meta, options } = job;

  const balance = await getCredits(key);
  printPlan({ modelTitle, kind, count, estimate, balance, extraLines });

  if (estimate.credits > balance) {
    throw new UserError(
      `Не хватает кредитов: на балансе ${fmtCredits(balance)}, а нужно ${fmtCredits(estimate.credits)}.`,
      `Пополни баланс на https://kie.ai (${CREDITS_PER_USD} кредитов = $1) или возьми вариант подешевле: --draft.`,
    );
  }

  if (!(await confirm(options))) {
    say('Отменил, ничего не потратил.');
    return { cancelled: true, files: [] };
  }

  step(`Отправляю задачу${count > 1 ? ` (${count} штуки)` : ''} на kie.ai…`);
  const tasks = [];
  for (let i = 0; i < count; i += 1) {
    const taskId = await createTask(key, { model: modelId, input, onRetry });
    tasks.push({ taskId, index: i, state: 'waiting' });
    if (i + 1 < count) await sleep(400); // бережно к лимиту 20 запросов за 10 секунд
  }
  say(dim(`  номер задачи: ${tasks.map((t) => t.taskId).join(', ')}`));

  const started = Date.now();
  const limit = maxWaitMs(kind);
  let finished = 0;

  while (finished < tasks.length) {
    const elapsed = Date.now() - started;
    if (elapsed > limit) {
      progressDone();
      warn('kie.ai всё ещё считает. Это дольше обычного, но задача не потеряна.');
      for (const task of tasks.filter((t) => !['success', 'fail'].includes(t.state))) {
        say(dim(`  посмотреть позже: ${CLI_NAME} status ${task.taskId}`));
      }
      break;
    }

    await sleep(pollInterval(elapsed));

    for (const task of tasks) {
      if (['success', 'fail'].includes(task.state)) continue;
      const info = await getTask(key, task.taskId, onRetry);
      task.state = info.state;
      task.info = info;
      if (['success', 'fail'].includes(task.state)) finished += 1;
    }

    const stateNow = tasks.find((t) => !['success', 'fail'].includes(t.state))?.state || 'generating';
    const readyText = tasks.length > 1 ? `, готово ${finished} из ${tasks.length}` : '';
    progress(`⏳ ${seconds(Math.round((Date.now() - started) / 1000))} — ${STATE_RU[stateNow] || stateNow}${readyText}`);
  }
  progressDone();

  const dir = outDir(options.out);
  const files = [];
  let spent = 0;

  for (const task of tasks) {
    if (task.state === 'fail') {
      warn(`Вариант ${task.index + 1}: kie.ai не справился — ${task.info?.failMsg || 'без объяснений'}.`);
      continue;
    }
    if (task.state !== 'success') continue;

    const urls = task.info?.result?.resultUrls || [];
    if (!urls.length) {
      warn(`Вариант ${task.index + 1}: kie.ai сказал «готово», но файла не дал.`);
      continue;
    }
    spent += Number(task.info?.creditsConsumed || 0);

    for (const url of urls) {
      const base = fileBaseName({
        prompt: meta.prompt,
        index: task.index,
        total: tasks.length,
        date: new Date(),
      });
      const filePath = await downloadTo(url, {
        dir,
        base,
        fallbackExt: kind === 'video' ? '.mp4' : '.jpg',
      });
      await writeSidecar(filePath, {
        prompt: meta.prompt,
        модель: modelId,
        параметры: meta.params,
        цена_кредитов: Number(task.info?.creditsConsumed || estimate.credits / tasks.length),
        цена_долларов: Number(toUsd(Number(task.info?.creditsConsumed || estimate.credits / tasks.length)).toFixed(4)),
        taskId: task.taskId,
        ссылка: url,
        создано: new Date().toISOString(),
        инструмент: `${CLI_NAME} ${meta.command}`,
      });
      files.push(filePath);
      ok(`Готово: ${filePath}`);
    }
  }

  if (files.length) {
    const fact = spent > 0 ? spent : estimate.credits;
    say('');
    say(`Потрачено: ${fmtCredits(fact)} кредитов (примерно ${usd(toUsd(fact))}).`);
    say(dim(`Рядом с каждым файлом лежит .json — там промпт, модель и цена.`));
  } else if (finished === tasks.length) {
    say(yellow('Файлов нет. Деньги списываются только за удачные генерации.'));
  }

  return { files, tasks, cancelled: false };
}
