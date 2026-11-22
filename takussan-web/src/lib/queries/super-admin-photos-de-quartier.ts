import { ApiError } from '@/lib/api';
import { cheminApi, requete } from '@/lib/chemin-api';
import type { MetaDePage } from '@/lib/queries/super-admin-propositions';

/**
 * TCK-2844 (ADR-0109) — la photo d'un quartier, posée par le super-admin depuis `/super-admin/geo`.
 *
 * Tout passe par le relais same-origin `app/api/super-admin/[...path]` (→ `/api/admin/…`), comme la
 * file des propositions (`super-admin-propositions.ts`) : le jeton reste dans le cookie httpOnly. Un
 * envoi multipart y part en octets, sous le délai des fichiers (`relayerVersApi`).
 *
 * ⚠ Ni `fields[]` ni `include=` : `GeoNeighborhoodAdminController` rend une forme FIXE (`format()`).
 */

/** Les types acceptés par l'API (`GeoCoverUploadRequest` : `mimes:jpeg,png,webp`). */
export const TYPES_DE_PHOTO = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** 10 Mo, la borne de l'API (`max:10240`, en kilo-octets). */
export const PHOTO_MAX_OCTETS = 10 * 1024 * 1024;

export type SourceDePhoto = 'upload' | 'wikimedia';

export interface PhotoDeQuartier {
  /** L'URL de la conversion `display` (ADR-0109 §1). */
  readonly url: string;
  readonly source: SourceDePhoto | string;
}

export interface QuartierApprouve {
  readonly id: number;
  readonly nom: string;
  readonly ville: string;
  /** Les adresses qui le nomment : le tri par défaut de la vue (les plus fournis d'abord). */
  readonly adresses: number;
  readonly photo: PhotoDeQuartier | null;
}

export interface PageDeQuartiers {
  readonly data: QuartierApprouve[];
  readonly meta: MetaDePage;
}

/** Une proposition de Wikimedia Commons, déjà filtrée par l'API (aucune attribution exigée). */
export interface PropositionWikimedia {
  readonly title: string;
  readonly thumb_url: string;
  readonly width: number;
  readonly height: number;
  readonly author: string | null;
  readonly license: string | null;
  readonly page_url: string;
}

export interface PropositionsWikimedia {
  readonly data: PropositionWikimedia[];
  /** Commons en panne ou trop lent : liste vide, statut 200. */
  readonly indisponible: boolean;
}

export interface FiltresDeQuartiers {
  readonly villeId: number | null;
  readonly recherche: string;
  readonly page: number;
}

/** Les clés de cache de la vue — fabrique (CLAUDE.md du front : pas de clé composée en ligne). */
export const photosDeQuartierKeys = {
  all: ['super-admin', 'geo', 'photos'] as const,
  liste: (f: FiltresDeQuartiers) => [...photosDeQuartierKeys.all, 'liste', f.villeId, f.recherche, f.page] as const,
  propositions: (id: number) => [...photosDeQuartierKeys.all, 'propositions', id] as const,
};

interface QuartierAdmin {
  readonly id: number;
  readonly name: string;
  readonly city: { readonly id: number; readonly name: string };
  readonly addresses_count: number;
  /** TCK-2844 — absent d'une réponse antérieure au champ. */
  readonly cover?: { readonly url?: unknown; readonly source?: unknown } | null;
}

async function corpsOuErreur<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status, data);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

function photoDe(cover: QuartierAdmin['cover']): PhotoDeQuartier | null {
  if (!cover || typeof cover.url !== 'string' || cover.url.trim() === '') return null;
  return { url: cover.url, source: typeof cover.source === 'string' ? cover.source : 'upload' };
}

function depuisLigne(q: QuartierAdmin): QuartierApprouve {
  return { id: q.id, nom: q.name, ville: q.city.name, adresses: q.addresses_count, photo: photoDe(q.cover) };
}

/** Les quartiers APPROUVÉS d'une ville (ou de toutes), les plus fournis en adresses d'abord. */
export async function listerQuartiersApprouves(f: FiltresDeQuartiers): Promise<PageDeQuartiers> {
  const qs = new URLSearchParams();
  qs.set('filter[status]', 'approved');
  if (f.villeId !== null) qs.set('filter[geo_city_id]', String(f.villeId));
  const recherche = f.recherche.trim();
  if (recherche !== '') qs.set('filter[search]', recherche);
  qs.set('sort', '-addresses_count');
  qs.set('page', String(f.page));
  qs.set('per_page', '24');
  const res = await fetch(cheminApi`/api/super-admin/geo/neighborhoods${requete(qs)}`, { credentials: 'include' });
  const corps = await corpsOuErreur<{ data: QuartierAdmin[]; meta: MetaDePage }>(res);
  return { data: corps.data.map(depuisLigne), meta: corps.meta };
}

export async function lirePropositionsWikimedia(id: number): Promise<PropositionsWikimedia> {
  const res = await fetch(cheminApi`/api/super-admin/geo/neighborhoods/${id}/cover/suggestions`, { credentials: 'include' });
  const corps = await corpsOuErreur<{ data?: PropositionWikimedia[]; meta?: { unavailable?: boolean } }>(res);
  return { data: corps.data ?? [], indisponible: corps.meta?.unavailable === true };
}

/** Le contrôle côté client, avant tout envoi : le type, puis la taille. `null` si le fichier passe. */
export function refusDuFichier(fichier: File): 'type' | 'size' | null {
  if (!(TYPES_DE_PHOTO as readonly string[]).includes(fichier.type)) return 'type';
  if (fichier.size > PHOTO_MAX_OCTETS) return 'size';
  return null;
}

/** Envoi d'un fichier (multipart `file`) — la ligne relue, `cover` comprise. */
export async function envoyerPhoto(id: number, fichier: File): Promise<QuartierApprouve> {
  const donnees = new FormData();
  donnees.append('file', fichier);
  // Aucun `Content-Type` : le navigateur pose la frontière du multipart.
  const res = await fetch(cheminApi`/api/super-admin/geo/neighborhoods/${id}/cover`, {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json' },
    body: donnees,
  });
  const corps = await corpsOuErreur<{ data: QuartierAdmin }>(res);
  return depuisLigne(corps.data);
}

/** Import d'une proposition PAR SON TITRE, jamais par URL : le serveur relit le fichier sur Commons. */
export async function importerDeWikimedia(id: number, titre: string): Promise<QuartierApprouve> {
  const res = await fetch(cheminApi`/api/super-admin/geo/neighborhoods/${id}/cover/import`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ source: 'wikimedia', title: titre }),
  });
  const corps = await corpsOuErreur<{ data: QuartierAdmin }>(res);
  return depuisLigne(corps.data);
}

export async function retirerPhoto(id: number): Promise<void> {
  const res = await fetch(cheminApi`/api/super-admin/geo/neighborhoods/${id}/cover`, {
    method: 'DELETE',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  await corpsOuErreur<unknown>(res);
}

/**
 * La recherche Unsplash du quartier et de sa ville, en nouvel onglet (ADR-0109 §2 : aucune
 * intégration de l'API). Le slug est translittéré : « Sacré-Cœur Dakar » → `sacre-coeur-dakar`
 * (NFD ne décompose ni `œ` ni `æ`).
 */
export function lienUnsplash(quartier: string, ville: string): string {
  const slug = `${quartier} ${ville}`
    .replace(/œ/g, 'oe')
    .replace(/Œ/g, 'Oe')
    .replace(/æ/g, 'ae')
    .replace(/Æ/g, 'Ae')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `https://unsplash.com/s/photos/${slug}`;
}
