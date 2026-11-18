const DAY_MS = 24 * 60 * 60 * 1000;

/** Jour calendaire à Libreville (UTC+1), sous forme de date à minuit UTC : le jour d'une visite pour le compteur. */
export function librevilleDay(at: Date) {
  const [year, month, day] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Libreville' })
    .format(at)
    .split('-')
    .map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!));
}

/** Les n derniers jours jusqu'à aujourd'hui inclus, du plus ancien au plus récent. */
export function lastDays(n: number, now: Date) {
  const today = librevilleDay(now);
  return Array.from({ length: n }, (_, i) => new Date(today.getTime() - (n - 1 - i) * DAY_MS));
}

/** Série complète sur la période : un jour sans visite compte zéro. */
export function fillDays(days: Date[], counts: Array<{ day: Date; count: number }>) {
  const byDay = new Map(counts.map((c) => [c.day.getTime(), c.count] as const));
  return days.map((day) => ({ day: day.toISOString().slice(0, 10), views: byDay.get(day.getTime()) ?? 0 }));
}
