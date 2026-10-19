// mgen models — какие модели есть и сколько стоит одна генерация.
import { editModels, imageModels, priceTable, videoModels } from '../models.js';
import { estimateImage, estimateVideo, toUsd } from '../price.js';
import { CLI_NAME } from '../brand.js';
import { bold, credits, dim, say, usd } from '../ui.js';

function imageLine(model) {
  const res = model.defaultResolution || model.resolutions[0];
  const { credits: c } = estimateImage(model.id, { resolution: res });
  const name = priceTable.models[model.id].title;
  return `  ${model.alias.padEnd(7)} ${name.padEnd(28)} ${credits(c).padStart(5)} кр = ${usd(toUsd(c)).padStart(7)}  ${dim(model.about)}`;
}

function videoLine(model) {
  const { credits: c } = estimateVideo(model.id, { resolution: '480p', duration: 5 });
  const name = priceTable.models[model.id].title;
  return `  ${model.alias.padEnd(7)} ${name.padEnd(28)} ${credits(c).padStart(5)} кр = ${usd(toUsd(c)).padStart(7)}  ${dim(model.about)}`;
}

export async function models() {
  say('');
  say(bold('Картинки') + dim('  (цена за одну картинку)'));
  for (const model of Object.values(imageModels)) say(imageLine(model));
  say('');
  say(bold('Правка готовой картинки') + dim('  (команда edit)'));
  for (const [alias, model] of Object.entries(editModels)) say(imageLine({ ...model, alias }));
  say('');
  say(bold('Видео') + dim('  (цена за ролик 5 секунд, 480p)'));
  for (const model of Object.values(videoModels)) say(videoLine(model));
  say('');
  say(`Как выбрать: по умолчанию берётся качественная модель, флаг ${bold('--draft')} — дешёвая,`);
  say(`а ${bold('--model <имя>')} — конкретная из списка выше.`);
  say('');
  say(dim(`Цены сверены ${priceTable.updated} по ${priceTable.source}. ${priceTable.creditsPerUsd} кредитов = $1.`));
  say(dim(`Видео считается за секунду, поэтому ролик на 10 секунд стоит вдвое дороже пятисекундного.`));
  say(dim(`Обновить цены: см. PRICES.md в папке ${CLI_NAME}.`));
}
