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

/** AC5 — une étape faite SORT du groupe ; la progression dit combien l'étaient. */
export function etapesARendre(
  etapes: readonly EtapeDeDemarrage[],
  mode: ModeDemarrer,
  idProfilActif: string | null,
): { readonly restantes: readonly EtapeARendre[]; readonly faites: number; readonly total: number } {
  const connues = etapes.filter(connue);
  return {
    restantes: connues
      .filter((e) => !e.faite)
      .map((e) => ({ code: e.code, href: lienDe(e.code, mode, idProfilActif), cle: `etapes.${mode}.${e.code}` })),
    faites: connues.filter((e) => e.faite).length,
    total: connues.length,
  };
}
