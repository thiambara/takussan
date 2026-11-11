/**
 * TCK-2685 (ADR-0106 § 3, ADR-0107 § 4) — les NOMS des jetons de la partie connectée, déclarés dans
 * le bloc `jetons-de-l-app` de `src/app/globals.css`.
 *
 * Ils vivent ici pour une raison mesurée : `tailwind-merge` ne connaît que l'échelle de Tailwind.
 * Sans cette table, `cn('text-ui', 'text-foreground')` rendait `text-foreground` seul — `text-ui`,
 * inconnu, était pris pour une COULEUR et écrasé par la suivante, sans erreur ; `cn('shadow-feuille',
 * 'shadow-sm')` gardait les deux. `src/lib/utils.ts` étend la fusion avec ces noms, et
 * `jetons-de-l-app.test.ts` confronte cette table au bloc de `globals.css`, dans les deux sens :
 * un jeton déclaré là sans être nommé ici fait rougir.
 *
 * La valeur en px de la maquette, au réglage par défaut du navigateur, à toute largeur.
 */
export const TAILLES_DE_TEXTE = {
  pastille: 10,
  legende: 11,
  ui: 13,
  corps: 15,
  action: 16,
  'titre-court': 17,
  'affiche-22': 22,
  'affiche-26': 26,
  'affiche-28': 28,
  'affiche-32': 32,
  'affiche-40': 40,
} as const satisfies Record<string, number>;

export type TailleDeTexte = keyof typeof TAILLES_DE_TEXTE;

/** Espacement des lettres (`tracking-titre` −0,02 em, `tracking-surtitre` 0,08 em). */
export const ESPACEMENTS_DE_LETTRES = ['titre', 'surtitre'] as const;

/** Tailles nommées hors de l'échelle ×0,9 (`size-icone` : 18 px). */
export const TAILLES_FIXES = ['icone'] as const;

/** Ombres nommées. */
export const OMBRES = ['barre-collante', 'filet', 'bouton-photo', 'actif', 'panneau', 'feuille'] as const;

/** Le point de rupture de la bande ≥ 1440 (ADR-0106 § 4). */
export const POINTS_DE_RUPTURE = ['w1440'] as const;

/**
 * TCK-2686 — les jetons de l'ÉCHELLE DE DENSITÉ de `/app` (bloc `densite-de-l-app` de
 * `globals.css`), rangés par espace de nom de Tailwind (`--<espace>-<nom>`). Chaque primitive lit
 * sa hauteur et quelques teintes dans l'un d'eux ; la portée `/app` les redéfinit. `tailwind-merge`
 * doit les connaître pour qu'une classe d'appelant (`h-11`, `text-destructive`) REMPLACE le jeton
 * au lieu de cohabiter avec lui — c'est ce qui laisse la main à l'appelant.
 * `src/app/__tests__/densite-de-l-app.test.ts` confronte cette table au bloc.
 */
export const DENSITE_DE_L_APP = {
  spacing: [
    'controle',
    'controle-petit',
    'controle-action',
    'controle-confortable',
    'petit-bouton-x',
    'petit-bouton-espace',
    'zone-texte-y',
  ],
  radius: ['petit-bouton'],
  text: ['petit-bouton', 'champ', 'declencheur'],
  leading: ['zone-texte'],
  color: ['fond-champ', 'fond-contour', 'encre-bouton-doux', 'encre-discrete', 'bord-danger'],
  'font-weight': ['bouton-doux'],
} as const satisfies Record<string, readonly string[]>;
