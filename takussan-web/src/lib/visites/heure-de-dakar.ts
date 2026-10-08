/**
 * TCK-590 — l'heure d'une visite se construit à DAKAR, jamais dans le fuseau du navigateur.
 *
 * La boîte de visite faisait `new Date(date).setHours(10, 0)` puis `toISOString()` : 10:00 *du
 * navigateur*. Un visiteur de la diaspora à Paris qui choisissait 10:00 envoyait 09:00 Z l'hiver
 * et 08:00 Z l'été — l'agent, à Dakar, l'attendait une à deux heures trop tôt. Le serveur refuse
 * désormais toute heure hors de la grille de Dakar : l'écart n'aurait plus été silencieux, il
 * aurait été un 422.
 *
 * Dakar n'a pas d'heure d'été et vit à UTC+0, mais le calcul ne le suppose pas : le décalage est
 * lu par `Intl` à l'instant visé.
 */
export const FUSEAU_DES_VISITES = 'Africa/Dakar';

/**
 * Le JOUR que le visiteur a cliqué dans le calendrier, `AAAA-MM-JJ`. Le calendrier rend minuit
 * LOCAL du jour cliqué : ce sont donc les composantes locales qui le désignent, pas l'UTC.
 */
export function jourChoisi(date: Date): string {
  const mois = String(date.getMonth() + 1).padStart(2, '0');
  const jour = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mois}-${jour}`;
}

/** Le décalage (ms) du fuseau à l'instant `utcMs` : heure murale lue comme UTC, moins l'instant. */
function decalage(utcMs: number, fuseau: string): number {
  const parties = new Intl.DateTimeFormat('en-US', {
    timeZone: fuseau,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const v = (type: string) => Number(parties.find((p) => p.type === type)?.value ?? 0);
  return Date.UTC(v('year'), v('month') - 1, v('day'), v('hour'), v('minute'), v('second')) - utcMs;
}

/**
 * L'instant UTC (`AAAA-MM-JJTHH:MM:SSZ`) de l'heure murale `heure` (`HH:MM`) le `jour`
 * (`AAAA-MM-JJ`) à Dakar.
 */
export function instantADakar(jour: string, heure: string, fuseau = FUSEAU_DES_VISITES): string {
  const [a, m, j] = jour.split('-').map((x) => Number.parseInt(x, 10));
  const [h, min] = heure.split(':').map((x) => Number.parseInt(x, 10));
  const murale = Date.UTC(a, m - 1, j, h, min, 0);
  const instant = murale - decalage(murale, fuseau);
  return new Date(instant).toISOString().replace(/\.\d{3}Z$/, 'Z');
}
