// mgen image "промпт" — картинка по описанию, при желании по своим фото-референсам.
import { joinPrompt, normalizeQuality, parse } from '../args.js';
import { requireKey } from '../config.js';
import { UserError } from '../errors.js';
import { checkRatio, checkResolution, imageModels, pickModel, titleOf } from '../models.js';
import { estimateImage } from '../price.js';
import { runGeneration } from '../run.js';
import { toRemoteUrl } from '../upload.js';
import { CLI_NAME } from '../brand.js';
import { dim, say, step } from '../ui.js';

export const imageFlags = {
  ref: { type: 'string', multiple: true, hint: 'путь к своему фото: --ref photo.jpg' },
  size: { type: 'string', hint: 'формат кадра: --size 16:9' },
  n: { type: 'number', hint: 'сколько вариантов: --n 3' },
  draft: { type: 'boolean', hint: 'дешёвая модель для черновиков' },
  quality: { type: 'string', hint: 'качество: --quality 4k' },
  model: { type: 'string', hint: 'имя модели из «mgen models»' },
  out: { type: 'string', hint: 'куда сохранить: --out ./covers' },
  yes: { type: 'boolean', hint: 'не спрашивать подтверждение (цена всё равно видна)' },
};

export async function image(argv) {
  const args = parse(argv, imageFlags);
  const prompt = joinPrompt(args._);
  if (!prompt) {
    throw new UserError(
      'Не вижу описания картинки.',
      `Например: ${CLI_NAME} image "портрет у окна, мягкий свет" --size 4:5`,
    );
  }

  const key = requireKey();
  const alias = args.model || (args.draft ? 'draft' : 'pro');
  const model = pickModel(imageModels, alias, { what: 'картинок' });

  const refs = args.ref || [];
  if (refs.length && !model.refsField) {
    throw new UserError(
      `Модель ${titleOf(model.id)} не умеет работать с референсами.`,
      'Для фото по своим снимкам возьми --draft (дешёвая) или модель по умолчанию pro.',
    );
  }
  if (refs.length > model.maxRefs) {
    throw new UserError(`Эта модель берёт не больше ${model.maxRefs} референсов, а их ${refs.length}.`);
  }

  const count = Math.max(1, Math.round(args.n || 1));
  if (count > 8) throw new UserError('Больше 8 вариантов за раз — перебор.', 'Поставь --n 8 или меньше.');

  const ratio = checkRatio(model, args.size) || (model.alias === 'sketch' ? '1:1' : 'auto');
  const resolution =
    checkResolution(model, normalizeQuality(args.quality)) ||
    model.defaultResolution ||
    model.resolutions[0];

  const refUrls = [];
  if (refs.length) {
    step(`Загружаю референсы в kie.ai (${refs.length} шт., бесплатно)…`);
    for (const ref of refs) refUrls.push(await toRemoteUrl(key, ref));
  }

  const estimate = estimateImage(model.id, { resolution, count });
  const extraLines = [
    `формат:    ${ratio === 'auto' ? 'как решит модель (auto)' : ratio}`,
    `качество:  ${resolution}`,
    ...(refUrls.length ? [`референсы: ${refs.length} шт.`] : []),
  ];

  const result = await runGeneration({
    key,
    modelId: model.id,
    modelTitle: titleOf(model.id),
    kind: 'image',
    input: model.build({ prompt, refUrls, ratio, resolution }),
    count,
    estimate,
    extraLines,
    meta: {
      prompt,
      command: 'image',
      params: { формат: ratio, качество: resolution, вариантов: count, референсы: refs },
    },
    options: { yes: args.yes, out: args.out },
  });

  if (result.files.length && count > 1) {
    say('');
    say(dim('Выбери лучший вариант и повтори его промпт без --draft — получишь финал в качестве.'));
  }
  return result;
}
