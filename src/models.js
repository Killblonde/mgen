// Реестр моделей: короткое имя для человека -> точное имя модели в API kie.ai
// и правила, как собрать для неё input. Параметры взяты из docs.kie.ai.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { UserError } from './errors.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const priceTable = JSON.parse(fs.readFileSync(path.join(here, '..', 'prices.json'), 'utf8'));

const ALL_RATIOS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9', 'auto'];

/** Картинки. */
export const imageModels = {
  pro: {
    alias: 'pro',
    id: 'nano-banana-pro',
    about: 'качественная, понимает сложные описания, держит сходство по фото',
    refsField: 'image_input',
    maxRefs: 10,
    ratios: ALL_RATIOS,
    resolutions: ['1K', '2K', '4K'],
    // У pro цена за 1K и 2K одинаковая, поэтому по умолчанию берём 2K.
    defaultResolution: '2K',
    build: ({ prompt, refUrls, ratio, resolution }) => ({
      prompt,
      ...(refUrls.length ? { image_input: refUrls } : {}),
      aspect_ratio: ratio,
      resolution,
      output_format: 'jpg',
    }),
  },
  draft: {
    alias: 'draft',
    id: 'nano-banana-2-1',
    about: 'в 4 раза дешевле pro, годится для черновиков, референсы понимает',
    refsField: 'image_input',
    maxRefs: 10,
    ratios: ALL_RATIOS,
    resolutions: ['1K', '2K', '4K'],
    build: ({ prompt, refUrls, ratio, resolution }) => ({
      prompt,
      ...(refUrls.length ? { image_input: refUrls } : {}),
      aspect_ratio: ratio,
      resolution,
      output_format: 'jpg',
    }),
  },
  sketch: {
    alias: 'sketch',
    id: 'z-image',
    about: 'самая дешёвая, быстрая, без референсов — только текстом',
    refsField: null,
    maxRefs: 0,
    ratios: ['1:1', '4:3', '3:4', '16:9', '9:16'],
    resolutions: ['1K'],
    build: ({ prompt, ratio }) => ({ prompt, aspect_ratio: ratio === 'auto' ? '1:1' : ratio }),
  },
  nb2: {
    alias: 'nb2',
    id: 'nano-banana-2',
    about: 'предыдущее поколение Nano Banana, середина по цене',
    refsField: 'image_input',
    maxRefs: 10,
    ratios: ALL_RATIOS,
    resolutions: ['1K', '2K', '4K'],
    build: ({ prompt, refUrls, ratio, resolution }) => ({
      prompt,
      ...(refUrls.length ? { image_input: refUrls } : {}),
      aspect_ratio: ratio,
      resolution,
      output_format: 'jpg',
    }),
  },
  lite: {
    alias: 'lite',
    id: 'nano-banana-2-lite',
    about: 'облегчённая Nano Banana 2, только 1K',
    refsField: 'image_urls',
    maxRefs: 10,
    ratios: ALL_RATIOS,
    resolutions: ['1K'],
    build: ({ prompt, refUrls, ratio }) => ({
      prompt,
      ...(refUrls.length ? { image_urls: refUrls } : {}),
      aspect_ratio: ratio,
    }),
  },
};

/** Правка готовой картинки. */
export const editModels = {
  edit: {
    alias: 'edit',
    id: 'google/nano-banana-edit',
    about: 'дешёвая правка готовой картинки',
    refsField: 'image_urls',
    maxRefs: 10,
    ratios: ALL_RATIOS,
    resolutions: ['1K'],
    build: ({ prompt, refUrls, ratio }) => ({
      prompt,
      image_urls: refUrls,
      aspect_ratio: ratio,
      output_format: 'png',
    }),
  },
  pro: {
    ...imageModels.pro,
    about: 'правка через Nano Banana Pro — дороже, но аккуратнее с деталями',
  },
};

/** Видео. */
export const videoModels = {
  video: {
    alias: 'video',
    id: 'bytedance/seedance-2-5',
    about: 'самая свежая Seedance, лучшее качество движения',
    resolutions: ['480p', '720p', '1080p'],
    duration: { min: 4, max: 30 },
    supportsLoop: true,
    build: buildSeedanceInput,
  },
  draft: {
    alias: 'draft',
    id: 'bytedance/seedance-2-mini',
    about: 'дешёвая Seedance для проб: в 7 раз дешевле',
    resolutions: ['480p', '720p'],
    duration: { min: 4, max: 15 },
    supportsLoop: true,
    build: buildSeedanceInput,
  },
  fast: {
    alias: 'fast',
    id: 'bytedance/seedance-2-fast',
    about: 'середина: быстрее и дешевле свежей Seedance',
    resolutions: ['480p', '720p'],
    duration: { min: 4, max: 15 },
    supportsLoop: true,
    build: buildSeedanceInput,
  },
};

function buildSeedanceInput({ prompt, imageUrl, duration, resolution, loop, audio }) {
  return {
    prompt,
    first_frame_url: imageUrl,
    // Петля: последний кадр = первый. У Seedance это штатный параметр, модель
    // сама придумывает движение, которое вернётся в исходную позу.
    ...(loop ? { last_frame_url: imageUrl } : {}),
    duration,
    resolution,
    aspect_ratio: 'adaptive',
    generate_audio: Boolean(audio),
    output_format: 'mp4',
  };
}

export function titleOf(modelId) {
  return priceTable.models[modelId]?.title || modelId;
}

export function pickModel(table, alias, { what }) {
  const model = table[alias];
  if (model) return model;
  const known = Object.keys(table).join(', ');
  throw new UserError(`Не знаю модель «${alias}» для ${what}.`, `Доступные: ${known}`);
}

export function checkRatio(model, ratio) {
  if (ratio === undefined) return undefined;
  if (model.ratios.includes(ratio)) return ratio;
  throw new UserError(
    `Модель ${titleOf(model.id)} не умеет формат ${ratio}.`,
    `Она умеет: ${model.ratios.filter((r) => r !== 'auto').join(', ')}`,
  );
}

export function checkResolution(model, resolution) {
  if (resolution === undefined) return undefined;
  if (model.resolutions.includes(resolution)) return resolution;
  throw new UserError(
    `Модель ${titleOf(model.id)} не умеет качество ${resolution}.`,
    `Она умеет: ${model.resolutions.join(', ')}`,
  );
}

export function checkDuration(model, duration) {
  const { min, max } = model.duration;
  if (duration < min || duration > max) {
    throw new UserError(
      `Модель ${titleOf(model.id)} делает видео от ${min} до ${max} секунд, а запрошено ${duration}.`,
      `Поставь --duration в диапазоне ${min}–${max}.`,
    );
  }
  return duration;
}
