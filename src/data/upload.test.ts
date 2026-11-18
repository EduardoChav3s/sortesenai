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
