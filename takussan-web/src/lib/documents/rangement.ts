import {
  etiquetteDuDossier,
  nombreDeBauxDuLocataire,
  type CoffreDeDocuments,
  type CoffreVu,
  type EntreeVue,
  type EtiquetteDeDossier,
} from './coffre';

/**
 * TCK-2656 (lot 2) — « Rangé dans » : les dossiers où l'appelant peut ranger un document, tirés des
 * SEULES cibles que l'API rend (`attachable_targets`, jugées par `DocumentPolicy::attachTo`). Un
 * identifiant ne se saisit jamais : il voyage avec le dossier choisi.
 *
 * Bâti sur les cibles brutes et non sur les dossiers vus : un sous-dossier de bail vide n'est pas
 * listé au coffre (TCK-2898), et c'est pourtant là qu'une pièce du bail se range. Un dossier en
 * lecture seule (TCK-2729) n'y figure pas : l'API n'en rend jamais la cible.
 */

export type TypeDeCible = 'user' | 'lease' | 'property';

/**
 * Ce que le dossier ne dit pas seul : chez le bailleur, un bien et ses baux se rangent dans le même
 * dossier, sous le même nom — et un bien peut avoir plusieurs baux (un bail clos, le bail en cours),
 * que leur numéro distingue.
 */
export type PrecisionDeRangement =
  | { readonly cle: 'leBien' }
  | { readonly cle: 'leBail'; readonly reference: string | null }
  /** TCK-2898 — le sous-dossier d'un bail (« Bail de Fatou Kiné Diallo ») se précise par son bien. */
  | { readonly cle: 'dansLeBien'; readonly nom: string; readonly reference: string | null }
  | null;

export interface CibleDeRangement {
  /** `type:id` — la valeur du choix. */
  readonly cle: string;
  readonly type: TypeDeCible;
  readonly id: number;
  /** La clé du dossier du coffre où le document se rangera. */
  readonly dossier: string;
  /** Le nom du dossier : celui que le coffre affiche. */
  readonly etiquette: EtiquetteDeDossier;
  readonly precision: PrecisionDeRangement;
}

const TYPES: readonly string[] = ['user', 'lease', 'property'];

export function ciblesDeRangement(coffre: CoffreDeDocuments): readonly CibleDeRangement[] {
  const nombreDeBaux = nombreDeBauxDuLocataire(coffre);
  const parCle = new Map(coffre.folders.map((d) => [d.key, d]));
  const vues = new Set<string>();
  const cibles: CibleDeRangement[] = [];

  for (const cible of coffre.attachable_targets) {
    if (!TYPES.includes(cible.type)) continue;
    const cle = `${cible.type}:${cible.id}`;
    if (vues.has(cle)) continue;
    vues.add(cle);
    const dossier = parCle.get(cible.folder);
    if (dossier?.read_only) continue;

    const type = cible.type as TypeDeCible;
    const etiquette: EtiquetteDeDossier = dossier
      ? etiquetteDuDossier(dossier, nombreDeBaux)
      : type === 'user'
        ? { cle: 'mesPieces' }
        : { cle: 'bien', nom: cible.name ?? '' };
    // Le dossier d'un bien se lit à sa clé. TCK-2898 — un bail rangé dans son sous-dossier se précise par
    // le nom de son bien (le dossier parent).
    const parent = dossier?.parent ? parCle.get(dossier.parent) : undefined;
    const precision: PrecisionDeRangement = parent
      ? { cle: 'dansLeBien', nom: parent.name ?? cible.name ?? '', reference: cible.reference ?? null }
      : cible.folder.startsWith('property:')
        ? type === 'lease'
          ? { cle: 'leBail', reference: cible.reference ?? null }
          : { cle: 'leBien' }
        : null;
    cibles.push({ cle, type, id: cible.id, dossier: cible.folder, etiquette, precision });
  }

  return cibles;
}

/** « Mes pièces » d'abord : le rangement que l'ajout du coffre propose sans qu'on choisisse. */
export function cibleParDefaut(cibles: readonly CibleDeRangement[]): CibleDeRangement | null {
  return cibles.find((c) => c.type === 'user') ?? cibles[0] ?? null;
}

/**
 * « À renouveler » de la feuille d'ajout : les pièces téléversées qui expirent dans la fenêtre, ou ont
 * expiré, hors des dossiers en lecture seule — la plus pressée d'abord. Leur fiche porte le
 * remplacement (une nouvelle version) ; TCK-2898 : l'ajout aussi, par « Remplace … qui expire »
 * ({@link pieceARemplacer}).
 */
export function piecesARenouveler(vu: CoffreVu): readonly EntreeVue[] {
  const rang = (v: EntreeVue): number => {
    const e = v.echeance;
    if (e?.etat === 'expiree') return -1;
    if (e?.etat === 'aujourdhui') return 0;
    return e?.etat === 'bientot' ? e.jours : Number.POSITIVE_INFINITY;
  };
  return vu.dossiers
    .filter((d) => !d.lectureSeule)
    .flatMap((d) => d.entrees)
    .filter((v) => v.geste.geste === 'ouvrir' && Number.isFinite(rang(v)))
    .sort((a, b) => rang(a) - rang(b));
}

/**
 * TCK-2898 — « Remplace la carte qui expire » : la pièce téléversée de la catégorie choisie qui expire
 * dans la fenêtre de 60 jours, aujourd'hui, ou qui a déjà expiré (celles de « À renouveler »), hors des
 * dossiers en lecture seule — la plus pressée. `null` : l'interrupteur n'est pas rendu.
 */
export function pieceARemplacer(vu: CoffreVu, categorie: string): (EntreeVue & { readonly documentId: number }) | null {
  for (const vue of piecesARenouveler(vu)) {
    if (vue.entree.category !== categorie || vue.geste.geste !== 'ouvrir') continue;
    // Une pièce KYC posée sur un profil ne se versionne pas (422 `document.profile_piece_not_versioned`).
    if (PIECES_KYC.includes(categorie) && vue.entree.targets.some((c) => c.type.endsWith('_profile'))) continue;
    return { ...vue, documentId: vue.geste.documentId };
  }
  return null;
}

/** `Document::PIECE_TYPES` de l'API : les pièces KYC, que l'API ne versionne pas sur un profil. */
const PIECES_KYC: readonly string[] = ['id_card', 'rib', 'ninea'];
