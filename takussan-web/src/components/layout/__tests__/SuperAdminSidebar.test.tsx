import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import {
  fetchAdminAgencyUpgradePendingCount,
  fetchAdminKycQueue,
  fetchFailedJobs,
  fetchModerationQueue,
} from '@/lib/queries/super-admin';
import { SuperAdminSidebar } from '../SuperAdminSidebar';
import { withIntl } from '@/test/intl';

vi.mock('next/navigation', () => ({ usePathname: () => '/super-admin' }));

vi.mock('@/lib/queries/super-admin', () => ({
  fetchAdminAgencyUpgradePendingCount: vi.fn(),
  fetchAdminKycQueue: vi.fn(),
  fetchFailedJobs: vi.fn(),
  fetchModerationQueue: vi.fn(),
}));

const paginated = (total: number) => ({ data: [], meta: { total, current_page: 1, last_page: 1, per_page: 1 } });

function renderSidebar(node: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>));
}

describe('SuperAdminSidebar — badges de file (TCK-360)', () => {
  beforeEach(() => {
    // Les compteurs d'appels s'accumulent d'un test à l'autre : `mockResolvedValue` ne les remet
    // pas à zéro, et une assertion `toHaveBeenCalledTimes` compterait le test précédent.
    vi.clearAllMocks();
    vi.mocked(fetchAdminKycQueue).mockResolvedValue(paginated(5) as never);
    vi.mocked(fetchModerationQueue).mockResolvedValue(paginated(9) as never);
    vi.mocked(fetchFailedJobs).mockResolvedValue(paginated(0) as never);
    vi.mocked(fetchAdminAgencyUpgradePendingCount).mockResolvedValue(2);
  });

  it('porte un compte sur KYC et sur Modération, pas seulement sur les demandes d’upgrade (AC3)', async () => {
    renderSidebar(<SuperAdminSidebar />);

    // TCK-268 avait écrit `badgeKey` générique et l'avait laissé avec un seul cas.
    expect(await screen.findByLabelText('5 en attente')).toBeInTheDocument();
    expect(await screen.findByLabelText('9 en attente')).toBeInTheDocument();
    expect(await screen.findByLabelText('2 en attente')).toBeInTheDocument();

    expect(fetchAdminKycQueue).toHaveBeenCalledWith({ perPage: 1 });
    expect(fetchModerationQueue).toHaveBeenCalledWith({ perPage: 1 });
  });

  /**
   * TCK-365 / D7 — AC1 : « la console des jobs échoués est atteignable depuis la barre latérale ».
   *
   * ⚠ Cet AC n'était gardé par AUCUN test. Ablation mesurée par la revue : la ligne
   * `{ href: '/super-admin/system/jobs', … }` retirée de `NAV_GROUPS`, `npx vitest run
   * src/components/layout` restait VERT — 15/15, deux passes. L'AC phare du ticket se défaisait
   * par la suppression d'une ligne, en silence.
   *
   * Le test exige deux choses, et la seconde compte autant que la première : un lien vers la
   * bonne destination, et un LIBELLÉ. `withIntl` monte le vrai `fr.json` — un `labelKey` mal
   * orthographié rendrait la clé brute (`nav.superAdmin.items.…`) sans rien casser, exactement
   * comme en production.
   */
  it('mène aux jobs échoués sans qu’il faille déplier quoi que ce soit (AC1, TCK-365)', async () => {
    renderSidebar(<SuperAdminSidebar />);

    const lien = screen
      .getAllByRole('link')
      .find((a) => a.getAttribute('href') === '/super-admin/system/jobs');

    expect(lien, 'aucun lien vers /super-admin/system/jobs dans la barre latérale').toBeDefined();
    expect(lien).toHaveTextContent('Jobs échoués');
    expect(lien?.textContent ?? '').not.toMatch(/nav\.|superAdmin\./);
  });

  it('ne demande aucun compte pour les entrées de menu qui ne sont pas des files', async () => {
    renderSidebar(<SuperAdminSidebar />);

    await screen.findByLabelText('5 en attente');
    // Une entrée sans `badgeKey` monte le même hook : c'est `enabled` qui doit la retenir, sinon
    // vingt-quatre entrées de menu déclencheraient vingt-quatre requêtes.
    expect(fetchAdminKycQueue).toHaveBeenCalledTimes(1);
    expect(fetchAdminAgencyUpgradePendingCount).toHaveBeenCalledTimes(1);
  });
});
