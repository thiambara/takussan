import { describe, expect, it, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { User, UserRole } from '@/types/user';

/**
 * TCK-379 — AC5 : desservir une page ne l'ouvre à personne.
 *
 * Ce ticket a posé trois chemins de navigation vers des écrans qui n'en avaient aucun. Un chemin
 * n'autorise rien : ce test éprouve que le garde SERVEUR de `/app/crm/pipeline` refuse toujours
 * les rôles qu'il refusait, MALGRÉ le nouveau lien depuis `/app/customers`.
 *
 * ⚠ Ce que ce fichier NE prétend PAS. Sur les deux autres écrans nouvellement desservis —
 * `/app/account/privacy` et `/app/inventories/new` — il n'y a AUCUN garde de rôle à vérifier, et
 * c'est délibéré : la portabilité RGPD est un droit de tout compte, et le formulaire d'état des
 * lieux dérive ses droits du bail côté API. Leur seule garde est l'authentification, portée par
 * le layout du groupe `(dashboard)`. Écrire ici « un rôle non autorisé est refusé » pour ces
 * deux-là aurait produit un test vert qui n'affirme rien — le dernier test du fichier vérifie
 * donc ce qui est réellement vrai : qu'ils vivent bien sous ce layout.
 */

class InterruptionSimulee extends Error {
  constructor(readonly genre: 'forbidden' | 'redirect', readonly cible?: string) {
    super(genre);
  }
}

vi.mock('next/navigation', () => ({
  forbidden: () => {
    throw new InterruptionSimulee('forbidden');
  },
  redirect: (cible: string) => {
    throw new InterruptionSimulee('redirect', cible);
  },
}));

const me = vi.hoisted(() => ({ user: null as User | null }));
vi.mock('@/app/actions/auth', () => ({ getMeAction: async () => me.user }));
vi.mock('@/components/pipeline/PipelineKanban', () => ({
  PipelineKanban: () => null,
}));
// `getTranslations` est une API serveur ; sous jsdom, next-intl la refuse. On ne teste pas les
// libellés ici — seulement QUI passe le garde, qui s'exécute AVANT cette ligne.
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (cle: string) => cle,
}));

async function ouvrePipeline(roles: UserRole[]): Promise<'rendu' | 'forbidden'> {
  me.user = { id: 1, roles } as unknown as User;
  const { default: Page } = await import('../page');
  try {
    await Page();
    return 'rendu';
  } catch (e) {
    if (e instanceof InterruptionSimulee && e.genre === 'forbidden') return 'forbidden';
    throw e;
  }
}

describe('/app/crm/pipeline — le lien n’élargit aucun accès (TCK-379)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  for (const role of ['customer', 'tenant', 'service_provider'] as UserRole[]) {
    it(`refuse toujours un ${role}`, async () => {
      expect(await ouvrePipeline([role])).toBe('forbidden');
    });
  }

  for (const role of ['agent', 'owner', 'agency_admin', 'super_admin'] as UserRole[]) {
    it(`laisse toujours entrer un ${role}`, async () => {
      // Le pendant : un garde qui refuserait TOUT LE MONDE cocherait les trois tests ci-dessus.
      expect(await ouvrePipeline([role])).toBe('rendu');
    });
  }

  it('le lien posé sur /app/customers ne dessert que des rôles déjà autorisés', () => {
    // `customers/page.tsx` appelle `assertCanReachAgentArea` (agent | owner | admin), qui est
    // exactement l'allowlist ci-dessus. Si l'un des deux bougeait sans l'autre, le lien
    // deviendrait une invitation vers un 403 — la forme de défaut que ce lot corrige ailleurs.
    const src = (p: string) => fs.readFileSync(path.resolve(__dirname, p), 'utf8');
    expect(src('../../../customers/page.tsx')).toContain('assertCanReachAgentArea');
    expect(src('../../../customers/page.tsx')).toContain('/app/crm/pipeline');
    const guards = src('../../../../../../lib/auth/guards.ts');
    expect(guards).toContain('isAgent(roles) || isOwner(roles) || isAdmin(roles)');
    expect(src('../page.tsx')).toContain('isAgent(me.roles) || isOwner(me.roles) || isAdmin(me.roles)');
  });

  it('les trois écrans nouvellement desservis restent sous le layout authentifié', () => {
    // Leur garde commune est l'authentification du groupe `(dashboard)`, pas un rôle.
    const groupe = path.resolve(__dirname, '../../../../layout.tsx');
    expect(fs.readFileSync(groupe, 'utf8')).toContain('getMeAction');
    for (const page of [
      '../../../account/privacy/page.tsx',
      '../../../inventories/new/page.tsx',
      '../page.tsx',
    ]) {
      expect(fs.existsSync(path.resolve(__dirname, page)), page).toBe(true);
    }
  });
});
