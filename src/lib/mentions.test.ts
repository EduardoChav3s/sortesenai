import { fitWithin, insertMention, mentionAt, splitMentions } from './mentions';

test('a message is split into text and @mentions of known players (any letter case)', () => {
  expect(splitMentions('oi @Duda, olha @ninguem!', ['duda', 'bia'])).toEqual([
    { text: 'oi ' },
    { text: '@Duda', mention: 'duda' },
    { text: ', olha @ninguem!' },
  ]);
  expect(splitMentions('sem nada', ['duda'])).toEqual([{ text: 'sem nada' }]);
});

test('typing @ right before the cursor opens the name list', () => {
  expect(mentionAt('oi @du', 6)).toEqual({ start: 3, query: 'du' });
  expect(mentionAt('oi @', 4)).toEqual({ start: 3, query: '' });
  expect(mentionAt('email@site', 10)).toBeNull(); // @ glued to a word is not a mention
  expect(mentionAt('oi @du ', 7)).toBeNull(); // a space ends it
});

test('picking a name fills it in and puts the cursor after it', () => {
  expect(insertMention('oi @du tudo bem', 3, 6, 'duda')).toEqual({ text: 'oi @duda  tudo bem', caret: 9 });
});

test('a big print shrinks to fit 1600 px, keeping its shape; a small one stays', () => {
  expect(fitWithin(3200, 1800, 1600)).toEqual({ width: 1600, height: 900 });
  expect(fitWithin(1080, 2400, 1600)).toEqual({ width: 720, height: 1600 });
  expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
});
