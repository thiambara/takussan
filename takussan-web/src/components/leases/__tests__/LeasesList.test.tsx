import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LeasesList } from '@/components/leases/LeasesList';
import fr from '@/messages/fr.json';

const useLeases = vi.fn();
const useLeasePropertyOptions = vi.fn();

vi.mock('@/lib/queries/leases', () => ({
  useLeases: (...args: unknown[]) => useLeases(...args),
  useLeasePropertyOptions: (...args: unknown[]) => useLeasePropertyOptions(...args),
}));

/**
 * On monte un VRAI `NextIntlClientProvider` sur le dictionnaire `fr` plutôt que de mocker
 * `useTranslations`. Un mock rendrait la clé et laisserait passer un chemin faux : ces tests
 * échouent si `lease.list.*` n'existe pas, ce qui est précisément le risque de la migration i18n.
 */
function renderList() {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <NextIntlClientProvider locale="fr" messages={fr} timeZone="Africa/Dakar">
      {children}
    </NextIntlClientProvider>
  );
  return render(<LeasesList />, { wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  useLeasePropertyOptions.mockReturnValue({ data: { data: [] } });
});

describe('LeasesList — états vides et d’erreur', () => {
  it('affiche l’état vide « premier bail » avec son CTA quand aucun filtre n’est posé', () => {
    useLeases.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false, refetch: vi.fn() });

    renderList();

    expect(
      screen.getByRole('heading', { level: 2, name: fr.lease.list.empty_title }),
    ).toBeInTheDocument();
    expect(screen.getByText(fr.lease.list.empty_description)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: fr.lease.list.empty_cta })).toHaveAttribute(
      'href',
      '/app/leases/new',
    );
  });

  it('rend l’erreur via ErrorState et rebranche refetch sur le bouton de reprise', async () => {
    const refetch = vi.fn();
    useLeases.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });

    renderList();

    expect(screen.getByRole('alert')).toHaveTextContent(fr.lease.list.error);
    await userEvent.click(screen.getByRole('button', { name: fr.common.actions.retry }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
