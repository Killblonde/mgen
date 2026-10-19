// Быстрые проверки без обращения к kie.ai: node --test test/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { joinPrompt, normalizeQuality, normalizeResolution, parse } from '../src/args.js';
import { fileBaseName, slugFromPrompt, translit } from '../src/naming.js';
import { estimateImage, estimateVideo, toUsd } from '../src/price.js';
import { checkDuration, checkRatio, imageModels, videoModels } from '../src/models.js';
import { UserError } from '../src/errors.js';

test('флаги разбираются, повторяемые собираются в список', () => {
  const args = parse(['кот', '--ref', 'a.jpg', '--ref', 'b.jpg', '--n', '3', '--draft'], {
    ref: { type: 'string', multiple: true },
    n: { type: 'number' },
    draft: { type: 'boolean' },
  });
  assert.deepEqual(args._, ['кот']);
  assert.deepEqual(args.ref, ['a.jpg', 'b.jpg']);
  assert.equal(args.n, 3);
  assert.equal(args.draft, true);
});

test('неизвестный флаг — понятная ошибка', () => {
  assert.throws(() => parse(['--разрешение', '720p'], { resolution: { type: 'string' } }), UserError);
});

test('флаг без значения — понятная ошибка', () => {
  assert.throws(() => parse(['--size'], { size: { type: 'string' } }), UserError);
});

test('качество и разрешение приводятся к виду API', () => {
  assert.equal(normalizeQuality('4k'), '4K');
  assert.equal(normalizeResolution('720'), '720p');
  assert.equal(normalizeResolution('1080p'), '1080p');
  assert.throws(() => normalizeResolution('360p'), UserError);
});

test('промпт из нескольких слов склеивается', () => {
  assert.equal(joinPrompt(['кот', 'в', 'скафандре']), 'кот в скафандре');
});

test('имя файла: дата, слова промпта латиницей, номер варианта', () => {
  const date = new Date(2026, 9, 22, 15, 40);
  assert.equal(translit('Портрет у окна'), 'portret-u-okna');
  assert.equal(slugFromPrompt('Портрет у окна, мягкий свет'), 'portret-u-okna-myagkiy');
  assert.equal(
    fileBaseName({ prompt: 'Портрет у окна', index: 2, total: 3, date }),
    '2026-10-22_1540_portret-u-okna_3',
  );
  assert.equal(fileBaseName({ prompt: 'Портрет', index: 0, total: 1, date }), '2026-10-22_1540_portret');
});

test('цена картинок: за штуку, умножается на количество', () => {
  assert.equal(estimateImage('nano-banana-pro', { resolution: '2K', count: 1 }).credits, 18);
  assert.equal(estimateImage('nano-banana-2-1', { resolution: '1K', count: 3 }).credits, 12);
  assert.equal(toUsd(200), 1);
});

test('цена видео: за секунду, умножается на длительность', () => {
  assert.equal(estimateVideo('bytedance/seedance-2-5', { resolution: '480p', duration: 5 }).credits, 140);
  assert.equal(
    Math.round(estimateVideo('bytedance/seedance-2-mini', { resolution: '480p', duration: 4 }).credits * 10) / 10,
    15.2,
  );
});

test('неподдерживаемый формат кадра не уходит в API', () => {
  assert.throws(() => checkRatio(imageModels.sketch, '4:5'), UserError);
  assert.equal(checkRatio(imageModels.pro, '4:5'), '4:5');
});

test('длительность видео проверяется по возможностям модели', () => {
  assert.throws(() => checkDuration(videoModels.draft, 20), UserError);
  assert.equal(checkDuration(videoModels.video, 20), 20);
});

test('петля у Seedance собирается как последний кадр = первый', () => {
  const input = videoModels.video.build({
    prompt: 'ветер',
    imageUrl: 'https://example.com/a.jpg',
    duration: 5,
    resolution: '480p',
    loop: true,
    audio: false,
  });
  assert.equal(input.first_frame_url, input.last_frame_url);
  assert.equal(input.generate_audio, false);
  assert.equal(input.output_format, 'mp4');
});

test('без петли последний кадр не передаётся', () => {
  const input = videoModels.video.build({
    prompt: 'ветер',
    imageUrl: 'https://example.com/a.jpg',
    duration: 5,
    resolution: '480p',
  });
  assert.equal('last_frame_url' in input, false);
});
