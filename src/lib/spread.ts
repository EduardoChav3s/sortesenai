/**
 * A short wait between 150 ms and 750 ms, different for each player. A live change reaches every open
 * screen at the same moment; waiting a little, each a different time, spreads their refreshes out.
 */
export function spreadMs(random: () => number = Math.random) {
  return 150 + Math.floor(random() * 600);
}
