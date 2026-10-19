// Разбор команды и подсказка. Всё по-русски, без жаргона.
import { CLI_NAME, CLI_VERSION } from './brand.js';
import { UserError } from './errors.js';
import { balance } from './commands/balance.js';
import { doctor } from './commands/doctor.js';
import { frames } from './commands/frames.js';
import { template } from './commands/template.js';
import { edit } from './commands/edit.js';
import { image } from './commands/image.js';
import { models } from './commands/models.js';
import { setup } from './commands/setup.js';
import { status } from './commands/status.js';
import { video } from './commands/video.js';
import { bold, dim, say } from './ui.js';

const COMMANDS = {
  setup: { run: setup, about: 'сохранить ключ kie.ai' },
  balance: { run: balance, about: 'сколько осталось кредитов' },
  models: { run: models, about: 'список моделей и цены' },
  image: { run: image, about: 'сделать картинку по описанию' },
  edit: { run: edit, about: 'поправить готовую картинку' },
  video: { run: video, about: 'оживить картинку — сделать видео' },
  frames: { run: frames, about: 'нарезать видео на кадры для прокрутки' },
  template: { run: template, about: 'положить готовый кусок для сайта' },
  status: { run: status, about: 'что с долгой задачей' },
  doctor: { run: doctor, about: 'проверить, всё ли готово к работе' },
};

function help() {
  say('');
  say(`${bold(`${CLI_NAME}`)} — картинки и видео через kie.ai одной командой. Версия ${CLI_VERSION}.`);
  say('');
  say(bold('Команды'));
  for (const [name, command] of Object.entries(COMMANDS)) {
    say(`  ${CLI_NAME} ${name.padEnd(8)} ${command.about}`);
  }
  say('');
  say(bold('Примеры'));
  say(`  ${CLI_NAME} setup`);
  say(`  ${CLI_NAME} image "обложка: ноутбук на столе у окна, утренний свет" --size 16:9`);
  say(`  ${CLI_NAME} image "портрет в деловом стиле" --ref я1.jpg --ref я2.jpg --ref я3.jpg`);
  say(`  ${CLI_NAME} image "иконка приложения, минимализм" --draft --n 3`);
  say(`  ${CLI_NAME} edit cover.jpg "сделай фон темнее, добавь мягкое свечение"`);
  say(`  ${CLI_NAME} video portret.jpg "лёгкое дыхание ветра, камера чуть приближается" --loop`);
  say(`  ${CLI_NAME} video start.jpg "камера отъезжает назад" --end finish.jpg --res 720`);
  say(`  ${CLI_NAME} frames shapka.mp4 --out ./site/frames`);
  say('');
  say(bold('Полезное'));
  say(`  --draft   дешёвая модель для проб        --n 3        три варианта сразу`);
  say(`  --size    формат кадра: 1:1 16:9 9:16 4:5  --quality 4k качество картинки`);
  say(`  --ref     своё фото как образец           --yes        не спрашивать подтверждение`);
  say(`  --out     куда положить результат         --loop       видео вернётся к исходной позе`);
  say(`  --res     480, 720 или 1080 для видео     --end        конечный кадр видео`);
  say('');
  say(dim(`Результаты складываются в ./generated/ рядом с JSON-описанием генерации.`));
  say(dim(`Ключ: ${CLI_NAME} setup или переменная окружения KIE_API_KEY. Ключ на https://kie.ai/api-key`));
  say('');
}

export async function main(argv) {
  const [name, ...rest] = argv;

  if (!name || ['help', '--help', '-h'].includes(name)) {
    help();
    return;
  }
  if (['--version', '-v', 'version'].includes(name)) {
    say(CLI_VERSION);
    return;
  }

  const command = COMMANDS[name];
  if (!command) {
    throw new UserError(
      `Не знаю команду «${name}».`,
      `Есть: ${Object.keys(COMMANDS).join(', ')}. Подсказка целиком: ${CLI_NAME} help`,
    );
  }

  await command.run(rest);
}
