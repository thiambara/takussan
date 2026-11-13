import {
  etiquetteDuDossier,
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
 * Bâti sur les cibles brutes et non sur les dossiers vus : un bien sans document n'est pas listé au
 * coffre (décision 1 (a)), et c'est pourtant là que le bailleur range sa première pièce. Un dossier en
 * lecture seule (TCK-2729) n'y figure pas : l'API n'en rend jamais la cible.
 */

export type TypeDeCible = 'user' | 'lease' | 'property';

/**
 * Ce que le dossier ne dit pas seul : chez le bailleur, un bien et ses baux se rangent dans le même
 * dossier, sous le même nom — et un bien peut avoir plusieurs baux (un bail clos, le bail en cours),
 * que leur numéro distingue.
 */
export type PrecisionDeRangement = { readonly cle: 'leBien' } | { readonly cle: 'leBail'; readonly reference: string | null } | null;

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
  const nombreDeBaux = coffre.folders.filter((d) => d.kind === 'lease').length;
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
    // Le dossier d'un bien se lit à sa clé, qu'il soit rendu ou non (un bien sans document n'est pas listé).
    const precision: PrecisionDeRangement = cible.folder.startsWith('property:')
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
 * remplacement (une nouvelle version, décision L2 (a)).
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
