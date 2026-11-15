/**
 * TCK-2503 — posé sur la photo de la fiche, à côté du retour et du partage, le cœur prend la même
 * pastille pleine qu'eux (`bg-card`) ; partout ailleurs, il garde le voile des cartes de liste.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ToastProvider } from '@/components/ui/toast';
import { withIntl } from '@/test/intl';
import { FavoriteButton } from '../FavoriteButton';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/fr/properties/bien',
  useSearchParams: () => new URLSearchParams(''),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null, token: null, isLoading: false }) }));

function monte(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <ToastProvider>{ui}</ToastProvider>
      </QueryClientProvider>,
    ),
  );
}

describe('<FavoriteButton surPhoto>', () => {
  it('sur la photo : pastille pleine, sans le voile', () => {
    monte(<FavoriteButton propertyId={7} surPhoto />);
    const classes = screen.getByRole('button', { name: 'Ajouter aux favoris' }).className.split(/\s+/);
    expect(classes).toContain('bg-card');
    expect(classes).toContain('text-foreground');
    expect(classes).not.toContain('bg-scrim/50');
  });

  it('par défaut : le voile des cartes, inchangé', () => {
    monte(<FavoriteButton propertyId={7} />);
    const classes = screen.getByRole('button', { name: 'Ajouter aux favoris' }).className.split(/\s+/);
    expect(classes).toContain('bg-scrim/50');
    expect(classes).not.toContain('text-foreground');
  });
});
