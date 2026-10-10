import { cn } from '@/lib/utils';

/**
 * La marque Takussan — le « lever de toit » (TCK-583).
 *
 * Source : projet claude.ai/design « Takussan », `Canvas.dc.html`, tour 6, variante 6a retenue.
 * Un toit posé sur un soleil levant, lui-même posé sur l'horizon : le toit et l'horizon à l'encre
 * (`--foreground`), les sept rayons en terracotta (`--primary`). Le tracé est celui de la planche,
 * au centième près ; seule la couleur passe par les jetons, pour suivre le thème sombre.
 *
 * Le nom est écrit TEL QUEL (« Takussan ») et mis en capitales par la feuille de style. ⚠ Ça ne
 * suffit pas à le faire LIRE « Takussan » : Chrome applique `text-transform` au nom accessible —
 * mesuré le 2026-09-28, le lien d'accueil s'appelait « TAKUSSAN » dans l'arbre d'accessibilité,
 * quand jsdom, sans moteur CSS, rendait « Takussan ». Les capitales visibles sont donc muettes, et
 * le nom est lu par un double `sr-only`, sans transformation. Le symbole est `aria-hidden` aussi.
 *
 * L'horizon du symbole est posé sur la ligne de base des lettres (`items-baseline`) : c'est la
 * boîte du SVG, recadrée au plus juste par sa `viewBox`, qui porte la ligne de base.
 *
 * TCK-621 — deux tons. `encre` (défaut) : toit, horizon et nom à `--foreground`, pour les fonds
 * clairs — et pour les coques `.dark`, où le jeton s'inverse de lui-même. `clair` : toit, horizon
 * et nom à `--background`, pour les fonds sombres qui ne sont PAS sous `.dark` (la barre d'encre
 * de `/app`, la barre latérale de `/admin`, la photo de `/auth`) — le traitement même de
 * `icon.svg`, tuile d'encre et traits de lin. Les rayons restent terracotta dans les deux.
 */

/** Rayons du soleil : centre (24, 33), de r = 14 à r = 20, de −180° à 0° par pas de 30°. */
const RAYONS = [
  'M10.00 33.00L4.00 33.00',
  'M11.88 26.00L6.68 23.00',
  'M17.00 20.88L14.00 15.68',
  'M24.00 19.00L24.00 13.00',
  'M31.00 20.88L34.00 15.68',
  'M36.12 26.00L41.32 23.00',
  'M38.00 33.00L44.00 33.00',
] as const;

const TONS = {
  encre: { trait: 'stroke-foreground', nom: 'text-foreground' },
  clair: { trait: 'stroke-background', nom: 'text-background' },
} as const;

export type TonDuLogo = keyof typeof TONS;

export interface SymboleTakussanProps {
  readonly ton?: TonDuLogo;
  readonly className?: string;
}

/** Le symbole seul. Ses dimensions viennent de `className` (ratio 42,8 × 30). */
export function SymboleTakussan({ ton = 'encre', className }: SymboleTakussanProps) {
  const trait = TONS[ton].trait;
  return (
    <svg aria-hidden="true" focusable="false" viewBox="2.6 11.6 42.8 30" fill="none" className={className}>
      <g className="stroke-primary" strokeWidth={2.6} strokeLinecap="round">
        {RAYONS.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <path
        d="M13 33 24 23l11 10"
        className={trait}
        strokeWidth={4.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M5 39.5H43" className={trait} strokeWidth={3} strokeLinecap="round" />
    </svg>
  );
}

const TAILLES = {
  /** Barre de navigation : symbole 34 × 24, nom en 18 px — la planche « Barre de navigation ». */
  barre: { conteneur: 'gap-2', symbole: 'h-6 w-[34px]', nom: 'text-lg' },
  /** Pied de page : symbole 50 × 35, nom en 26 px — `Accueil.dc.html`. */
  pied: { conteneur: 'gap-3', symbole: 'h-[35px] w-[50px]', nom: 'text-[26px]' },
} as const;

export interface LogoProps {
  /** Le nom de la marque, tel qu'il doit être LU (`common.appName`). */
  readonly nom: string;
  readonly taille?: keyof typeof TAILLES;
  /**
   * `'des-sm'` : sous 640 px, le symbole seul — le nom reste LU (double `sr-only`), il n'est plus
   * dessiné. La barre mobile en a besoin : symbole et nom mesurent 158 px, et la pastille de
   * recherche tombait à 88 px à 390 (58 à 360), « Chercher » tronqué — mesuré le 2026-09-28.
   */
  readonly nomVisible?: 'toujours' | 'des-sm';
  /** `clair` sur un fond sombre hors `.dark` — cf. l'en-tête du fichier. */
  readonly ton?: TonDuLogo;
  readonly className?: string;
}

/** Le symbole et le nom sur une ligne. À placer DANS le lien d'accueil, qui en tire son nom. */
export function Logo({ nom, taille = 'barre', nomVisible = 'toujours', ton = 'encre', className }: LogoProps) {
  const t = TAILLES[taille];
  return (
    <span className={cn('inline-flex items-baseline', t.conteneur, className)}>
      <SymboleTakussan ton={ton} className={cn('block shrink-0', t.symbole)} />
      <span
        aria-hidden="true"
        className={cn(
          'font-display font-semibold uppercase leading-none tracking-[0.14em] whitespace-nowrap',
          TONS[ton].nom,
          t.nom,
          nomVisible === 'des-sm' && 'max-sm:hidden',
        )}
      >
        {nom}
      </span>
      <span className="sr-only">{nom}</span>
    </span>
  );
}
