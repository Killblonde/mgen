// Ошибки, которые человек поймёт без гугла.
import { fail, say, dim } from './ui.js';
import { CLI_NAME } from './brand.js';

/** Ошибка, текст которой можно показать как есть. */
export class UserError extends Error {
  constructor(message, hint) {
    super(message);
    this.name = 'UserError';
    this.hint = hint;
  }
}

/** Ответ kie.ai с кодом не 200 (напомню: HTTP при этом тоже 200). */
export class ApiError extends UserError {
  constructor(code, msg, context = {}) {
    super(humanMessage(code, msg, context), hintFor(code));
    this.name = 'ApiError';
    this.code = code;
    this.apiMessage = msg;
  }
}

function humanMessage(code, msg, context) {
  switch (code) {
    case 401:
      return 'kie.ai не принял ключ: он неверный, отозван или не передан.';
    case 402:
      return context.needCredits
        ? `Не хватает кредитов: на балансе ${context.balance ?? '?'}, нужно примерно ${context.needCredits}.`
        : 'Не хватает кредитов на балансе kie.ai.';
    case 429:
      return 'kie.ai просит сбавить темп: слишком много запросов подряд.';
    case 422:
      return `kie.ai не принял параметры запроса: ${msg || 'без подробностей'}.`;
    case 404:
      return 'kie.ai не нашёл такую задачу или адрес.';
    default:
      return `kie.ai вернул ошибку ${code}: ${msg || 'без подробностей'}.`;
  }
}

function hintFor(code) {
  switch (code) {
    case 401:
      return `Запусти «${CLI_NAME} setup» и вставь свежий ключ со страницы https://kie.ai/api-key`;
    case 402:
      return 'Пополни баланс на https://kie.ai (раздел Billing), 200 кредитов = $1.';
    case 429:
      return 'Подожди 10–20 секунд и повтори. Лимит — 20 новых генераций за 10 секунд.';
    default:
      return undefined;
  }
}

/** Сеть не ответила вовсе. */
export class NetworkError extends UserError {
  constructor(cause) {
    super('kie.ai не ответил — похоже, проблема со связью.', 'Проверь интернет и повтори команду.');
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

export function reportError(error) {
  if (error instanceof UserError) {
    fail(error.message);
    if (error.hint) say(dim(`   ${error.hint}`));
    return;
  }
  fail(error?.message || 'Что-то сломалось.');
  if (process.env.MGEN_DEBUG) say(dim(String(error?.stack || error)));
  else say(dim('   Подробности: запусти ту же команду с MGEN_DEBUG=1'));
}
