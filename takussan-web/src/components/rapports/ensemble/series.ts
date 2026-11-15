import type { TimeseriesPayload } from '@/lib/queries/dashboard';

/**
 * Une série nommée de `timeseries` (`GET /api/dashboard/{agent,owner}?include=timeseries`), lue comme des
 * nombres : `null` quand l'API ne la rend pas, ou qu'elle n'a pas un point par mois — le graphique ne se
 * rend pas plutôt que de décaler les mois.
 */
export function serieDe(ts: TimeseriesPayload | undefined, nom: string): (number | null)[] | null {
  const brute = ts?.[nom];
  if (!ts || !Array.isArray(brute) || brute.length !== ts.months.length) return null;
  return brute.map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : null));
}
