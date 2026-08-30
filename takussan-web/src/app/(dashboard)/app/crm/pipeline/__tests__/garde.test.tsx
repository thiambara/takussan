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

/**
 * Rend `'refuse'` quel que soit le MÉCANISME du refus, et c'est délibéré.
 *
 * ⚠ Ce helper rendait `'forbidden'` et n'acceptait que `forbidden()`. TCK-378, implémenté en
 * parallèle de celui-ci, a fait passer les gardes de `forbidden()` à `redirect('/app')` — avec
 * sa raison propre : `forbidden()` était DÉSARMÉ sur ces pages, il ne refusait rien. Le test
 * s'est donc mis à rougir à la fusion, sur un correctif qui allait dans son sens.
 *
 * Ce que ce fichier garde est « le lien n'élargit AUCUN accès », pas « le refus s'écrit ainsi ».
 * Il accepte donc les deux formes, et **la cible de la redirection est vérifiée** — sans quoi
 * une redirection vers la page elle-même cocherait « refusé » aussi bien qu'un vrai refus.
 */
async function ouvrePipeline(roles: UserRole[]): Promise<'rendu' | 'refuse'> {
  me.user = { id: 1, roles } as unknown as User;
  // TCK-426 — ON MONTE LE LAYOUT, PAS SEULEMENT LA PAGE, et c'est le fond du changement.
  //
  // La garde a quitté `page.tsx` pour `layout.tsx`, parce que `crm/pipeline/loading.tsx` ouvre
  // une frontière de suspension entre les deux : un `redirect()` écrit dans la page rendait 200
  // + le squelette du kanban au lieu du 307, alors qu'un `redirect()` de layout rend bien 307
  // (mesuré sur le Next 16.3.1 du dépôt). Ce helper monte donc le layout D'ABORD — c'est lui qui
  // décide — puis la page, pour vérifier qu'un rôle admis obtient réellement l'écran.
  //
  // *Un test qui ne monte que la page ne peut plus voir le refus : il n'y est plus.*
  const { default: Layout } = await import('../layout');
  const { default: Page } = await import('../page');
  try {
    await Layout({ children: await Page() });
    return 'rendu';
  } catch (e) {
    if (e instanceof InterruptionSimulee && e.genre === 'forbidden') return 'refuse';
    if (e instanceof InterruptionSimulee && e.genre === 'redirect') {
      expect(e.cible).toBe('/app');
      return 'refuse';
    }
    throw e;
  }
}

describe('/app/crm/pipeline — le lien n’élargit aucun accès (TCK-379)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  for (const role of ['customer', 'tenant', 'service_provider'] as UserRole[]) {
    it(`refuse toujours un ${role}`, async () => {
      expect(await ouvrePipeline([role])).toBe('refuse');
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
    expect(src('../../../customers/layout.tsx')).toContain('assertCanReachAgentArea');
    expect(src('../../../customers/(liste)/page.tsx')).toContain('/app/crm/pipeline');
    const guards = src('../../../../../../lib/auth/guards.ts');
    expect(guards).toContain('isAgent(roles) || isOwner(roles) || isAdmin(roles)');
    // ⚠ Cette ligne exigeait que la page RECOPIE l'expression de rôles en ligne
    // (`isAgent(me.roles) || …`). TCK-378, implémenté en parallèle, l'a remplacée par un appel
    // à `assertCanReachAgentArea` — la MÊME fonction que `customers/page.tsx`. C'est
    // strictement plus fort que ce que le test demandait : deux expressions identiques
    // peuvent diverger, un appel partagé ne le peut pas. L'assertion suit le correctif.
    //
    // ⚠⚠ TCK-426 : les DEUX gardes ont remonté d'un cran ensemble, dans le `layout.tsx` de leur
    // segment. C'est là qu'il faut les chercher — sous le `loading.tsx`, elles rendaient 200 au
    // lieu du 307. La ligne qui les cherchait dans les pages était donc devenue fausse ; elle
    // suit à nouveau le correctif.
    expect(src('../layout.tsx')).toContain('assertCanReachAgentArea');
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
