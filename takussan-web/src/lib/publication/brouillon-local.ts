/**
 * TCK-2600 (ADR-0093 § 2-6) — le brouillon d'une annonce commencée SANS COMPTE, gardé dans ce
 * navigateur : les valeurs, l'étape et les photos. C'est la SEULE couche qui touche au stockage :
 * aucun composant n'appelle IndexedDB directement.
 *
 * - **Un brouillon par navigateur** (§ 3) : un seul enregistrement, sous deux clés d'un même magasin
 *   — `valeurs` (l'étape et les champs) et `photos` (les fichiers, déjà réduits). Deux clés et non
 *   une : une frappe dans le titre ne réécrit pas dix photos.
 * - **Rien d'une personne** (§ 6) : ni numéro, ni code, ni jeton, ni prénom, ni nom. Les valeurs sont
 *   FILTRÉES par une liste fermée de clés de l'annonce (`CLES_DE_L_ANNONCE`) : une clé qu'on n'y a
 *   pas mise ne s'écrit pas, quoi que l'appelant passe.
 * - **Purge** (§ 5) : un brouillon que personne n'a touché depuis 30 jours est effacé à l'ouverture ;
 *   `effacer()` le fait à la demande.
 * - **Quand le stockage manque** (§ 4) : IndexedDB refusé (navigation privée) ou quota atteint
 *   (`QuotaExceededError`) → l'annonce reste EN MÉMOIRE le temps de l'onglet, et `etat()` le dit
 *   (`persistance: 'memoire'`, avec sa raison) pour que l'écran l'écrive. Rien n'est perdu sans
 *   message : un échec d'écriture bascule en mémoire AVEC la donnée qu'il n'a pas pu écrire.
 *
 * Le moteur est injectable (`MoteurDeStockage`) : IndexedDB dans le navigateur, un moteur en
 * mémoire pour les tests et pour le repli.
 */

/** Les clés de l'annonce qu'un brouillon anonyme garde — et AUCUNE autre (ADR-0093 § 6, § 9). */
export const CLES_DE_L_ANNONCE = [
  'type',
  'contract_type',
  'city',
  'quarter',
  'region',
  'geo_region_id',
  'geo_city_id',
  'geo_neighborhood_id',
  'street',
  'postal_code',
  'country',
  'latitude',
  'longitude',
  'area',
  'bedrooms',
  'bathrooms',
  'furnished',
  'year_built',
  'parking_spaces',
  'floor_number',
  'total_floors',
  'title_type',
  'condition',
  'tag_ids',
  'tag_names',
  'price',
  'currency',
  'rent_period',
  'available_from',
  'deposit_months',
  'advance_months',
  'monthly_charges',
  'title',
  'description',
  'virtual_tour_url',
] as const;

const CLES = new Set<string>(CLES_DE_L_ANNONCE);

/** Trente jours sans geste, décidés par le porteur le 2026-11-10 (ADR-0093 § 5). */
export const DUREE_DE_GARDE_MS = 30 * 24 * 60 * 60 * 1000;

/** Dix photos au plus, comme l'assistant (`StepPhotos`, `MAX_PHOTOS`). */
export const PHOTOS_MAX = 10;

export interface PhotoGardee {
  readonly id: string;
  readonly fichier: File;
}

export interface ValeursGardees {
  readonly etape: number;
  readonly valeurs: Readonly<Record<string, unknown>>;
  /** Le dernier geste, en millisecondes : la purge à 30 jours se juge sur lui. */
  readonly majLe: number;
}

/** Ce qu'un moteur range : des données qu'IndexedDB sait cloner (un `Blob`, pas un `File`). */
interface PhotoRangee {
  readonly id: string;
  readonly nom: string;
  readonly type: string;
  readonly modifieLe: number;
  readonly octets: Blob;
}

/**
 * TCK-2601 (r1) — l'annonce a été VERSÉE au brouillon serveur (`cle`) : elle se reprend désormais
 * dans l'assistant connecté. Le brouillon local n'est pas effacé pour autant — ses photos n'existent
 * que là (ADR-0093) ; il s'efface quand l'assistant connecté publie (`terminer`).
 */
export interface MarqueDeVersement {
  /** En millisecondes. */
  readonly le: number;
  readonly cle: string;
}

type Rangement = { readonly valeurs?: ValeursGardees; readonly photos?: readonly PhotoRangee[]; readonly verse?: MarqueDeVersement };
type Cle = keyof Rangement;

export interface MoteurDeStockage {
  lire<C extends Cle>(cle: C): Promise<Rangement[C] | undefined>;
  ecrire<C extends Cle>(cle: C, valeur: NonNullable<Rangement[C]>): Promise<void>;
  effacer(): Promise<void>;
}

export type RaisonDuRepli = 'refus' | 'quota';

export interface EtatDuStockage {
  /** `navigateur` : survit au rechargement ; `memoire` : le temps de l'onglet. */
  readonly persistance: 'navigateur' | 'memoire';
  readonly raison: RaisonDuRepli | null;
}

export interface BrouillonOuvert {
  /** Le brouillon trouvé à l'ouverture, `null` s'il n'y en avait pas (ou s'il vient d'être purgé). */
  readonly valeurs: ValeursGardees | null;
  readonly photos: readonly PhotoGardee[];
  /** Un brouillon de plus de 30 jours a été effacé à l'ouverture. */
  readonly purge: boolean;
  /** TCK-2601 (r1) — versé au brouillon serveur : `/publish` ne le rouvre plus, il mène à sa reprise. */
  readonly verse: MarqueDeVersement | null;
}

export interface BrouillonLocal {
  ouvrir(): Promise<BrouillonOuvert>;
  ecrireValeurs(etape: number, valeurs: Readonly<Record<string, unknown>>): Promise<void>;
  ecrirePhotos(photos: readonly PhotoGardee[]): Promise<void>;
  /** TCK-2601 (r1) — l'annonce est passée au brouillon serveur `cle` : la marque, sans rien effacer. */
  marquerVerse(cle: string): Promise<void>;
  effacer(): Promise<void>;
  etat(): EtatDuStockage;
}

/** Les seules clés de l'annonce, sans `undefined` (IndexedDB les garde, le formulaire n'en veut pas). */
export function valeursDeLAnnonce(valeurs: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const sortie: Record<string, unknown> = {};
  for (const [cle, valeur] of Object.entries(valeurs)) {
    if (CLES.has(cle) && valeur !== undefined) sortie[cle] = valeur;
  }
  return sortie;
}

function estQuota(erreur: unknown): boolean {
  if (typeof DOMException !== 'undefined' && erreur instanceof DOMException) {
    return erreur.name === 'QuotaExceededError' || erreur.code === 22;
  }
  return (erreur as { name?: string } | null)?.name === 'QuotaExceededError';
}

function versRangee(photo: PhotoGardee): PhotoRangee {
  const { fichier } = photo;
  return { id: photo.id, nom: fichier.name, type: fichier.type, modifieLe: fichier.lastModified, octets: fichier };
}

function depuisRangee(rangee: PhotoRangee): PhotoGardee {
  return {
    id: rangee.id,
    fichier: new File([rangee.octets], rangee.nom, { type: rangee.type, lastModified: rangee.modifieLe }),
  };
}

/** Un moteur en mémoire : celui des tests, et celui du repli quand le navigateur refuse. */
export function moteurEnMemoire(): MoteurDeStockage {
  const donnees = new Map<Cle, unknown>();
  return {
    lire: async (cle) => donnees.get(cle) as never,
    ecrire: async (cle, valeur) => {
      donnees.set(cle, valeur);
    },
    effacer: async () => {
      donnees.clear();
    },
  };
}

const BASE = 'takussan-publication';
const MAGASIN = 'brouillon';

function requete<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

/**
 * IndexedDB : une base, un magasin, trois clés (les valeurs, les photos, la marque de versement). Ouvrir peut échouer (navigation privée, stockage
 * bloqué) : l'erreur remonte à `ouvrirBrouillonLocal`, qui bascule en mémoire.
 */
export function moteurIndexedDB(fabrique: IDBFactory = indexedDB): MoteurDeStockage {
  let base: Promise<IDBDatabase> | null = null;
  const ouvrirBase = () => {
    base ??= new Promise<IDBDatabase>((resolve, reject) => {
      const r = fabrique.open(BASE, 1);
      r.onupgradeneeded = () => {
        if (!r.result.objectStoreNames.contains(MAGASIN)) r.result.createObjectStore(MAGASIN);
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.onblocked = () => reject(new DOMException('idb-bloquee', 'InvalidStateError'));
    });
    return base;
  };
  const transaction = async (mode: IDBTransactionMode) => (await ouvrirBase()).transaction(MAGASIN, mode);
  const terminee = (tx: IDBTransaction) =>
    new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new DOMException('idb-transaction-abandonnee', 'AbortError'));
    });
  return {
    lire: async (cle) => {
      const tx = await transaction('readonly');
      return (await requete(tx.objectStore(MAGASIN).get(cle))) as never;
    },
    ecrire: async (cle, valeur) => {
      const tx = await transaction('readwrite');
      tx.objectStore(MAGASIN).put(valeur, cle);
      await terminee(tx);
    },
    effacer: async () => {
      const tx = await transaction('readwrite');
      tx.objectStore(MAGASIN).clear();
      await terminee(tx);
    },
  };
}

function moteurParDefaut(): MoteurDeStockage | null {
  try {
    return typeof indexedDB === 'undefined' ? null : moteurIndexedDB();
  } catch {
    return null;
  }
}

/**
 * Le brouillon local. `moteur` : IndexedDB par défaut, `null` quand le navigateur n'en a pas.
 * `maintenant` : l'horloge, injectable pour la purge.
 */
export function ouvrirBrouillonLocal({
  moteur = moteurParDefaut(),
  maintenant = () => Date.now(),
}: { readonly moteur?: MoteurDeStockage | null; readonly maintenant?: () => number } = {}): BrouillonLocal {
  let actif: MoteurDeStockage = moteur ?? moteurEnMemoire();
  let etat: EtatDuStockage = moteur ? { persistance: 'navigateur', raison: null } : { persistance: 'memoire', raison: 'refus' };

  /** Bascule en mémoire en y recopiant ce qu'on sait déjà : rien n'est perdu. */
  const replier = async (raison: RaisonDuRepli, connu: Rangement) => {
    if (etat.persistance === 'memoire') return;
    etat = { persistance: 'memoire', raison };
    actif = moteurEnMemoire();
    if (connu.valeurs) await actif.ecrire('valeurs', connu.valeurs);
    if (connu.photos) await actif.ecrire('photos', connu.photos);
    if (connu.verse) await actif.ecrire('verse', connu.verse);
  };
  // Ce que la couche a écrit ou lu en dernier : la copie que le repli emporte.
  const connu: { valeurs?: ValeursGardees; photos?: readonly PhotoRangee[]; verse?: MarqueDeVersement } = {};

  const ecrire = async <C extends Cle>(cle: C, valeur: NonNullable<Rangement[C]>) => {
    (connu as Record<Cle, unknown>)[cle] = valeur;
    try {
      await actif.ecrire(cle, valeur);
    } catch (erreur) {
      await replier(estQuota(erreur) ? 'quota' : 'refus', connu);
    }
  };

  return {
    async ouvrir() {
      let valeurs: ValeursGardees | undefined;
      let photos: readonly PhotoRangee[] | undefined;
      let verse: MarqueDeVersement | undefined;
      try {
        valeurs = await actif.lire('valeurs');
        photos = await actif.lire('photos');
        verse = await actif.lire('verse');
      } catch {
        await replier('refus', connu);
        return { valeurs: null, photos: [], purge: false, verse: null };
      }
      if (valeurs && maintenant() - valeurs.majLe > DUREE_DE_GARDE_MS) {
        try {
          await actif.effacer();
        } catch {
          await replier('refus', {});
        }
        return { valeurs: null, photos: [], purge: true, verse: null };
      }
      if (valeurs) connu.valeurs = valeurs;
      if (photos) connu.photos = photos;
      if (verse) connu.verse = verse;
      return {
        valeurs: valeurs ? { ...valeurs, valeurs: valeursDeLAnnonce(valeurs.valeurs) } : null,
        photos: (photos ?? []).slice(0, PHOTOS_MAX).map(depuisRangee),
        purge: false,
        verse: verse ?? null,
      };
    },
    async ecrireValeurs(etape, valeurs) {
      await ecrire('valeurs', { etape, valeurs: valeursDeLAnnonce(valeurs), majLe: maintenant() });
    },
    async ecrirePhotos(photos) {
      await ecrire('photos', photos.slice(0, PHOTOS_MAX).map(versRangee));
      // Une photo ajoutée ou retirée est un geste : la purge se compte depuis lui.
      if (connu.valeurs) await ecrire('valeurs', { ...connu.valeurs, majLe: maintenant() });
    },
    async marquerVerse(cle) {
      await ecrire('verse', { le: maintenant(), cle });
    },
    async effacer() {
      delete connu.valeurs;
      delete connu.photos;
      delete connu.verse;
      try {
        await actif.effacer();
      } catch {
        await replier('refus', {});
      }
    },
    etat: () => etat,
  };
}
