import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * TCK-370, défaut n°1 — **le fil entre les deux bouts d'une redirection**.
 *
 * Mesuré le 2026-08-27, avant ce ticket :
 *
 *     $ grep -rn "tags-platform-managed" takussan-web/src/
 *     src/app/(dashboard)/admin/settings/tags/page.tsx:6:  redirect('/admin?notice=tags-platform-managed');
 *
 * Une seule occurrence — celle qui l'ÉCRIT. L'utilisateur cliquait sur « Tags », se retrouvait
 * sur le tableau de bord, et rien à l'écran ne disait qu'il avait été redirigé ni pourquoi.
 *
 * ⚠ **Ce que ce fichier refuse de faire, et c'est le point.** Un test qui vérifierait que
 * `AdminNotice` sait rendre la chaîne `'tags-platform-managed'` serait vert avec un émetteur
 * qui poste `?notice=tags`, `?raison=…`, ou plus rien du tout : il cocherait « le bandeau
 * existe » sans rien dire du fil. Le test ci-dessous part donc du VRAI émetteur — il exécute
 * `/admin/settings/tags`, intercepte l'URL que `redirect()` reçoit, en extrait `notice`, et
 * n'injecte QUE cette valeur-là dans la vraie page `/admin`. Changer un seul des deux côtés le
 * fait rougir.
 */

const redirectMock = vi.fn((url: string) => {
  // `redirect()` de Next ne rend pas : il lève. Sans ça, la page continuerait après l'appel.
  throw new Error(`NEXT_REDIRECT:${url}`);
});

vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}));

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());

vi.mock('@/app/actions/auth', () => ({
  getMeAction: async () => ({
    id: 1,
    first_name: 'Awa',
    last_name: 'Ndiaye',
    full_name: 'Awa Ndiaye',
    roles: ['agency_admin'],
    agency_id: 7,
    avatar_url: null,
  }),
}));

vi.mock('@/lib/access/server-guards', () => ({
  ensureStandardAgencyOrRedirect: async () => undefined,
  resolveAgencyOrNull: async () => null,
}));

// TCK-375 a fait lire la session par cette page (bloc des files d'attente) : sans ce simulacre,
// `cookies()` est appelé hors d'un contexte de requête Next et lève avant que le bandeau soit
// rendu. Le sujet de ce fichier reste le FIL de la redirection, pas la session — d'où un jeton
// constant et une agence résolue à `null`, qui ne changent rien à ce qui est asserté ici.
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));

// Le tableau de bord lui-même n'est pas le sujet : `null` fait rendre l'état dégradé, qui ne
// dépend d'aucune donnée.
vi.mock('@/lib/queries/dashboard-agency', () => ({
  fetchDashboardAgency: async () => null,
}));

vi.mock('@/components/dashboard/admin/AgencyDegradedState', () => ({
  AgencyDegradedState: () => <div data-testid="degraded" />,
}));

async function urlDeRedirectionDesTags(): Promise<string> {
  const { default: PageTags } = await import('../settings/tags/page');
  await expect(PageTags()).rejects.toThrow(/^NEXT_REDIRECT:/);
  return redirectMock.mock.calls.at(-1)![0];
}

describe('/admin/settings/tags → /admin', () => {
  beforeEach(() => {
    redirectMock.mockClear();
  });

  it('redirige vers /admin en emportant un motif', async () => {
    const url = await urlDeRedirectionDesTags();

    expect(url.startsWith('/admin?')).toBe(true);
    expect(new URLSearchParams(url.split('?')[1]).get('notice')).toBeTruthy();
  });

  it("l'écran d'arrivée explique la redirection", async () => {
    const url = await urlDeRedirectionDesTags();
    const notice = new URLSearchParams(url.split('?')[1]).get('notice')!;

    const { default: PageAdmin } = await import('../page');
    render(await PageAdmin({ searchParams: Promise.resolve({ notice }) }));

    const bandeau = screen.getByRole('status');
    expect(bandeau).toHaveTextContent('Les tags sont gérés par la plateforme');
    // Le libellé vient du dictionnaire : si la clé manquait, `mockTraductionsServeur` rendrait le
    // CHEMIN de la clé, et cette assertion-ci rougirait au lieu de passer sur une chaîne vide.
    expect(bandeau).toHaveTextContent(/référentiel des tags est maintenu par Takussan/);
  });

  it("ne peint rien pour un motif inconnu venu de la barre d'adresse", async () => {
    const { default: PageAdmin } = await import('../page');
    render(await PageAdmin({ searchParams: Promise.resolve({ notice: 'nimporte-quoi' }) }));

    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByTestId('admin-notice')).toBeNull();
  });

  it('ne peint rien quand aucun motif ne voyage', async () => {
    const { default: PageAdmin } = await import('../page');
    render(await PageAdmin({ searchParams: Promise.resolve({}) }));

    expect(screen.queryByTestId('admin-notice')).toBeNull();
  });
});
