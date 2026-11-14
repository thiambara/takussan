/**
 * TCK-2656 — le coffre de documents de l'appelant (`GET /api/me/document-vault`, TCK-2655), mis en
 * forme pour l'écran : ordre des dossiers, libellés (sous forme de CLÉS : le front possède le texte),
 * nature de chaque entrée, et échéance d'une pièce au jour de Dakar.
 *
 * Module pur : aucune requête, aucun texte. Le rendu (`components/documents/coffre/*`) résout les clés
 * sous `documents.coffre.*`.
 *
 * **Le titre d'une entrée générée n'est pas un libellé** : c'est un numéro de référence
 * (`LS-0DPA75TK`, `LPY-JMQLQ0`) ou une période (`2026-10`). Le libellé se tire de la catégorie et de la
 * date ; le titre d'une entrée TÉLÉVERSÉE, lui, est le nom que son auteur lui a donné.
 */

import { cheminApi } from '@/lib/chemin-api';

/** Une cible de rattachement, telle que l'API l'écrit. */
export interface CibleDuCoffre {
  readonly type: string;
  readonly id: number;
}

export interface EntreeDuCoffre {
  readonly kind: 'generated' | 'uploaded';
  readonly category: string | null;
  readonly title: string | null;
  /** `AAAA-MM-JJ` : jour d'échéance d'une quittance, de signature d'un document généré, d'ajout d'une pièce. */
  readonly date: string | null;
  /** Chemin HTTP complet, `/api` compris. Pour une pièce téléversée : sa fiche JSON, pas son fichier. */
  readonly download_path: string;
  readonly targets: readonly CibleDuCoffre[];
  readonly document_id: number | null;
  readonly is_verified: boolean | null;
  readonly expiry_date: string | null;
  readonly versions_count: number | null;
}

export type GenreDeDossier = 'lease' | 'property' | 'pieces' | 'receipts' | 'statements' | 'bills';

export interface DossierDuCoffre {
  readonly key: string;
  readonly kind: GenreDeDossier;
  readonly target: CibleDuCoffre | null;
  readonly name: string | null;
  readonly year: number | null;
  readonly entries: readonly EntreeDuCoffre[];
  /**
   * TCK-2729 — toujours présent ; vrai seulement sur le dossier d'un bien d'un profil bailleur bloqué :
   * lisible, où rien ne s'ajoute (sa cible n'est jamais dans `attachable_targets`).
   */
  readonly read_only: boolean;
}

export interface CibleRattachable {
  readonly type: string;
  readonly id: number;
  /** La clé du dossier où un document rattaché à cette cible se range. */
  readonly folder: string;
  readonly name: string | null;
  /** TCK-2656 (lot 2) — le numéro d'un bail (`LS-…`), `null` pour toute autre cible. */
  readonly reference?: string | null;
}

export interface CoffreDeDocuments {
  readonly folders: readonly DossierDuCoffre[];
  readonly counts: { readonly expiring_soon: number; readonly unverified: number };
  readonly attachable_targets: readonly CibleRattachable[];
}

/** `Document::EXPIRING_SOON_DAYS` : la fenêtre « expire bientôt » de l'API, en jours. */
export const JOURS_AVANT_EXPIRATION = 60;

/* ─────────────────────────────────────────── Dossiers ─────────────────────────────────────────── */

/**
 * Libellé d'un dossier, en clé de `documents.coffre.dossiers` et ses valeurs.
 *
 * Un seul bail : « Mon bail ». Plusieurs : chacun porte le nom de son bien (« Bail · Garage à Ouest
 * Foire »), sinon deux dossiers « Mon bail » se suivraient.
 */
export type EtiquetteDeDossier =
  | { readonly cle: 'monBail' }
  | { readonly cle: 'bailDe'; readonly nom: string }
  | { readonly cle: 'bien'; readonly nom: string }
  | { readonly cle: 'quittances'; readonly annee: number }
  | { readonly cle: 'quittancesSansAnnee' }
  | { readonly cle: 'releves' }
  | { readonly cle: 'factures' }
  | { readonly cle: 'mesPieces' };

export function etiquetteDuDossier(dossier: DossierDuCoffre, nombreDeBaux: number): EtiquetteDeDossier {
  switch (dossier.kind) {
    case 'lease':
      return nombreDeBaux > 1 && dossier.name ? { cle: 'bailDe', nom: dossier.name } : { cle: 'monBail' };
    case 'property':
      return { cle: 'bien', nom: dossier.name ?? '' };
    case 'receipts':
      return dossier.year !== null ? { cle: 'quittances', annee: dossier.year } : { cle: 'quittancesSansAnnee' };
    case 'statements':
      return { cle: 'releves' };
    case 'bills':
      return { cle: 'factures' };
    case 'pieces':
      return { cle: 'mesPieces' };
  }
}

/** Rang d'affichage : baux, biens, quittances (année récente d'abord), relevés, factures, pièces. */
const RANG: Record<GenreDeDossier, number> = { lease: 0, property: 1, receipts: 2, statements: 3, bills: 4, pieces: 5 };

/* ─────────────────────────────────────────── Entrées ─────────────────────────────────────────── */

/** Ce qu'une entrée EST, d'où se tirent son libellé et son icône. */
export type NatureDEntree =
  | 'contrat'
  | 'edlEntree'
  | 'edlSortie'
  | 'quittance'
  | 'caution'
  | 'charges'
  | 'regularisation'
  | 'penalite'
  | 'releve'
  | 'attestation'
  | 'facture'
  | 'piece'
  /** Un document généré d'une catégorie que ce module ne connaît pas encore : « Document ». */
  | 'autre';

export function natureDeLEntree(entree: EntreeDuCoffre): NatureDEntree {
  if (entree.kind === 'uploaded') return 'piece';
  switch (entree.category) {
    case 'lease_contract':
      return 'contrat';
    case 'inventory_move_out':
      return 'edlSortie';
    case 'receipt_deposit':
      return 'caution';
    case 'receipt_charges':
      return 'charges';
    case 'receipt_regularization':
      return 'regularisation';
    case 'receipt_penalty':
      return 'penalite';
    case 'owner_statement':
      return 'releve';
    case 'annual_attestation':
      return 'attestation';
    case 'provider_bill':
      return 'facture';
    default:
      if (entree.category?.startsWith('inventory_')) return 'edlEntree';
      // Une quittance de loyer, et tout `receipt_*` qu'un nouveau type d'échéance ajouterait.
      if (entree.category?.startsWith('receipt_')) return 'quittance';
      return 'autre';
  }
}

/**
 * Le geste d'une ligne. Un document généré se télécharge par son endpoint, sauf la facture
 * d'intervention, qui n'a pas de PDF (sa « fiche » est du JSON) ; une pièce téléversée s'ouvre sur sa
 * fiche, qui porte le téléchargement, les versions et le partage (ADR-0099 : jamais pour un généré).
 */
export type GesteDeLEntree =
  | { readonly geste: 'telecharger'; readonly chemin: string }
  | { readonly geste: 'ouvrir'; readonly documentId: number }
  | { readonly geste: 'aucun' };

export function gesteDeLEntree(entree: EntreeDuCoffre): GesteDeLEntree {
  if (entree.kind === 'uploaded') {
    return entree.document_id !== null ? { geste: 'ouvrir', documentId: entree.document_id } : { geste: 'aucun' };
  }
  if (entree.category === 'provider_bill') return { geste: 'aucun' };
  return { geste: 'telecharger', chemin: entree.download_path };
}

/* ─────────────────────────────────────────── Échéance ─────────────────────────────────────────── */

export type Echeance =
  | { readonly etat: 'expiree'; readonly le: string }
  | { readonly etat: 'aujourdhui' }
  | { readonly etat: 'bientot'; readonly jours: number }
  | { readonly etat: 'plusTard'; readonly le: string };

/** Jours entre deux jours `AAAA-MM-JJ` (calendrier, sans heure ni fuseau). */
function ecartEnJours(de: string, a: string): number {
  const jour = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return Math.round((jour(a) - jour(de)) / 86_400_000);
}

/**
 * L'échéance d'une pièce au jour de Dakar `aujourdhui` (`AAAA-MM-JJ`) : « expire dans 42 jours » dans
 * la fenêtre de l'API (bornes comprises, comme `counts.expiring_soon`), sa date au-delà.
 */
export function echeanceDe(expiry: string | null, aujourdhui: string): Echeance | null {
  if (!expiry) return null;
  const jour = expiry.slice(0, 10);
  const jours = ecartEnJours(aujourdhui, jour);
  if (jours < 0) return { etat: 'expiree', le: jour };
  if (jours === 0) return { etat: 'aujourdhui' };
  if (jours <= JOURS_AVANT_EXPIRATION) return { etat: 'bientot', jours };
  return { etat: 'plusTard', le: jour };
}

/* ─────────────────────────────────────────── Le coffre vu ─────────────────────────────────────────── */

export interface EntreeVue {
  readonly cle: string;
  readonly entree: EntreeDuCoffre;
  readonly nature: NatureDEntree;
  readonly geste: GesteDeLEntree;
  readonly echeance: Echeance | null;
}

export interface DossierVu {
  readonly key: string;
  readonly kind: GenreDeDossier;
  readonly etiquette: EtiquetteDeDossier;
  readonly entrees: readonly EntreeVue[];
  /** Les quittances et les relevés s'ouvrent repliés : une ligne de résumé, la liste au toucher. */
  readonly replieParDefaut: boolean;
  readonly lectureSeule: boolean;
}

export interface AlerteDExpiration {
  readonly entree: EntreeVue;
  readonly jours: number;
  /** La pièce est dans un dossier en lecture seule : rien ne la remplace. */
  readonly lectureSeule: boolean;
}

export interface CoffreVu {
  readonly dossiers: readonly DossierVu[];
  readonly total: number;
  /** La pièce qui expire le plus tôt dans la fenêtre, s'il y en a une. */
  readonly alerte: AlerteDExpiration | null;
  readonly expireBientot: number;
  readonly nonVerifies: number;
  /**
   * TCK-2656, décision 1 (a) — les biens du bailleur dont le dossier est vide ne sont pas listés
   * (un bailleur de 73 biens en voyait 73 dossiers vides) : ils se comptent ici.
   */
  readonly biensSansDocument: number;
  /** TCK-2729 — au moins un dossier en lecture seule (listé ou vide) : le coffre le dit. */
  readonly lectureSeule: boolean;
}

function cleDeLEntree(dossier: string, entree: EntreeDuCoffre, rang: number): string {
  return `${dossier}|${entree.kind}|${entree.document_id ?? entree.download_path}|${rang}`;
}

/** Plus récent d'abord ; une entrée sans date en dernier. */
function parDateDecroissante(a: EntreeDuCoffre, b: EntreeDuCoffre): number {
  return (b.date ?? '').localeCompare(a.date ?? '');
}

/**
 * TCK-2770 — « Tout télécharger » : l'archive `.zip` d'un dossier en lot (les quittances d'une année,
 * les relevés), servie par l'API (`GET /api/me/document-vault/archive?folder=`), qui y met exactement
 * les entrées du coffre de ce dossier. `null` pour tout autre dossier, et pour un dossier vide.
 */
export function cheminDeLArchive(dossier: Pick<DossierVu, 'key' | 'kind' | 'entrees'>): string | null {
  if ((dossier.kind !== 'receipts' && dossier.kind !== 'statements') || dossier.entrees.length === 0) return null;
  return cheminApi`/api/me/document-vault/archive${new URLSearchParams({ folder: dossier.key })}`;
}

export function voirLeCoffre(coffre: CoffreDeDocuments, aujourdhui: string): CoffreVu {
  const nombreDeBaux = coffre.folders.filter((d) => d.kind === 'lease').length;

  const ordonnes = coffre.folders
    .map((dossier, rang) => ({ dossier, rang }))
    .sort((a, b) => {
      const ecart = RANG[a.dossier.kind] - RANG[b.dossier.kind];
      if (ecart !== 0) return ecart;
      if (a.dossier.kind === 'receipts') return (b.dossier.year ?? 0) - (a.dossier.year ?? 0);
      return a.rang - b.rang;
    })
    .map(({ dossier }) => dossier);

  const biensSansDocument = ordonnes.filter((d) => d.kind === 'property' && d.entries.length === 0).length;

  const dossiers = ordonnes
    .filter((d) => !(d.kind === 'property' && d.entries.length === 0))
    .map((dossier): DossierVu => {
      const parDate = dossier.kind === 'receipts' || dossier.kind === 'statements' || dossier.kind === 'bills';
      const entrees = parDate ? [...dossier.entries].sort(parDateDecroissante) : dossier.entries;
      return {
        key: dossier.key,
        kind: dossier.kind,
        etiquette: etiquetteDuDossier(dossier, nombreDeBaux),
        entrees: entrees.map((entree, rang) => ({
          cle: cleDeLEntree(dossier.key, entree, rang),
          entree,
          nature: natureDeLEntree(entree),
          geste: gesteDeLEntree(entree),
          echeance: entree.kind === 'uploaded' ? echeanceDe(entree.expiry_date, aujourdhui) : null,
        })),
        replieParDefaut: dossier.kind === 'receipts' || dossier.kind === 'statements',
        lectureSeule: dossier.read_only,
      };
    });

  let alerte: AlerteDExpiration | null = null;
  for (const dossier of dossiers) {
    for (const vue of dossier.entrees) {
      const e = vue.echeance;
      if (e === null) continue;
      const jours = e.etat === 'aujourdhui' ? 0 : e.etat === 'bientot' ? e.jours : null;
      if (jours !== null && (alerte === null || jours < alerte.jours)) alerte = { entree: vue, jours, lectureSeule: dossier.lectureSeule };
    }
  }

  return {
    dossiers,
    total: dossiers.reduce((somme, d) => somme + d.entrees.length, 0),
    alerte,
    expireBientot: coffre.counts.expiring_soon,
    nonVerifies: coffre.counts.unverified,
    biensSansDocument,
    lectureSeule: coffre.folders.some((d) => d.read_only),
  };
}

/* ─────────────────────────────────────────── Recherche ─────────────────────────────────────────── */

/**
 * TCK-2769 — le dossier d'une entrée trouvée, tel que l'API l'écrit sous `filter[search]` : ce qu'il
 * faut pour nommer le dossier à côté de l'entrée (« Quittances 2026 », « Villa Almadies »).
 */
export interface DossierDUneTrouvee {
  readonly key: string;
  readonly kind: GenreDeDossier;
  readonly name: string | null;
  readonly year: number | null;
  readonly read_only: boolean;
}

export interface EntreeTrouvee extends EntreeDuCoffre {
  readonly folder: DossierDUneTrouvee;
}

/** `GET /api/me/document-vault?filter[search]=` : les entrées du coffre qui correspondent, paginées par le serveur. */
export interface RechercheDansLeCoffre {
  readonly data: readonly EntreeTrouvee[];
  readonly meta: { readonly total: number; readonly per_page: number; readonly current_page: number; readonly last_page: number };
}

export interface TrouveeVue {
  readonly vue: EntreeVue;
  readonly dossier: EtiquetteDeDossier;
}

/**
 * Les entrées trouvées, mises en forme comme celles du coffre, dans l'ordre du serveur. Aucun filtre :
 * la recherche est jugée par l'API (TCK-2769), jamais sur le coffre chargé.
 *
 * `nombreDeBaux` est celui du coffre : avec un seul bail, son dossier reste « Mon bail ».
 */
export function voirLesTrouvees(trouvees: readonly EntreeTrouvee[], aujourdhui: string, nombreDeBaux: number): TrouveeVue[] {
  return trouvees.map((entree, rang) => ({
    vue: {
      cle: cleDeLEntree(entree.folder.key, entree, rang),
      entree,
      nature: natureDeLEntree(entree),
      geste: gesteDeLEntree(entree),
      echeance: entree.kind === 'uploaded' ? echeanceDe(entree.expiry_date, aujourdhui) : null,
    },
    dossier: etiquetteDuDossier({ ...entree.folder, target: null, entries: [] }, nombreDeBaux),
  }));
}
