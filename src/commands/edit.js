// mgen edit картинка.jpg "что изменить" — правка готовой картинки.
import { joinPrompt, parse } from '../args.js';
import { requireKey } from '../config.js';
import { UserError } from '../errors.js';
import { checkRatio, editModels, pickModel, titleOf } from '../models.js';
import { estimateImage } from '../price.js';
import { runGeneration } from '../run.js';
import { toRemoteUrl } from '../upload.js';
import { CLI_NAME } from '../brand.js';
import { step } from '../ui.js';

export const editFlags = {
  size: { type: 'string', hint: 'формат кадра: --size 16:9' },
  model: { type: 'string', hint: 'edit (дешёвая) или pro (аккуратнее)' },
  ref: { type: 'string', multiple: true, hint: 'ещё картинки-подсказки: --ref стиль.jpg' },
  n: { type: 'number', hint: 'сколько вариантов правки: --n 2' },
  out: { type: 'string' },
  yes: { type: 'boolean' },
};

export async function edit(argv) {
  const args = parse(argv, editFlags);
  const [file, ...rest] = args._;
  const prompt = joinPrompt(rest);

  if (!file || !prompt) {
    throw new UserError(
      'Нужны два слагаемых: какую картинку правим и что изменить.',
      `Например: ${CLI_NAME} edit cover.jpg "убери лишние предметы со стола"`,
    );
  }

  const key = requireKey();
  const model = pickModel(editModels, args.model || 'edit', { what: 'правки' });
  const count = Math.max(1, Math.round(args.n || 1));

  step('Загружаю картинку в kie.ai (бесплатно)…');
  const refUrls = [await toRemoteUrl(key, file)];
  for (const ref of args.ref || []) refUrls.push(await toRemoteUrl(key, ref));

  const ratio = checkRatio(model, args.size) || 'auto';
  const resolution = model.defaultResolution || model.resolutions[0];
  const estimate = estimateImage(model.id, { resolution, count });

  return runGeneration({
    key,
    modelId: model.id,
    modelTitle: titleOf(model.id),
    kind: 'image',
    input: model.build({ prompt, refUrls, ratio, resolution }),
    count,
    estimate,
    extraLines: [`исходник:  ${file}`, `формат:    ${ratio === 'auto' ? 'как у исходника (auto)' : ratio}`],
    meta: {
      prompt,
      command: 'edit',
      params: { исходник: file, формат: ratio, вариантов: count },
    },
    options: { yes: args.yes, out: args.out },
  });
}
