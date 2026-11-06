/**
 * TCK-2479 (ADR-0089 §5) — le groupe « Démarrer » d'un espace neuf : ce que le menu fait des étapes
 * que rend `GET /api/me/espace/demarrage` (`EspaceDemarrageController`).
 *
 * L'API dit QUELLES étapes et si elles sont faites ; le front, OÙ chacune se fait et comment elle se
 * dit (principe 5 du `CLAUDE.md` racine). Un code que ce fichier ne connaît pas n'est ni rendu ni
 * compté : le groupe ne montre jamais un lien sans destination.
 */
export type ModeDemarrer = 'espace' | 'bailleur';

export const CODES_D_ETAPE = ['premier_bien', 'kyc', 'equipe'] as const;
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

/** `owner:3` → 3 ; tout autre jeton → `null`. */
function profilBailleur(idProfilActif: string | null): number | null {
  const [type, id] = (idProfilActif ?? '').split(':');
  return type === 'owner' && id !== undefined && /^\d+$/.test(id) ? Number(id) : null;
}

/**
 * L'écran qui fait chaque étape. Le KYC du bailleur est son assistant d'onboarding, repris sur SON
 * profil (`?owner=`, `profilAReprendre`, TCK-589) : sans lui, l'assistant prendrait le premier
 * profil « à compléter », et un profil déjà actif renverrait vers `/app`.
 */
function lienDe(code: CodeDEtape, mode: ModeDemarrer, idProfilActif: string | null): string {
  switch (code) {
    case 'premier_bien':
      return '/app/properties/new';
    case 'equipe':
      return '/app/agency/team';
    case 'kyc': {
      if (mode === 'espace') return '/app/agency/kyc';
      const id = profilBailleur(idProfilActif);
      return id === null ? '/onboarding/owner' : `/onboarding/owner?owner=${id}`;
    }
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
  idProfilActif: string | null,
  ouverte: (href: string) => boolean = () => true,
): { readonly restantes: readonly EtapeARendre[]; readonly faites: number; readonly total: number } {
  const connues = etapes.filter(connue).filter((e) => ouverte(lienDe(e.code, mode, idProfilActif)));
  return {
    restantes: connues
      .filter((e) => !e.faite)
      .map((e) => ({ code: e.code, href: lienDe(e.code, mode, idProfilActif), cle: `etapes.${mode}.${e.code}` })),
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
