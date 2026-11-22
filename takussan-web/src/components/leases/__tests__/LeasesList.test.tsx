import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LeasesList } from '@/components/leases/LeasesList';
import fr from '@/messages/fr.json';

const useBauxDeLAgence = vi.fn();
const useBauxDuLecteur = vi.fn();
const useResumeDesBaux = vi.fn();

// TCK-1513 — la liste lit `?status=` ; ici, aucune URL.
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/app/leases',
}));
vi.mock('@/hooks/useApiQuery', () => ({ useApiQuery: () => ({ data: undefined, isFetching: false }), useApiMutation: vi.fn() }));
vi.mock('@/lib/queries/leases-file', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/leases-file')>()),
  useBauxDeLAgence: (...args: unknown[]) => useBauxDeLAgence(...args),
  useBauxDuLecteur: (...args: unknown[]) => useBauxDuLecteur(...args),
  useResumeDesBaux: (...args: unknown[]) => useResumeDesBaux(...args),
  useListesDEntree: () => ({ data: undefined }),
}));

/**
 * On monte un VRAI `NextIntlClientProvider` sur le dictionnaire `fr` plutôt que de mocker
 * `useTranslations`. Un mock rendrait la clé et laisserait passer un chemin faux : ces tests
 * échouent si `lease.list.*` ou `lease.liste.*` n'existe pas.
 */
function renderList(ui: ReactNode) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <NextIntlClientProvider locale="fr" messages={fr} timeZone="Africa/Dakar">
      {children}
    </NextIntlClientProvider>
  );
  return render(<>{ui}</>, { wrapper });
}

const VIDE = { active: 0, ended: 0, draft: 0, a_traiter: 0, onboarding_pending: 0, motifs: {} };

beforeEach(() => {
  vi.clearAllMocks();
  useResumeDesBaux.mockReturnValue({ data: { data: VIDE } });
});

describe('LeasesList — états vides et d’erreur (rien ne se perd, TCK-2644)', () => {
  it('agence sans aucun bail : l’état « premier bail » et son « Nouveau bail »', () => {
    useBauxDeLAgence.mockReturnValue({ data: { data: [] }, isPending: false, isError: false, refetch: vi.fn() });
    renderList(<LeasesList vue="agence" peutCreer agencyId={1} />);

    expect(screen.getAllByRole('heading', { level: 2, name: fr.lease.list.empty_title }).length).toBeGreaterThan(0);
    expect(screen.getAllByText(fr.lease.list.empty_description).length).toBeGreaterThan(0);
    for (const lien of screen.getAllByRole('link', { name: fr.lease.list.empty_cta })) expect(lien).toHaveAttribute('href', '/app/leases/new');
  });

  it('agence : l’erreur via ErrorState rebranche refetch sur « Réessayer »', async () => {
    const refetch = vi.fn();
    useBauxDeLAgence.mockReturnValue({ data: undefined, isPending: false, isError: true, refetch });
    renderList(<LeasesList vue="agence" peutCreer={false} agencyId={1} />);

    expect(screen.getAllByRole('alert')[0]).toHaveTextContent(fr.lease.liste.erreur);
    await userEvent.click(screen.getAllByRole('button', { name: fr.common.actions.retry })[0]);
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('bailleur sans bail : l’état « premier bail » avec son CTA', () => {
    useBauxDuLecteur.mockReturnValue({ data: { data: [] }, isPending: false, isError: false, refetch: vi.fn() });
    renderList(<LeasesList vue="bailleur" peutCreer />);
    expect(screen.getByRole('heading', { level: 2, name: fr.lease.list.empty_title })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: fr.lease.list.empty_cta })).toHaveAttribute('href', '/app/leases/new');
  });

  it('bailleur : l’erreur et « Réessayer »', async () => {
    const refetch = vi.fn();
    useBauxDuLecteur.mockReturnValue({ data: undefined, isPending: false, isError: true, refetch });
    renderList(<LeasesList vue="bailleur" peutCreer />);
    expect(screen.getByRole('alert')).toHaveTextContent(fr.lease.liste.erreur);
    await userEvent.click(screen.getByRole('button', { name: fr.common.actions.retry }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
