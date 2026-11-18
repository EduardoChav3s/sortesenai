import { checkImage, imagePath } from './upload';

const file = (type: string, size: number, name = 'foto.png') => new File([new Uint8Array(size)], name, { type });

test('accepts jpg, png and webp up to 2 MB', () => {
  expect(checkImage(file('image/png', 1000))).toBeNull();
  expect(checkImage(file('image/webp', 2 * 1024 * 1024))).toBeNull();
});

test('rejects other types and files over 2 MB', () => {
  expect(checkImage(file('image/gif', 10))).toBe('Use JPG, PNG ou WebP.');
  expect(checkImage(file('image/png', 2 * 1024 * 1024 + 1))).toBe('A imagem passa de 2 MB.');
});

test('imagePath puts the file in the folder with a random name and the right extension', () => {
  const p = imagePath(file('image/webp', 10, 'x.WEBP'), 'u1');
  expect(p).toMatch(/^u1\/[0-9a-f-]{36}\.webp$/);
  expect(imagePath(file('image/jpeg', 10, 'a.jpeg'))).toMatch(/^[0-9a-f-]{36}\.jpg$/);
});

import { checkAudio, audioPath } from './upload';

test('accepts common audio files up to 15 MB', () => {
  expect(checkAudio(file('audio/mpeg', 1000, 'a.mp3'))).toBeNull();
  expect(checkAudio(file('audio/ogg', 15 * 1024 * 1024, 'a.ogg'))).toBeNull();
});

test('rejects non-audio and audio over 15 MB', () => {
  expect(checkAudio(file('image/png', 10))).toBe('Use um arquivo de música (MP3, OGG, WAV, M4A).');
  expect(checkAudio(file('audio/mpeg', 15 * 1024 * 1024 + 1, 'a.mp3'))).toBe('A música passa de 15 MB.');
});

test('audioPath files the song under its slot with a random name', () => {
  expect(audioPath(file('audio/mpeg', 10, 'Tema.MP3'), 'login')).toMatch(/^login\/[0-9a-f-]{36}\.mp3$/);
});
