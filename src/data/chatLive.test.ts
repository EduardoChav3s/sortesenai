import { touchesMe } from './chatLive';

describe('touchesMe (who refreshes coins and cards after a chat change)', () => {
  const me = 'eu';
  it('my message, coins sent to me, my offer bought, my bid', () => {
    expect(touchesMe({ new: { user_id: 'eu' } }, me)).toBe(true);
    expect(touchesMe({ new: { user_id: 'ana', to_user: 'eu' } }, me)).toBe(true);
    expect(touchesMe({ new: { user_id: 'ana', buyer: 'eu' }, old: { id: 1 } }, me)).toBe(true);
    expect(touchesMe({ new: { user_id: 'eu', message_id: 3 } }, me)).toBe(true);
  });
  it('a deal between other players does not touch me', () => {
    expect(touchesMe({ new: { user_id: 'ana', to_user: 'bia', buyer: null } }, me)).toBe(false);
    expect(touchesMe({ new: { user_id: 'ana' }, old: { id: 9 } }, me)).toBe(false);
  });
  it('refreshes to be safe when it cannot tell', () => {
    expect(touchesMe({ new: { user_id: 'ana' } }, null)).toBe(true);
    expect(touchesMe({ new: {}, old: {} }, me)).toBe(true);
    expect(touchesMe({}, me)).toBe(true);
  });
});
