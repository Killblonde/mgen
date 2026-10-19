// mgen video картинка.jpg "что происходит в кадре" — видео из одной картинки.
import { joinPrompt, normalizeResolution, parse } from '../args.js';
import { requireKey } from '../config.js';
import { UserError } from '../errors.js';
import { checkDuration, checkResolution, pickModel, titleOf, videoModels } from '../models.js';
import { estimateVideo } from '../price.js';
import { runGeneration } from '../run.js';
import { toRemoteUrl } from '../upload.js';
import { CLI_NAME } from '../brand.js';
import { dim, say, step } from '../ui.js';

export const videoFlags = {
  duration: { type: 'number', hint: 'длительность в секундах: --duration 5' },
  resolution: { type: 'string', hint: 'разрешение: --resolution 720p' },
  loop: { type: 'boolean' },
  audio: { type: 'boolean' },
  draft: { type: 'boolean' },
  model: { type: 'string', hint: 'имя модели из «mgen models»' },
  out: { type: 'string' },
  yes: { type: 'boolean' },
};

export async function video(argv) {
  const args = parse(argv, videoFlags);
  const [file, ...rest] = args._;
  const prompt = joinPrompt(rest);

  if (!file || !prompt) {
    throw new UserError(
      'Нужна картинка и описание движения.',
      `Например: ${CLI_NAME} video portret.jpg "лёгкий ветер в волосах, камера чуть приближается"`,
    );
  }

  const key = requireKey();
  const model = pickModel(videoModels, args.model || (args.draft ? 'draft' : 'video'), { what: 'видео' });
  const duration = checkDuration(model, Math.round(args.duration || 5));
  const resolution = checkResolution(model, normalizeResolution(args.resolution)) || '480p';

  if (args.loop && !model.supportsLoop) {
    throw new UserError(
      `Модель ${titleOf(model.id)} не умеет возвращать картинку к исходной позе.`,
      'Для петли возьми модель video или draft (Seedance) — у них это штатная возможность.',
    );
  }

  step('Загружаю картинку в kie.ai (бесплатно)…');
  const imageUrl = await toRemoteUrl(key, file);

  const estimate = estimateVideo(model.id, { resolution, duration });
  const extraLines = [
    `из картинки: ${file}`,
    `длительность: ${duration} сек`,
    `разрешение: ${resolution}`,
    `звук:      ${args.audio ? 'да' : 'нет'}`,
    ...(args.loop ? ['петля:     да (последний кадр = первый)'] : []),
  ];

  const result = await runGeneration({
    key,
    modelId: model.id,
    modelTitle: titleOf(model.id),
    kind: 'video',
    input: model.build({ prompt, imageUrl, duration, resolution, loop: args.loop, audio: args.audio }),
    count: 1,
    estimate,
    extraLines,
    meta: {
      prompt,
      command: 'video',
      params: {
        исходная_картинка: file,
        длительность_сек: duration,
        разрешение: resolution,
        петля: Boolean(args.loop),
        звук: Boolean(args.audio),
      },
    },
    options: { yes: args.yes, out: args.out },
  });

  if (result.files.length) {
    say('');
    say(dim('Видео делается минуту-другую. Если нужно дешевле — добавь --draft, если красивее — --resolution 720p.'));
  }
  return result;
}
