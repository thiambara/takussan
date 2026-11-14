/**
 * TCK-2797 — les visites servies COMME L'API LES SERT, pour les doublures d'`apiRequest`.
 *
 * Depuis TCK-2797, `GET /api/property-visits` (et le détail) ne rend que `id`, les clés nommées dans
 * `fields[property_visits]` et les blocs que `include=` charge (`PropertyVisitResource::toArray`). Une
 * clé que l'écran lit sans la demander n'arrive donc plus : l'écran se vide en silence, et rien dans le
 * typage ne le dit (`PropertyVisit` a presque toutes ses clés optionnelles).
 *
 * `commeLApi(chemin, reponse)` filtre chaque visite de la réponse selon la requête, puis la rend sous un
 * `Proxy` qui NOTE toute lecture d'une clé de visite que la requête n'a pas demandée
 * (`lecturesHorsFields()`). Un test qui l'emploie épingle donc deux choses : l'écran rend ce qu'il
 * rendait avec les seules clés demandées, et il ne lit rien d'autre.
 *
 * Limite : une visite recopiée (`{ ...v }`) perd son `Proxy` ; ses lectures suivantes ne sont plus vues.
 */

/** Les clés de `PropertyVisitResource::toArray`, blocs de relation compris (garde : `visites-comme-l-api.test.ts`). */
export const CLES_D_UNE_VISITE = [
  'id',
  'property_id',
  'visitor_id',
  'customer_id',
  'agent_id',
  'visitor_name',
  'visitor_phone',
  'visitor_email',
  'type',
  'status',
  'scheduled_at',
  'preferred_window',
  'completed_at',
  'cancelled_at',
  'cancellation_reason',
  'duration_minutes',
  'feedback',
  'rating',
  'notes',
  'metadata',
  'property',
  'visitor_display',
  'visitor',
  'agent',
  'customer',
  'report',
  'created_at',
  'abilities',
] as const;

/** Les blocs de relation : ils suivent `include=`, pas `fields`. */
export const BLOCS_DE_RELATION = ['property', 'visitor', 'agent', 'customer'] as const;

const CONNUES = new Set<string>(CLES_D_UNE_VISITE);
const lectures = new Set<string>();

/** Les lectures notées depuis le dernier `oublierLesLectures()`, sous la forme `clé (route)`. */
export function lecturesHorsFields(): string[] {
  return [...lectures].sort();
}

export function oublierLesLectures(): void {
  lectures.clear();
}

/** Ce que la requête demande : `null` sans `fields[property_visits]` (la réponse entière). */
export function clesDemandees(chemin: string): Set<string> | null {
  const qs = chemin.split('?')[1] ?? '';
  const p = new URLSearchParams(qs);
  const brut = p.get('fields[property_visits]');
  if (brut === null || brut.trim() === '') return null;
  const inclus = (p.get('include') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return new Set(['id', ...brut.split(',').map((s) => s.trim()).filter(Boolean), ...inclus.filter((i) => (BLOCS_DE_RELATION as readonly string[]).includes(i))]);
}

function routeDesVisites(chemin: string): boolean {
  const route = chemin.split('?')[0];
  return route === '/api/property-visits' || /^\/api\/property-visits\/\d+$/.test(route);
}

function servir(visite: unknown, demandees: Set<string>, route: string): unknown {
  if (visite === null || typeof visite !== 'object' || Array.isArray(visite)) return visite;
  const filtree = Object.fromEntries(Object.entries(visite as Record<string, unknown>).filter(([cle]) => demandees.has(cle)));
  const noter = (cle: string | symbol) => {
    if (typeof cle === 'string' && CONNUES.has(cle) && !demandees.has(cle)) lectures.add(`${cle} (${route})`);
  };
  return new Proxy(filtree, {
    get(cible, cle, recepteur) {
      noter(cle);
      return Reflect.get(cible, cle, recepteur);
    },
    has(cible, cle) {
      noter(cle);
      return Reflect.has(cible, cle);
    },
    getOwnPropertyDescriptor(cible, cle) {
      noter(cle);
      return Reflect.getOwnPropertyDescriptor(cible, cle);
    },
  });
}

/**
 * La réponse d'une lecture de visites, filtrée et surveillée comme ci-dessus ; toute autre réponse
 * passe telle quelle. `data` est une liste (index) ou une visite (détail).
 */
export function commeLApi<T>(chemin: string, reponse: T): T {
  if (!routeDesVisites(chemin)) return reponse;
  const demandees = clesDemandees(chemin);
  if (demandees === null || reponse === null || typeof reponse !== 'object') return reponse;
  const route = chemin.split('?')[0];
  const corps = reponse as { data?: unknown };
  const data = Array.isArray(corps.data) ? corps.data.map((v) => servir(v, demandees, route)) : servir(corps.data, demandees, route);
  return { ...corps, data } as T;
}
