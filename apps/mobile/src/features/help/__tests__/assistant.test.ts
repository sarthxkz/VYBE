import { answer, FAQ, supportMailto, SUPPORT_EMAIL } from '../assistant';

test('answers common questions', () => {
  expect(answer('my messages are not sending')?.id).toBe('not-sending');
  expect(answer('How do I turn on ghost mode?')?.id).toBe('ghost');
  expect(answer('didnt get verification code')?.id).toBe('code');
  expect(answer('how to restore chat backup on new phone')?.id).toBe('backup');
  expect(answer('voice message not recording')?.id).toBe('voice');
  expect(answer('change chat background')?.id).toBe('theme');
  expect(answer('someone keeps harassing me')?.id).toBe('block');
  expect(answer('what is a blink')?.id).toBe('blink');
});

test('says it does not know instead of guessing', () => {
  expect(answer('')).toBeNull();
  expect(answer('banana pancakes')).toBeNull();
});

test('every FAQ is reachable from its own question', () => {
  for (const f of FAQ) expect(answer(f.q)?.id).toBe(f.id);
});

test('support email carries the transcript', () => {
  const url = supportMailto([{ fromMe: true, text: 'help' }], '0.1.4');
  expect(url.startsWith(`mailto:${SUPPORT_EMAIL}?`)).toBe(true);
  expect(decodeURIComponent(url)).toContain('Me: help');
  expect(decodeURIComponent(url)).toContain('App version: 0.1.4');
});
