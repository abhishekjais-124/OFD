/** Chooses a small, mixed set of stories from several lists (for example World and India). */

export interface Pickable {
  /** Milliseconds since epoch; null or NaN when the story has no usable time. */
  time: number | null;
}

const t = (x: Pickable) => (x.time !== null && Number.isFinite(x.time) ? x.time : -Infinity);

/**
 * Takes turns between the groups, newest story of each group first, starting with the group whose
 * newest story is most recent, until `max` stories are chosen. The result is ordered newest first.
 * Every group gets a turn before any group gets a second, so the list stays mixed.
 */
export function mixStories<T extends Pickable>(groups: T[][], max = 5): { story: T; group: number }[] {
  const queues = groups.map((g, group) => ({ group, items: [...g].sort((a, b) => t(b) - t(a)) }));
  const order = [...queues].sort((a, b) => (b.items[0] ? t(b.items[0]) : -Infinity) - (a.items[0] ? t(a.items[0]) : -Infinity));
  const picked: { story: T; group: number }[] = [];
  for (let round = 0; picked.length < max; round++) {
    let tookAny = false;
    for (const q of order) {
      const story = q.items[round];
      if (!story) continue;
      picked.push({ story, group: q.group });
      tookAny = true;
      if (picked.length >= max) break;
    }
    if (!tookAny) break;
  }
  return picked.sort((a, b) => t(b.story) - t(a.story));
}
