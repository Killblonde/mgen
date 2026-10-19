// Проверки доработок: конечный кадр, --res, параметры нарезки, разбор длительности.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeResolution, parse } from '../src/args.js';
import { videoModels, priceTable } from '../src/models.js';
import { frameOptions } from '../src/commands/frames.js';
import { videoFlags } from '../src/commands/video.js';
import { parseDuration, localFfmpeg } from '../src/ffmpeg.js';
import { estimateVideo } from '../src/price.js';
import { UserError } from '../src/errors.js';

test('--res понимает 480, 720p и 1080', () => {
  assert.equal(normalizeResolution('480'), '480p');
  assert.equal(normalizeResolution('720p'), '720p');
  assert.equal(normalizeResolution('1080'), '1080p');
  assert.throws(() => normalizeResolution('2160'), UserError);
});

test('флаги --res и --end разбираются', () => {
  const args = parse(['video.jpg', 'движение', '--res', '720', '--end', 'finish.jpg'], videoFlags);
  assert.deepEqual(args._, ['video.jpg', 'движение']);
  assert.equal(args.res, '720');
  assert.equal(args.end, 'finish.jpg');
});

test('конечный кадр уходит в last_frame_url', () => {
  const input = videoModels.video.build({
    prompt: 'камера отъезжает',
    imageUrl: 'https://example.com/start.jpg',
    endUrl: 'https://example.com/finish.jpg',
    duration: 5,
    resolution: '720p',
  });
  assert.equal(input.first_frame_url, 'https://example.com/start.jpg');
  assert.equal(input.last_frame_url, 'https://example.com/finish.jpg');
});

test('петля и конечный кадр не смешиваются: явный кадр важнее', () => {
  const input = videoModels.video.build({
    prompt: 'движение',
    imageUrl: 'https://example.com/start.jpg',
    endUrl: 'https://example.com/finish.jpg',
    loop: true,
    duration: 5,
    resolution: '480p',
  });
  assert.equal(input.last_frame_url, 'https://example.com/finish.jpg');
});

test('цена видео пересчитывается по разрешению', () => {
  const id = videoModels.video.id;
  assert.equal(estimateVideo(id, { resolution: '480p', duration: 5 }).credits, 140);
  assert.equal(estimateVideo(id, { resolution: '720p', duration: 5 }).credits, 315);
  assert.equal(estimateVideo(id, { resolution: '1080p', duration: 5 }).credits, 790);
});

test('параметры нарезки: значения по умолчанию и границы', () => {
  assert.deepEqual(frameOptions({}), { count: 150, width: 1600, quality: 5 });
  assert.equal(frameOptions({ width: 1280, quality: 7 }).width, 1280);
  assert.throws(() => frameOptions({ count: 5 }), UserError);
  assert.throws(() => frameOptions({ count: 900 }), UserError);
  assert.throws(() => frameOptions({ width: 100 }), UserError);
});

test('длительность видео читается из вывода ffmpeg', () => {
  assert.equal(parseDuration('  Duration: 00:00:04.04, start: 0.000000, bitrate: 3505 kb/s'), 4.04);
  assert.equal(parseDuration('  Duration: 01:02:03.00'), 3723);
  assert.equal(parseDuration('ничего похожего'), null);
});

test('ffmpeg ставится в домашнюю папку рядом с mgen, а не в систему', () => {
  assert.match(localFfmpeg, /[\\/]\.mgen[\\/]bin[\\/]ffmpeg(\.exe)?$/);
});

test('в таблице цен нет моделей, которых нет в документации kie.ai', () => {
  const ids = Object.keys(priceTable.models);
  assert.equal(ids.includes('nano-banana-2-5'), false);
  assert.equal(ids.includes('nano-banana-pro'), true);
  assert.equal(ids.includes('nano-banana-2-1'), true);
  assert.equal(ids.includes('bytedance/seedance-2-5'), true);
});
