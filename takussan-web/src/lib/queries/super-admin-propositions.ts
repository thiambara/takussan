import { ApiError } from '@/lib/api';
import { cheminApi, requete } from '@/lib/chemin-api';

/**
 * TCK-633 (AC5, ADR-0062 §7, ADR-0062) — les deux files de propositions de la console : les
 * quartiers saisis hors du référentiel, les équipements saisis hors du catalogue.
 *
 * Les deux passent par le relais same-origin `app/api/super-admin/[...path]` (→ `/api/admin/…`).
 * ⚠ Ni `fields[]` ni `include=` : les deux contrôleurs (`GeoNeighborhoodAdminController`,
 * `TagModerationAdminController`) rendent une forme FIXE, déjà réduite à ce que la file affiche.
 */
export type GenreDePropositions = 'geo' | 'tags';

/** Une ligne de file, commune aux deux genres. */
export interface Proposition {
  readonly id: number;
  readonly name: string;
  /** Le nom de l'auteur, ou `null` (compte supprimé, proposition sans auteur). */
  readonly auteur: string | null;
  /** Les annonces qui l'emploient : adresses d'un quartier, biens d'un équipement. */
  readonly usage: number;
  /** « Ville · Région » pour un quartier ; `null` pour un équipement. */
  readonly lieu: string | null;
  /** La ville d'un quartier : on ne fusionne que dans la même (`geo.merge_other_city`). */
  readonly villeId: number | null;
}

export interface MetaDePage {
  readonly total: number;
  readonly per_page: number;
  readonly current_page: number;
  readonly last_page: number;
}

export interface PageDePropositions {
  readonly data: Proposition[];
  readonly meta: MetaDePage;
}

/** Une cible de fusion, prête pour la liste à recherche (`OptionDeListe`). */
export interface CibleDeFusion {
  readonly value: string;
  readonly label: string;
}

export type GesteDeModeration =
  | { readonly type: 'approve' }
  | { readonly type: 'reject' }
  | { readonly type: 'rename'; readonly name: string }
  | { readonly type: 'merge'; readonly intoId: number };

interface Auteur {
  readonly id: number;
  readonly name: string;
}

interface QuartierAdmin {
  readonly id: number;
  readonly name: string;
  readonly status: string;
  readonly city: { readonly id: number; readonly name: string };
  readonly region: { readonly id: number; readonly name: string };
  readonly created_by: Auteur | null;
  readonly addresses_count: number;
}

interface EquipementAdmin {
  readonly id: number;
  readonly name: string;
  readonly status: string;
  readonly created_by: Auteur | null;
  readonly properties_count: number;
}

interface Enveloppe<T> {
  readonly data: T[];
  readonly meta: MetaDePage;
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status, data);
  }
  return res.json() as Promise<T>;
}

/** Un auteur sans nom (prénom et nom vides) n'est pas un auteur affichable. */
function nomDAuteur(auteur: Auteur | null): string | null {
  const nom = auteur?.name.trim() ?? '';
  return nom === '' ? null : nom;
}

function depuisQuartier(q: QuartierAdmin): Proposition {
  return {
    id: q.id,
    name: q.name,
    auteur: nomDAuteur(q.created_by),
    usage: q.addresses_count,
    lieu: `${q.city.name} · ${q.region.name}`,
    villeId: q.city.id,
  };
}

function depuisEquipement(e: EquipementAdmin): Proposition {
  return { id: e.id, name: e.name, auteur: nomDAuteur(e.created_by), usage: e.properties_count, lieu: null, villeId: null };
}

async function lireQuartiers(qs: URLSearchParams): Promise<Enveloppe<QuartierAdmin>> {
  const res = await fetch(cheminApi`/api/super-admin/geo/neighborhoods${requete(qs)}`, { credentials: 'include' });
  return jsonOrThrow<Enveloppe<QuartierAdmin>>(res);
}

async function lireEquipements(qs: URLSearchParams): Promise<Enveloppe<EquipementAdmin>> {
  const res = await fetch(cheminApi`/api/super-admin/tags/proposals${requete(qs)}`, { credentials: 'include' });
  return jsonOrThrow<Enveloppe<EquipementAdmin>>(res);
}

/** La file : les propositions EN ATTENTE, les plus récentes d'abord (tri par défaut de l'API). */
export async function listerPropositions(genre: GenreDePropositions, page: number): Promise<PageDePropositions> {
  const qs = new URLSearchParams();
  qs.set('filter[status]', 'pending');
  qs.set('page', String(page));
  qs.set('per_page', '20');
  if (genre === 'geo') {
    const corps = await lireQuartiers(qs);
    return { data: corps.data.map(depuisQuartier), meta: corps.meta };
  }
  const corps = await lireEquipements(qs);
  return { data: corps.data.map(depuisEquipement), meta: corps.meta };
}

/** Au-delà, la liste des cibles s'arrête : 1 000 entrées approuvées dans une même ville. */
const PAGES_DE_CIBLES_MAX = 10;

/**
 * Les cibles d'une fusion : les entrées APPROUVÉES — de la même ville pour un quartier. Toutes
 * les pages : Dakar compte 151 quartiers au jeu de la tâche 2, et l'API plafonne une page à 100
 * (`HasQueryBuilder::PER_PAGE_MAX`). Une liste tronquée rendrait « Liberté 6 » introuvable.
 * La proposition elle-même n'y figure jamais : elle est `pending`.
 */
export async function ciblesDeFusion(genre: GenreDePropositions, villeId: number | null): Promise<CibleDeFusion[]> {
  if (genre === 'geo' && villeId === null) return [];
  const qs = new URLSearchParams();
  qs.set('filter[status]', 'approved');
  if (genre === 'geo') qs.set('filter[geo_city_id]', String(villeId));
  qs.set('sort', 'name');
  qs.set('per_page', '100');

  const cibles: CibleDeFusion[] = [];
  for (let page = 1; page <= PAGES_DE_CIBLES_MAX; page++) {
    qs.set('page', String(page));
    const corps = genre === 'geo' ? await lireQuartiers(qs) : await lireEquipements(qs);
    for (const ligne of corps.data) cibles.push({ value: String(ligne.id), label: ligne.name });
    if (page >= corps.meta.last_page) break;
  }
  return cibles;
}

function cheminDeLaProposition(genre: GenreDePropositions, id: number): string {
  return genre === 'geo' ? cheminApi`/api/super-admin/geo/neighborhoods/${id}` : cheminApi`/api/super-admin/tags/${id}`;
}

/** Approuver, refuser, renommer, fusionner — un geste, une requête. */
export async function agirSurProposition(genre: GenreDePropositions, id: number, geste: GesteDeModeration): Promise<void> {
  const chemin = cheminDeLaProposition(genre, id);
  const json = { 'Content-Type': 'application/json', Accept: 'application/json' };
  let res: Response;
  switch (geste.type) {
    case 'approve':
    case 'reject':
      res = await fetch(`${chemin}/${geste.type}`, { method: 'POST', credentials: 'include', headers: json });
      break;
    case 'rename':
      res = await fetch(chemin, { method: 'PATCH', credentials: 'include', headers: json, body: JSON.stringify({ name: geste.name }) });
      break;
    case 'merge':
      res = await fetch(`${chemin}/merge`, { method: 'POST', credentials: 'include', headers: json, body: JSON.stringify({ into_id: geste.intoId }) });
      break;
  }
  await jsonOrThrow<unknown>(res);
}
