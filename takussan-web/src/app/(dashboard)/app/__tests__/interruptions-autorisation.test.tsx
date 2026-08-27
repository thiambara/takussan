import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UserRole } from '@/types/user';

/**
 * TCK-378 — les trois pages qui refusaient par `forbidden()`, éprouvées PAR EXÉCUTION.
 *
 * Pourquoi par exécution, et pas par lecture du source : `scripts/check-auth-interrupts.mjs`
 * lit déjà le texte, et il ne peut prouver qu'une absence. Ce qu'il ne dit pas, c'est ce que la
 * page FAIT du rôle qu'on lui donne — or c'est exactement là qu'était le défaut. TCK-167 a été
 * marqué `done` sur une propriété vraie du texte ; elle est redevenue fausse quatre mois plus
 * tard sans que personne le voie, parce que rien ne la rejouait.
 *
 * Le mock de `redirect` LÈVE, comme le vrai. Un `redirect()` qui rendrait la main laisserait le
 * corps de la page continuer, et un test qui n'attendrait que « ça n'a pas planté » verrait un
 * refus là où il n'y en a pas (c'est la leçon de `src/lib/access/__tests__/server-guards.test.ts`).
 */
const redirect = vi.fn((url: string) => {
  const e = new Error(`NEXT_REDIRECT:${url}`) as Error & { digest?: string };
  e.digest = `NEXT_REDIRECT;replace;${url};307;`;
  throw e;
});

const getMeAction = vi.fn();

/**
 * ⚠ `forbidden` et `unauthorized` sont mockés pour lever l'erreur RÉELLE de Next — celle mesurée
 * le 2026-08-27 sur `node_modules/next/dist/client/components/forbidden.js`, code `E488`.
 *
 * Sans cela, le cas « ne lève jamais E488 » était vert quoi qu'il arrive : le mock ne fournissant
 * pas `forbidden`, la page ancienne mourait sur « forbidden is not a function », qui ne
 * ressemble à E488 par aucun caractère. *Un critère qu'une régression coche aussi n'est pas un
 * critère.*
 */
const E488 = () => {
  const e = new Error(
    '`forbidden()` is experimental and only allowed to be enabled when '
    + '`experimental.authInterrupts` is enabled.',
  ) as Error & { __NEXT_ERROR_CODE?: string };
  e.__NEXT_ERROR_CODE = 'E488';
  throw e;
};

vi.mock('next/navigation', () => ({
  redirect: (u: string) => redirect(u),
  forbidden: E488,
  unauthorized: E488,
}));
vi.mock('@/app/actions/auth', () => ({ getMeAction: () => getMeAction() }));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => Object.assign((k: string) => k, { rich: (k: string) => k }),
}));

// Les enfants montent des arbres entiers (kanban avec glisser-déposer, formulaire client,
// listes paginées). Le refus se décide AVANT eux : des marqueurs suffisent, et leur absence
// dans la sortie est précisément ce qui prouve qu'aucun contenu privé n'a été rendu.
vi.mock('@/components/pipeline/PipelineKanban', () => ({
  PipelineKanban: () => <div data-testid="pipeline-kanban" />,
}));
vi.mock('@/components/customer-form', () => ({
  CustomerForm: () => <div data-testid="customer-form" />,
}));
vi.mock('@/components/leases/TenantOnboardingPendingList', () => ({
  TenantOnboardingPendingList: () => <div data-testid="onboarding-pending-list" />,
}));
vi.mock('@/components/console', () => ({
  PageHeader: () => <div data-testid="page-header" />,
}));
vi.mock('@/components/shared/NoAgencyState', () => ({
  NoAgencyState: () => <div data-testid="no-agency" />,
}));

const utilisateur = (roles: UserRole[]) => ({ id: '1', roles, agency_id: 'ag-1' });

type PageServeur = () => Promise<unknown>;

const PAGES: { chemin: string; nom: string; charger: () => Promise<{ default: PageServeur }> }[] = [
  {
    nom: '/app/customers/new',
    chemin: 'app/customers/new/page.tsx',
    charger: () => import('../customers/new/page'),
  },
  {
    nom: '/app/crm/pipeline',
    chemin: 'app/crm/pipeline/page.tsx',
    charger: () => import('../crm/pipeline/page'),
  },
  {
    nom: '/app/leases/onboarding-pending',
    chemin: 'app/leases/onboarding-pending/page.tsx',
    charger: () => import('../leases/onboarding-pending/page'),
  },
];

/** Les rôles admis, page par page — la table de vérité, écrite une fois. */
const ADMIS: Record<string, UserRole[]> = {
  '/app/customers/new': ['agent', 'owner', 'agency_admin', 'super_admin'],
  '/app/crm/pipeline': ['agent', 'owner', 'agency_admin', 'super_admin'],
  // ⚠ Le bailleur est EXCLU ici, et ce n'est pas un oubli : l'écran de relance d'onboarding est
  // interne à l'agence. TCK-378 interdit explicitement d'élargir en factorisant les deux gardes.
  '/app/leases/onboarding-pending': ['agent', 'agency_admin', 'super_admin'],
};

const TOUS: UserRole[] = ['customer', 'tenant', 'agent', 'agency_admin', 'owner', 'service_provider', 'super_admin'];

beforeEach(() => {
  redirect.mockClear();
  getMeAction.mockReset();
});

describe('TCK-378 — refus par redirection, jamais par interruption', () => {
  for (const page of PAGES) {
    describe(page.nom, () => {
      for (const role of TOUS) {
        const admis = ADMIS[page.nom].includes(role);

        it(`${role} → ${admis ? 'rend la page' : 'est redirigé vers /app'}`, async () => {
          getMeAction.mockResolvedValue(utilisateur([role]));
          const { default: Page } = await page.charger();

          if (admis) {
            await expect(Page()).resolves.toBeTruthy();
            expect(redirect).not.toHaveBeenCalled();
            return;
          }

          // Le refus interrompt le rendu : la promesse REJETTE, et avec le digest de Next —
          // pas avec l'erreur E488 de `forbidden()`, qui produirait la frontière d'erreur.
          await expect(Page()).rejects.toThrow(/NEXT_REDIRECT/);
          expect(redirect).toHaveBeenCalledWith('/app');
        });
      }

      it('interrompt par NEXT_REDIRECT, jamais par E488 — la frontière d’erreur n’est pas atteinte', async () => {
        getMeAction.mockResolvedValue(utilisateur(['customer']));
        const { default: Page } = await page.charger();

        const erreur = await Page().then(() => null, (e: Error & { digest?: string; __NEXT_ERROR_CODE?: string }) => e);
        expect(erreur, `${page.chemin} a rendu son contenu à un customer`).not.toBeNull();
        // Le digest EST le contrat : c'est la seule chose que Next regarde pour distinguer une
        // redirection d'une panne. Une erreur sans digest tombe dans `(dashboard)/error.tsx`.
        expect(erreur!.digest).toMatch(/^NEXT_REDIRECT;/);
        expect(erreur!.__NEXT_ERROR_CODE).toBeUndefined();
        expect(erreur!.message).not.toMatch(/experimental|authInterrupts/);
      });
    });
  }

  it('le super_admin sans agence garde son écran « pas d’agence » sur onboarding-pending', async () => {
    // Cette branche précède la garde de rôle et devait rester intacte : la déplacer aurait
    // redirigé un super-admin légitime.
    getMeAction.mockResolvedValue({ id: '1', roles: ['super_admin'] as UserRole[], agency_id: null });
    const { default: Page } = await import('../leases/onboarding-pending/page');
    await expect(Page()).resolves.toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
  });
});
