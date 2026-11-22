/**
 * TCK-2479 (ADR-0089 §5) — le groupe « Démarrer » d'un espace neuf : ce que le menu fait des étapes
 * que rend `GET /api/me/espace/demarrage` (`EspaceDemarrageController`).
 *
 * L'API dit QUELLES étapes et si elles sont faites ; le front, OÙ chacune se fait et comment elle se
 * dit (principe 5 du `CLAUDE.md` racine). Un code que ce fichier ne connaît pas n'est ni rendu ni
 * compté : le groupe ne montre jamais un lien sans destination.
 */
import { CODES_DE_PIECE, type CodeDePiece } from '@/lib/pieces/pieces';

export type ModeDemarrer = 'espace' | 'bailleur';

/**
 * TCK-2947 — une étape par pièce requise, `piece:<code>` (TCK-2944) : le `<code>` est celui de `GET /api/me/pieces`
 * (`CODES_DE_PIECE`), la même table que l'écran « Vos pièces ». L'ancienne étape unique `pieces` (agent, prestataire)
 * et l'étape `kyc` du bailleur ne sont plus rendues par l'API : elles ne sont plus connues ici. `kyc` reste l'étape
 * de vérification de l'AGENCE (mode `espace`).
 */
export type CodeDEtapeDePiece = `piece:${CodeDePiece}`;
export const CODES_D_ETAPE = [
  'premier_bien',
  'kyc',
  'equipe',
  ...CODES_DE_PIECE.map((c): CodeDEtapeDePiece => `piece:${c}`),
] as const;
export type CodeDEtape = 'premier_bien' | 'kyc' | 'equipe' | CodeDEtapeDePiece;

export interface EtapeDeDemarrage {
  readonly code: string;
  readonly faite: boolean;
  /** TCK-2944 — l'état d'une étape `piece:*` (`manquante` | `envoyee` | `verifiee` | `refusee`) ; absent ailleurs. */
  readonly etat?: string;
}

export interface EtapeARendre {
  readonly code: CodeDEtape;
  readonly href: string;
  /** Clé sous `nav.sidebar.demarrer`. */
  readonly cle: string;
}

/**
 * L'écran qui fait chaque étape — `null` : l'étape n'existe pas dans ce mode (ni rendue ni comptée).
 *
 * TCK-2614 (décisions 1a, 2a, 3a) — les pièces d'un invité se donnent sur « Vos pièces » (`/app/pieces`), qui lit le
 * profil ACTIF, celui sur lequel l'API a jugé l'étape. TCK-2947 — une étape par pièce, toutes vers cet écran ; `kyc`
 * n'est plus que la vérification de l'agence (`/app/agency/kyc`), jamais une étape du bailleur.
 */
function lienDe(code: CodeDEtape, mode: ModeDemarrer): string | null {
  if (code.startsWith('piece:')) return '/app/pieces';
  switch (code) {
    case 'premier_bien':
      return '/app/properties/new';
    case 'equipe':
      return '/app/agency/team';
    case 'kyc':
      return mode === 'espace' ? '/app/agency/kyc' : null;
    default:
      return null;
  }
}

/** La clé du libellé, sous `nav.sidebar.demarrer` : `etapes.<mode>.<code>`, ou `etapes.pieces.<code de pièce>`. */
function cleDe(code: CodeDEtape, mode: ModeDemarrer): string {
  return code.startsWith('piece:') ? `etapes.pieces.${code.slice('piece:'.length)}` : `etapes.${mode}.${code}`;
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
  const connues = etapes
    .filter(connue)
    .map((e) => ({ ...e, href: lienDe(e.code, mode) }))
    .filter((e): e is typeof e & { readonly href: string } => e.href !== null && ouverte(e.href));
  return {
    restantes: connues.filter((e) => !e.faite).map((e) => ({ code: e.code, href: e.href, cle: cleDe(e.code, mode) })),
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

/** TCK-2947 — le code de pièce d'une étape `piece:<code>`, `null` pour toute autre étape. */
export function pieceDeLEtape(code: CodeDEtape): CodeDePiece | null {
  return code.startsWith('piece:') ? (code.slice('piece:'.length) as CodeDePiece) : null;
}
