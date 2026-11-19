import { spreadMs } from './spread';

describe('spreadMs', () => {
  it('waits between 150 and 750 ms', () => {
    expect(spreadMs(() => 0)).toBe(150);
    expect(spreadMs(() => 0.999999)).toBe(749);
    for (let i = 0; i < 100; i++) {
      const ms = spreadMs();
      expect(ms).toBeGreaterThanOrEqual(150);
      expect(ms).toBeLessThan(750);
    }
  });
});
