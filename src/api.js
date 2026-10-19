// Общение с kie.ai. Важная особенность: ошибки приходят с HTTP 200
// и кодом внутри тела ответа, поэтому code проверяем всегда.
import { ApiError, NetworkError, UserError } from './errors.js';

export const API_BASE = 'https://api.kie.ai';
export const UPLOAD_BASE = 'https://kieai.redpandaai.co';

const RETRY_CODES = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 5;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Один запрос к kie.ai с повторами при лимите частоты и сбоях сервера.
 * onRetry({attempt, waitMs, reason}) — чтобы показать человеку, что мы ждём, а не висим.
 */
export async function request(key, { path, method = 'GET', query, body, baseUrl = API_BASE, onRetry }) {
  const url = new URL(path, baseUrl);
  for (const [name, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== null) url.searchParams.set(name, String(value));
  }

  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${key}`,
          ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
      });
    } catch (error) {
      lastError = new NetworkError(error);
      await waitBeforeRetry({ attempt, onRetry, reason: 'сеть не ответила' });
      continue;
    }

    if (response.status >= 500 || response.status === 429) {
      lastError = new ApiError(response.status, `сервер вернул HTTP ${response.status}`);
      await waitBeforeRetry({ attempt, onRetry, reason: `kie.ai отвечает ошибкой ${response.status}` });
      continue;
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new UserError(
        'kie.ai ответил не тем, что ожидалось.',
        'Попробуй повторить команду через минуту.',
      );
    }

    const code = Number(payload?.code ?? response.status);
    if (code === 200) return payload;

    if (RETRY_CODES.has(code) && attempt < MAX_ATTEMPTS) {
      lastError = new ApiError(code, payload?.msg);
      await waitBeforeRetry({
        attempt,
        onRetry,
        reason: code === 429 ? 'kie.ai просит сбавить темп' : `kie.ai отвечает ошибкой ${code}`,
      });
      continue;
    }

    throw new ApiError(code, payload?.msg);
  }

  throw lastError ?? new NetworkError();
}

async function waitBeforeRetry({ attempt, onRetry, reason }) {
  if (attempt >= MAX_ATTEMPTS) return;
  const waitMs = Math.min(30000, 2000 * 2 ** (attempt - 1));
  onRetry?.({ attempt, waitMs, reason });
  await sleep(waitMs);
}

/** Баланс в кредитах. */
export async function getCredits(key) {
  const payload = await request(key, { path: '/api/v1/chat/credit' });
  return Number(payload.data);
}

/** Создать задачу генерации. Возвращает taskId. */
export async function createTask(key, { model, input, onRetry }) {
  const payload = await request(key, {
    path: '/api/v1/jobs/createTask',
    method: 'POST',
    body: { model, input },
    onRetry,
  });
  const taskId = payload?.data?.taskId;
  if (!taskId) throw new UserError('kie.ai не вернул номер задачи.', 'Повтори команду.');
  return taskId;
}

/** Состояние задачи: waiting | queuing | generating | success | fail. */
export async function getTask(key, taskId, onRetry) {
  const payload = await request(key, {
    path: '/api/v1/jobs/recordInfo',
    query: { taskId },
    onRetry,
  });
  const data = payload.data || {};
  let result = data.response;
  if (!result && data.resultJson) {
    try {
      result = JSON.parse(data.resultJson);
    } catch {
      result = undefined;
    }
  }
  return { ...data, result };
}
