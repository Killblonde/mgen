// mgen status <id> — что с задачей, если генерация долгая. Готовое сразу скачивается.
import { getTask } from '../api.js';
import { parse } from '../args.js';
import { requireKey } from '../config.js';
import { downloadTo, outDir, writeSidecar } from '../download.js';
import { UserError } from '../errors.js';
import { fileBaseName } from '../naming.js';
import { toUsd } from '../price.js';
import { titleOf } from '../models.js';
import { CLI_NAME } from '../brand.js';
import { bold, credits, dim, ok, say, usd, warn } from '../ui.js';

export const statusFlags = {
  out: { type: 'string' },
};

const STATE_RU = {
  waiting: 'ждёт своей очереди',
  queuing: 'в очереди',
  generating: 'генерируется прямо сейчас',
  success: 'готово',
  fail: 'не получилось',
};

/** В ответе kie.ai параметры лежат строкой JSON, внутри — ещё одна строка JSON. */
function promptFromTask(info) {
  try {
    const param = typeof info.param === 'string' ? JSON.parse(info.param) : info.param || {};
    const input = typeof param.input === 'string' ? JSON.parse(param.input) : param.input || {};
    return input.prompt || 'generaciya';
  } catch {
    return 'generaciya';
  }
}

export async function status(argv) {
  const args = parse(argv, statusFlags);
  const taskId = args._[0];
  if (!taskId) {
    throw new UserError('Нужен номер задачи.', `Например: ${CLI_NAME} status dc1928bfcbc77cb6c85f3359a9c718b3`);
  }

  const key = requireKey();
  const info = await getTask(key, taskId);

  say('');
  say(`${bold('Задача')} ${taskId}`);
  say(`  модель:   ${titleOf(info.model)}`);
  say(`  состояние: ${STATE_RU[info.state] || info.state}`);
  if (info.creditsConsumed) {
    say(`  списано:  ${credits(info.creditsConsumed)} кредитов (примерно ${usd(toUsd(info.creditsConsumed))})`);
  }

  if (info.state === 'fail') {
    warn(`kie.ai не справился: ${info.failMsg || 'без объяснений'}`);
    say(dim('За неудачные генерации деньги не списываются.'));
    return;
  }

  if (info.state !== 'success') {
    say(dim(`Повтори команду через минуту: ${CLI_NAME} status ${taskId}`));
    return;
  }

  const urls = info.result?.resultUrls || [];
  if (!urls.length) {
    warn('kie.ai говорит «готово», но файла не отдал.');
    return;
  }

  const dir = outDir(args.out);
  const prompt = promptFromTask(info);
  let index = 0;
  for (const url of urls) {
    const base = fileBaseName({ prompt, index, total: urls.length, date: new Date() });
    const isVideo = /\.(mp4|mov|webm)(\?|$)/i.test(url);
    const filePath = await downloadTo(url, { dir, base, fallbackExt: isVideo ? '.mp4' : '.jpg' });
    await writeSidecar(filePath, {
      prompt,
      модель: info.model,
      цена_кредитов: Number(info.creditsConsumed || 0),
      taskId,
      ссылка: url,
      создано: new Date().toISOString(),
      инструмент: `${CLI_NAME} status`,
    });
    ok(`Скачал: ${filePath}`);
    index += 1;
  }
}
