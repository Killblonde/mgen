// mgen setup — спросить ключ, проверить его запросом баланса, сохранить в домашней папке.
import { getCredits } from '../api.js';
import { askSecret } from '../confirm.js';
import { configPath, writeConfig } from '../config.js';
import { ApiError, UserError } from '../errors.js';
import { toUsd } from '../price.js';
import { CLI_NAME } from '../brand.js';
import { bold, creditsText, dim, ok, say, step, usd } from '../ui.js';

export async function setup() {
  say('');
  say(bold('Настройка доступа к kie.ai'));
  say('Ключ берётся на странице https://kie.ai/api-key — скопируй его целиком.');
  say(dim('При вводе ключ не отображается. Он сохранится только в твоей домашней папке.'));
  say('');

  const key = await askSecret('Вставь ключ и нажми Enter: ');
  if (!key) throw new UserError('Ключ не введён — ничего не сохранил.');

  step('Проверяю ключ у kie.ai…');
  let balance;
  try {
    balance = await getCredits(key);
  } catch (error) {
    if (error instanceof ApiError && error.code === 401) {
      throw new UserError(
        'Этот ключ kie.ai не принял. Ничего не сохранил.',
        'Скопируй ключ заново со страницы https://kie.ai/api-key (целиком, без пробелов) и повтори setup.',
      );
    }
    throw error;
  }

  writeConfig({ apiKey: key, savedAt: new Date().toISOString() });
  ok('Ключ принят и сохранён.');
  say(`Баланс: ${creditsText(balance)} (примерно ${usd(toUsd(balance))}).`);
  say(dim(`Файл с ключом: ${configPath} (только для тебя, права 600).`));
  say(dim('Если задать переменную окружения KIE_API_KEY, она важнее этого файла.'));
  say('');
  say(`Можно пробовать: ${bold(`${CLI_NAME} image "кот в скафандре" --draft`)}`);
}
