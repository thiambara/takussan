/**
 * TCK-2896 — le coffre de l'agence (`GET /api/agency/document-vault`, TCK-2895) mis en forme pour
 * l'écran : l'arbre « bien › bail › dossier », la clé d'URL d'un dossier, l'alerte d'un dossier, le
 * résumé d'un bien replié, et les entrées de la liste (téléversées ou générées) dans la forme du coffre,
 * pour réutiliser ses lignes et ses marques.
 *
 * Module pur : aucune requête, aucun texte (le rendu résout les clés sous `documents.agence.*`).
 */

import { echeanceDe, gesteDeLEntree, natureDeLEntree, type EntreeDuCoffre, type EntreeVue } from '@/lib/documents/coffre';
import type { DocumentGenere } from '@/lib/queries/documents';
import type { Document } from '@/types/document';

/* ─────────────────────────────────────────── La réponse de l'API ─────────────────────────────────────────── */

/** Les quatre comptes d'un nœud ou d'un dossier (ADR-0099 : un généré ne compte jamais dans les alertes). */
export interface ComptesDuCoffre {
  readonly documents: number;
  readonly expiring_soon: number;
  readonly unverified: number;
  /** `AAAA-MM-JJ` : la plus proche des échéances dans la fenêtre « expire bientôt », sinon `null`. */
  readonly next_expiry_date: string | null;
}

export type CleDeDossierDAgence = 'property_pieces' | 'contract' | 'inventories' | 'receipts' | 'tenant_pieces' | 'agency_pieces';

export interface CibleDAgence {
  readonly type: 'property' | 'lease' | 'agency';
  readonly id: number;
}

export interface DossierDAgence extends ComptesDuCoffre {
  readonly key: CleDeDossierDAgence;
  readonly kind: 'generated' | 'uploaded';
  readonly target: CibleDAgence;
}

export interface BailDuCoffre extends ComptesDuCoffre {
  readonly id: number;
  readonly reference_number: string | null;
  readonly status: string | null;
  readonly start_date: string | null;
  readonly tenant: { readonly name: string | null };
  readonly folders: readonly DossierDAgence[];
}

export interface BienDuCoffre extends ComptesDuCoffre {
  readonly id: number;
  readonly title: string | null;
  readonly neighborhood: string | null;
  readonly folders: readonly DossierDAgence[];
  readonly leases: readonly BailDuCoffre[];
}

export interface CoffreDeLAgence {
  readonly agency: { readonly id: number };
  readonly totals: ComptesDuCoffre;
  readonly properties: readonly BienDuCoffre[];
  readonly agency_folder: DossierDAgence;
}

/** Une entrée générée de la liste de l'agence (`filter[generated]=1`), avec son contexte. */
export interface EntreeGenereeDeLAgence extends EntreeDuCoffre {
  readonly context?: {
    readonly property: { readonly id: number; readonly title: string | null; readonly neighborhood: string | null } | null;
    readonly lease: { readonly id: number; readonly reference_number: string | null; readonly tenant_name: string | null } | null;
  };
}

/* ─────────────────────────────────────────── La clé d'un dossier ─────────────────────────────────────────── */

/**
 * La clé d'URL d'un dossier (`?dossier=`) : `lease-12-tenant_pieces`, `property-5-property_pieces`,
 * `agency-3-agency_pieces`. Lisible, stable, et sans identifiant d'une autre agence possible : elle ne
 * désigne qu'un dossier que l'arbre de l'appelant contient (sinon, rien n'est choisi).
 */
export function cleDuDossier(d: Pick<DossierDAgence, 'key' | 'target'>): string {
  return `${d.target.type}-${d.target.id}-${d.key}`;
}

export interface DossierTrouve {
  readonly dossier: DossierDAgence;
  readonly bien: BienDuCoffre | null;
  readonly bail: BailDuCoffre | null;
}

/** Le dossier de l'arbre que désigne `cle`, avec son bien et son bail ; `null` s'il n'y est pas. */
export function trouverLeDossier(coffre: CoffreDeLAgence, cle: string | null): DossierTrouve | null {
  if (!cle) return null;
  if (cleDuDossier(coffre.agency_folder) === cle) return { dossier: coffre.agency_folder, bien: null, bail: null };
  for (const bien of coffre.properties) {
    for (const d of bien.folders) if (cleDuDossier(d) === cle) return { dossier: d, bien, bail: null };
    for (const bail of bien.leases) {
      for (const d of bail.folders) if (cleDuDossier(d) === cle) return { dossier: d, bien, bail };
    }
  }
  return null;
}

/**
 * Les catégories que range un dossier généré d'un bail : le même découpage que l'API
 * (`AgencyDocumentVault::countOf`, préfixes `lease_contract`, `inventory_`, `receipt_`).
 */
export function rangeDansLeDossier(cle: CleDeDossierDAgence, categorie: string): boolean {
  switch (cle) {
    case 'contract':
      return categorie.startsWith('lease_contract');
    case 'inventories':
      return categorie.startsWith('inventory_');
    case 'receipts':
      return categorie.startsWith('receipt_');
    default:
      return false;
  }
}

/* ─────────────────────────────────────────── Alerte et résumé ─────────────────────────────────────────── */

/**
 * L'alerte d'un dossier ou d'un nœud : « 1 expire dans 42 jours · 1 à vérifier ». Le jour d'échéance
 * n'est dit que pour une seule pièce (« 2 expirent bientôt » sinon) ; `null` sans rien à signaler.
 */
export interface AlerteDuDossier {
  readonly expire: { readonly n: number; readonly jours: number | null } | null;
  readonly aVerifier: number;
}

export function alerteDuDossier(c: ComptesDuCoffre, aujourdhui: string): AlerteDuDossier | null {
  if (c.expiring_soon === 0 && c.unverified === 0) return null;
  let expire: AlerteDuDossier['expire'] = null;
  if (c.expiring_soon > 0) {
    const echeance = c.expiring_soon === 1 ? echeanceDe(c.next_expiry_date, aujourdhui) : null;
    const jours = echeance?.etat === 'bientot' ? echeance.jours : echeance?.etat === 'aujourdhui' ? 0 : null;
    expire = { n: c.expiring_soon, jours };
  }
  return { expire, aVerifier: c.unverified };
}

/** Le résumé d'un bien replié : « Bail Mamadou Seck · 12 documents », « 3 baux · 31 documents », « 5 documents ». */
export type ResumeDuBien =
  | { readonly cle: 'unBail'; readonly locataire: string; readonly documents: number }
  | { readonly cle: 'baux'; readonly baux: number; readonly documents: number }
  | { readonly cle: 'documents'; readonly documents: number };

export function resumeDuBien(bien: BienDuCoffre): ResumeDuBien {
  const [seul] = bien.leases;
  if (bien.leases.length === 1 && seul?.tenant.name) return { cle: 'unBail', locataire: seul.tenant.name, documents: bien.documents };
  if (bien.leases.length > 1) return { cle: 'baux', baux: bien.leases.length, documents: bien.documents };
  return { cle: 'documents', documents: bien.documents };
}

/** Les biens qui ont au moins un document ; les autres sont comptés, jamais listés (décision 1 (a) de TCK-2656). */
export function biensAvecDocuments(coffre: CoffreDeLAgence): readonly BienDuCoffre[] {
  return coffre.properties.filter((b) => b.documents > 0);
}

/* ─────────────────────────────────────────── Les entrées de la liste ─────────────────────────────────────────── */

function vue(cle: string, entree: EntreeDuCoffre, aujourdhui: string): EntreeVue {
  return {
    cle,
    entree,
    nature: natureDeLEntree(entree),
    geste: gesteDeLEntree(entree),
    echeance: entree.kind === 'uploaded' ? echeanceDe(entree.expiry_date, aujourdhui) : null,
  };
}

/** Une ligne de `GET /api/documents` (cible agence) dans la forme d'une entrée du coffre. */
export function entreeDuDocument(doc: Document, aujourdhui: string): EntreeVue {
  return vue(
    `document-${doc.id}`,
    {
      kind: 'uploaded',
      category: doc.type,
      title: doc.name,
      date: doc.created_at ? doc.created_at.slice(0, 10) : null,
      download_path: '',
      targets: [],
      document_id: doc.id,
      is_verified: doc.is_verified,
      expiry_date: doc.expiry_date,
      versions_count: null,
    },
    aujourdhui,
  );
}

/** Une entrée générée (liste de l'agence, ou `GET /api/documents/generated`) dans la forme du coffre. */
export function entreeGeneree(g: DocumentGenere | EntreeGenereeDeLAgence, aujourdhui: string): EntreeVue {
  return vue(
    `genere-${g.download_path}`,
    {
      kind: 'generated',
      category: g.category,
      title: g.title,
      date: g.date,
      download_path: g.download_path,
      targets: 'targets' in g ? g.targets : [],
      document_id: null,
      is_verified: null,
      expiry_date: null,
      versions_count: null,
    },
    aujourdhui,
  );
}
