/**
 * TCK-2479 (ADR-0089 §5) — le groupe « Démarrer » d'un espace neuf : ce que le menu fait des étapes
 * que rend `GET /api/me/espace/demarrage` (`EspaceDemarrageController`).
 *
 * L'API dit QUELLES étapes et si elles sont faites ; le front, OÙ chacune se fait et comment elle se
 * dit (principe 5 du `CLAUDE.md` racine). Un code que ce fichier ne connaît pas n'est ni rendu ni
 * compté : le groupe ne montre jamais un lien sans destination.
 */
export type ModeDemarrer = 'espace' | 'bailleur';

export const CODES_D_ETAPE = ['premier_bien', 'kyc', 'equipe', 'pieces'] as const;
export type CodeDEtape = (typeof CODES_D_ETAPE)[number];

export interface EtapeDeDemarrage {
  readonly code: string;
  readonly faite: boolean;
}

export interface EtapeARendre {
  readonly code: CodeDEtape;
  readonly href: string;
  /** Clé sous `nav.sidebar.demarrer`. */
  readonly cle: string;
}

/**
 * L'écran qui fait chaque étape.
 *
 * TCK-2614 (décisions 1a, 2a, 3a) — les pièces d'un invité se donnent sur « Vos pièces » (`/app/pieces`) : l'étape
 * `pieces` de l'agent et du prestataire, et l'étape `kyc` du BAILLEUR, qui rouvrait son assistant d'onboarding
 * (`/onboarding/owner?owner=`, TCK-589). L'écran lit le profil ACTIF, celui sur lequel l'API a jugé l'étape : il n'a
 * plus besoin de `?owner=`. L'assistant, lui, ne change pas (il garde ses pièces jusqu'à TCK-2613).
 */
function lienDe(code: CodeDEtape, mode: ModeDemarrer): string {
  switch (code) {
    case 'premier_bien':
      return '/app/properties/new';
    case 'equipe':
      return '/app/agency/team';
    case 'pieces':
      return '/app/pieces';
    case 'kyc':
      return mode === 'espace' ? '/app/agency/kyc' : '/app/pieces';
  }
}

function connue(e: EtapeDeDemarrage): e is EtapeDeDemarrage & { readonly code: CodeDEtape } {
  return (CODES_D_ETAPE as readonly string[]).includes(e.code);
}

/**
 * AC5 — une étape faite SORT du groupe ; la progression dit combien l'étaient.
 *
 * Revue de TCK-2479 (M6) — `ouverte` juge l'écran de chaque étape par la garde de SA page : l'API
 * rend les étapes sous `agency.update` (`configure`), mais `/app/agency/kyc` exige
 * `agency.update_kyc` et `/app/properties/new` `properties.create` (ou d'être bailleur) : un
 * rôle d'admin personnalisé voyait le lien et tombait sur un refus. (`/app/agency/team` s'ouvre à tout
 * admin : `ouvertePar` ne juge que le non-admin, `pageAccessible`.) Une étape
 * dont l'écran est fermé n'est ni rendue ni comptée — comme `equipe` pour une agence `individual`.
 */
export function etapesARendre(
  etapes: readonly EtapeDeDemarrage[],
  mode: ModeDemarrer,
  ouverte: (href: string) => boolean = () => true,
): { readonly restantes: readonly EtapeARendre[]; readonly faites: number; readonly total: number } {
  const connues = etapes.filter(connue).filter((e) => ouverte(lienDe(e.code, mode)));
  return {
    restantes: connues
      .filter((e) => !e.faite)
      .map((e) => ({ code: e.code, href: lienDe(e.code, mode), cle: `etapes.${mode}.${e.code}` })),
    faites: connues.filter((e) => e.faite).length,
    total: connues.length,
  };
}

/**
 * Revue de TCK-2479 (M2) — reste-t-il une étape À RENDRE (connue, pas faite) ? `false` pour `[]` et
 * pour un espace en service : le groupe ne s'affiche plus, sa lecture n'a plus à se refaire.
 */
export function resteADemarrer(etapes: readonly EtapeDeDemarrage[]): boolean {
  return etapes.some((e) => connue(e) && !e.faite);
}
