'use client';

import { useSyncExternalStore } from 'react';

/**
 * Reactive favorites store backed by localStorage.
 *
 * Anonymous users get a persistent client-side wishlist via this store;
 * authenticated users hit `/api/favorites` directly (see `useFavorite`,
 * `FavoritesPopover`). On login the local IDs are POSTed to the API and
 * cleared (see AuthContext).
 *
 * Storage contract:
 *   Key:    `takussan.favorites`
 *   Value:  number[]  — JSON array of property IDs
 *   TTL:    none (persistent)
 *   Key:    `takussan.favorites.prix` (TCK-2508) — { [id]: prix public vu à l'ajout }
 *   Key:    `takussan.favorites.facettes` (TCK-2508) — [[id, { city, quarter, type, contract_type }], …], du plus ancien au plus récent
 *
 * Cross-tab sync: native `storage` event.
 * Same-tab sync: custom `takussan.favorites:change` event.
 */

export const FAVORITES_STORAGE_KEY = 'takussan.favorites';
/**
 * TCK-2508 — le prix PUBLIC vu à l'ajout, par identifiant : `{ "857": 450000 }`.
 *
 * Une clé à part, et non des objets dans `takussan.favorites` : la liste d'identifiants reste lue
 * telle quelle par tout ce qui la lit déjà (cœurs, popover, versement au compte à la connexion).
 * L'anonyme n'a pas de `price_at_favorite` côté API (TCK-2507) : c'est ici que vit sa référence,
 * pour afficher « −50 000 F depuis l'ajout ». Un prix n'est retenu que pour un identifiant présent
 * dans la liste, jamais rebasé tant qu'il y reste, et oublié avec lui.
 */
export const FAVORITES_PRICES_STORAGE_KEY = 'takussan.favorites.prix';
/**
 * TCK-2508 — ce que le visiteur a VU d'un favori quand il était public : sa ville, son quartier, son
 * type et sa transaction. C'est ce qui donne à « Biens proches », sur la carte éteinte d'un bien
 * loué ou retiré, des filtres réels : l'API ne décrit plus un bien sorti du public (TCK-599 :
 * `{id, slug, title}` seulement), et ne doit pas le faire. Rien n'est appris ici que l'écran n'ait
 * déjà montré. Indépendante de la liste : le connecté n'a pas de liste locale. Une LISTE de paires
 * `[id, facettes]` et non un objet : un objet JSON range ses clés numériques par ordre croissant, et
 * l'ordre d'âge qui choisit qui oublier serait perdu à la première écriture. Bornée à
 * {@link FACETTES_MAX} entrées, les plus anciennes partent d'abord ; effacée avec le reste à la
 * déconnexion (`clear`).
 */
export const FAVORITES_FACETS_STORAGE_KEY = 'takussan.favorites.facettes';
export const FACETTES_MAX = 200;
const CHANGE_EVENT = 'takussan.favorites:change';

function parse(raw: string | null): number[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0,
    );
  } catch {
    return [];
  }
}

function read(): number[] {
  if (typeof window === 'undefined') return [];
  return parse(window.localStorage.getItem(FAVORITES_STORAGE_KEY));
}

export type PrixALAjout = Readonly<Record<number, number>>;

function estPrix(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

function parsePrix(raw: string | null): Record<number, number> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const sortie: Record<number, number> = {};
    for (const [cle, valeur] of Object.entries(parsed as Record<string, unknown>)) {
      const id = Number(cle);
      if (Number.isSafeInteger(id) && id > 0 && estPrix(valeur)) sortie[id] = valeur;
    }
    return sortie;
  } catch {
    return {};
  }
}

function readPrix(): Record<number, number> {
  if (typeof window === 'undefined') return {};
  return parsePrix(window.localStorage.getItem(FAVORITES_PRICES_STORAGE_KEY));
}

/**
 * Écrit la liste ET les prix, ceux-ci réduits aux identifiants de la liste : un prix ne survit
 * jamais à son favori (sinon un bien retiré puis remis en favori garderait son ancien prix).
 */
function write(ids: number[], prix: Record<number, number> = readPrix()): void {
  if (typeof window === 'undefined') return;
  const deduped = Array.from(new Set(ids));
  const gardes: Record<number, number> = {};
  for (const id of deduped) if (estPrix(prix[id])) gardes[id] = prix[id];
  try {
    window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(deduped));
    if (Object.keys(gardes).length > 0) {
      window.localStorage.setItem(FAVORITES_PRICES_STORAGE_KEY, JSON.stringify(gardes));
    } else {
      window.localStorage.removeItem(FAVORITES_PRICES_STORAGE_KEY);
    }
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    // quota / private mode — silently ignore
  }
}

export function getIds(): number[] {
  return read();
}

export function has(id: number): boolean {
  return read().includes(id);
}

/**
 * Ajoute un favori. `prix` : le prix public affiché au moment du geste, s'il est connu — sinon
 * l'appelant le retient après coup par {@link retenirPrixALAjout}.
 */
export function add(id: number, prix?: number | null): void {
  const current = read();
  if (current.includes(id)) return;
  const tous = readPrix();
  delete tous[id];
  if (estPrix(prix)) tous[id] = prix;
  write([...current, id], tous);
}

/**
 * TCK-2508 — retient le prix à l'ajout d'un favori PRÉSENT et qui n'en a pas encore : une réponse
 * réseau arrivée en retard ne rebase jamais une référence déjà posée, et ne recrée pas un favori
 * retiré entre-temps. Rend `true` si le prix a été retenu.
 */
export function retenirPrixALAjout(id: number, prix: number): boolean {
  if (!estPrix(prix)) return false;
  const current = read();
  if (!current.includes(id)) return false;
  const tous = readPrix();
  if (estPrix(tous[id])) return false;
  tous[id] = prix;
  write(current, tous);
  return true;
}

/** Les prix à l'ajout retenus, par identifiant de bien. */
export function getPrixALAjout(): PrixALAjout {
  return readPrix();
}

export function remove(id: number): void {
  const current = read();
  if (!current.includes(id)) return;
  write(current.filter((v) => v !== id));
}

export function toggle(id: number): boolean {
  const current = read();
  const next = current.includes(id)
    ? current.filter((v) => v !== id)
    : [...current, id];
  write(next);
  return next.includes(id);
}

export function clear(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(FAVORITES_STORAGE_KEY);
    window.localStorage.removeItem(FAVORITES_PRICES_STORAGE_KEY);
    window.localStorage.removeItem(FAVORITES_FACETS_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    // ignore
  }
}

/** Les filtres de recherche qu'un favori portait quand il était public. */
export interface FacettesDUnFavori {
  readonly city?: string;
  readonly quarter?: string;
  readonly type?: string;
  readonly contract_type?: string;
}

const CLES_DE_FACETTE = ['city', 'quarter', 'type', 'contract_type'] as const;

function nettoyerFacettes(brut: unknown): FacettesDUnFavori | null {
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return null;
  const sortie: Record<string, string> = {};
  for (const cle of CLES_DE_FACETTE) {
    const v = (brut as Record<string, unknown>)[cle];
    if (typeof v === 'string' && v.trim() !== '' && v.length <= 120) sortie[cle] = v.trim();
  }
  return Object.keys(sortie).length > 0 ? sortie : null;
}

function parseFacettes(raw: string | null): Map<number, FacettesDUnFavori> {
  const sortie = new Map<number, FacettesDUnFavori>();
  if (!raw) return sortie;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return sortie;
    for (const paire of parsed) {
      if (!Array.isArray(paire) || paire.length !== 2) continue;
      const id = Number(paire[0]);
      const f = nettoyerFacettes(paire[1]);
      if (Number.isSafeInteger(id) && id > 0 && f) {
        sortie.delete(id);
        sortie.set(id, f);
      }
    }
  } catch {
    // illisible : rien n'est retenu
  }
  return sortie;
}

/** Un bien tel que l'écran le montre — seuls ces champs sont lus. */
export interface BienAFacettes {
  readonly id: number;
  readonly type?: string | null;
  readonly contract_type?: string | null;
  readonly location?: { readonly city?: string | null; readonly quarter?: string | null } | null;
}

/**
 * Retient les facettes de biens PUBLICS que l'écran vient de montrer. L'ordre d'écriture est
 * l'ordre d'âge : un bien revu repasse en dernier, et au-delà de {@link FACETTES_MAX} le plus
 * ancien est oublié. N'écrit rien (et ne prévient personne) quand rien ne change.
 */
export function retenirFacettes(biens: readonly BienAFacettes[]): void {
  if (typeof window === 'undefined' || biens.length === 0) return;
  try {
    const avant = window.localStorage.getItem(FAVORITES_FACETS_STORAGE_KEY);
    const toutes = parseFacettes(avant);
    for (const b of biens) {
      const f = nettoyerFacettes({
        city: b.location?.city ?? undefined,
        quarter: b.location?.quarter ?? undefined,
        type: b.type ?? undefined,
        contract_type: b.contract_type ?? undefined,
      });
      if (!f || !Number.isSafeInteger(b.id) || b.id <= 0) continue;
      toutes.delete(b.id);
      toutes.set(b.id, f);
    }
    const gardees = [...toutes.entries()].slice(-FACETTES_MAX);
    const apres = JSON.stringify(gardees);
    if (apres === avant) return;
    window.localStorage.setItem(FAVORITES_FACETS_STORAGE_KEY, apres);
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    // quota / mode privé : « Biens proches » retombera sur la liste sans filtre
  }
}

let cachedFacettesSignature: string | null = null;
let cachedFacettes = new Map<number, FacettesDUnFavori>();

function getFacettesSnapshot(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(FAVORITES_FACETS_STORAGE_KEY);
}

function facettesDepuis(brut: string | null): Map<number, FacettesDUnFavori> {
  if (brut !== cachedFacettesSignature) {
    cachedFacettesSignature = brut;
    cachedFacettes = parseFacettes(brut);
  }
  return cachedFacettes;
}

/** Les facettes retenues d'un favori, ou `null` — lu au rendu, `null` côté serveur. */
export function useFacettesDe(id: number): FacettesDUnFavori | null {
  const brut = useSyncExternalStore(subscribe, getFacettesSnapshot, () => null);
  return facettesDepuis(brut).get(id) ?? null;
}

/** Overwrite the entire id list — used to seed the store after login. */
export function replace(ids: number[]): void {
  write(ids);
}

/**
 * TCK-1826 (P136.05) — le chargeur des favoris serveur, lancé au premier abonné du magasin.
 *
 * `AuthContext` le pose pour l'utilisateur connecté au lieu de lire tout de suite : un écran sans
 * cœur ni compteur (console d'agence, `/super-admin`) ne paie plus la lecture de tous les favoris.
 * Un chargeur ne part qu'une fois ; un abonné déjà monté le lance aussitôt posé.
 */
let chargeur: (() => void) | null = null;
let abonnes = 0;

function lancerChargeur(): void {
  const fn = chargeur;
  chargeur = null;
  fn?.();
}

/** Pose le chargeur à lancer au premier abonné ; rend de quoi le retirer s'il n'est pas parti. */
export function chargerAuPremierAbonne(fn: () => void): () => void {
  chargeur = fn;
  if (abonnes > 0) lancerChargeur();
  return () => {
    if (chargeur === fn) chargeur = null;
  };
}

export function subscribe(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  abonnes += 1;
  lancerChargeur();
  const onStorage = (e: StorageEvent) => {
    if (
      e.key === FAVORITES_STORAGE_KEY ||
      e.key === FAVORITES_PRICES_STORAGE_KEY ||
      e.key === FAVORITES_FACETS_STORAGE_KEY ||
      e.key === null
    ) {
      listener();
    }
  };
  const onChange = () => listener();
  window.addEventListener('storage', onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    abonnes -= 1;
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

// useSyncExternalStore needs a referentially-stable snapshot. We cache by
// signature so identical id-lists keep the same array identity.
let cachedSignature = '';
let cachedIds: number[] = [];

function getSnapshot(): number[] {
  const ids = read();
  const sig = ids.join(',');
  if (sig !== cachedSignature) {
    cachedSignature = sig;
    cachedIds = ids;
  }
  return cachedIds;
}

const EMPTY_IDS: number[] = [];

let cachedPrixSignature = '';
let cachedPrix: PrixALAjout = {};

function getPrixSnapshot(): PrixALAjout {
  if (typeof window === 'undefined') return cachedPrix;
  const brut = window.localStorage.getItem(FAVORITES_PRICES_STORAGE_KEY) ?? '';
  if (brut !== cachedPrixSignature) {
    cachedPrixSignature = brut;
    cachedPrix = parsePrix(brut);
  }
  return cachedPrix;
}

const PRIX_VIDES: PrixALAjout = {};

function getPrixServerSnapshot(): PrixALAjout {
  return PRIX_VIDES;
}

/** TCK-2508 — les prix à l'ajout de l'appareil, réactifs (même magasin, même événement). */
export function usePrixALAjout(): PrixALAjout {
  return useSyncExternalStore(subscribe, getPrixSnapshot, getPrixServerSnapshot);
}

function getServerSnapshot(): number[] {
  return EMPTY_IDS;
}

export interface UseFavoritesResult {
  /** Property IDs currently favorited (cached client-side). */
  ids: number[];
  /** True after the first client render — gate UI to avoid SSR/CSR mismatches. */
  isHydrated: boolean;
  /** Number of favorites — convenience for badge rendering. */
  count: number;
  has: (id: number) => boolean;
  toggle: (id: number) => boolean;
  remove: (id: number) => void;
  add: (id: number, prix?: number | null) => void;
  clear: () => void;
  replace: (ids: number[]) => void;
}

// Hydration probe — the server snapshot is `false`, the client snapshot is
// `true`, so the value flips on the first client commit without needing a
// useEffect.
function subscribeNoop(): () => void {
  return () => {};
}

export function useFavorites(): UseFavoritesResult {
  const ids = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const isHydrated = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
  return {
    ids,
    isHydrated,
    count: ids.length,
    has: (id) => ids.includes(id),
    toggle,
    remove,
    add,
    clear,
    replace,
  };
}
