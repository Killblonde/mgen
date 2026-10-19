// mgen balance — сколько кредитов осталось и на что их примерно хватит.
import { getCredits } from '../api.js';
import { requireKey, keySource } from '../config.js';
import { estimateImage, estimateVideo, toUsd } from '../price.js';
import { imageModels, videoModels } from '../models.js';
import { bold, creditsText, dim, say, usd } from '../ui.js';

export async function balance() {
  const key = requireKey();
  const value = await getCredits(key);

  const pro = estimateImage(imageModels.pro.id, { resolution: '2K' }).credits;
  const draft = estimateImage(imageModels.draft.id, { resolution: '1K' }).credits;
  const video = estimateVideo(videoModels.draft.id, { resolution: '480p', duration: 5 }).credits;

  say('');
  say(`${bold('Баланс:')} ${creditsText(value)} (примерно ${usd(toUsd(value))})`);
  say('');
  say('Этого хватит примерно на:');
  say(`  ${Math.floor(value / pro)} качественных картинок (Nano Banana Pro)`);
  say(`  ${Math.floor(value / draft)} черновиков`);
  say(`  ${Math.floor(value / video)} черновых видео по 5 секунд`);
  say('');
  say(dim(`Ключ взят из: ${keySource()}`));
}
