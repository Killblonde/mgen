// Цены считаем из prices.json: кредиты и примерная сумма в долларах.
import { priceTable } from './models.js';
import { UserError } from './errors.js';

export const CREDITS_PER_USD = priceTable.creditsPerUsd;

export function toUsd(credits) {
  return credits / CREDITS_PER_USD;
}

function priceFor(modelId, tier) {
  const entry = priceTable.models[modelId];
  if (!entry) {
    throw new UserError(
      `Для модели ${modelId} нет цены в prices.json.`,
      'Обнови таблицу цен по инструкции из PRICES.md.',
    );
  }
  const price = entry.prices[tier] ?? Object.values(entry.prices)[0];
  if (price === undefined) {
    throw new UserError(`Для модели ${modelId} нет цены за «${tier}» в prices.json.`);
  }
  return price;
}

/** Картинки: цена за штуку × количество. */
export function estimateImage(modelId, { resolution = '1K', count = 1 }) {
  const per = priceFor(modelId, resolution);
  const credits = per * count;
  return { per, credits, usd: toUsd(credits), unit: 'за картинку' };
}

/** Видео: цена за секунду × длительность. */
export function estimateVideo(modelId, { resolution = '480p', duration = 5, count = 1 }) {
  const per = priceFor(modelId, resolution);
  const credits = per * duration * count;
  return { per, credits, usd: toUsd(credits), unit: 'за секунду' };
}
