/**
 * TCK-2475 — « Être alerté quand un bien correspond », depuis la barre de recherche, ouvre la
 * sauvegarde avec la case d'alerte COCHÉE ; partout ailleurs elle reste décochée (TCK-599, C6).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import fr from '@/messages/fr.json';
import { withIntl } from '@/test/intl';
import { SaveSearchDialog } from '../SaveSearchDialog';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/fr/properties',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 }, token: 'jeton', isLoading: false }),
}));

vi.mock('@/lib/queries/saved-searches', () => ({
  useCreateSavedSearchMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

function monter(alerteCochee?: boolean) {
  const client = new QueryClient();
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <SaveSearchDialog
          open
          onOpenChange={vi.fn()}
          filters={{ city: 'Dakar' }}
          criteria={{ city: 'Dakar' }}
          ouverture={1}
          alerteCochee={alerteCochee}
        />
      </QueryClientProvider>,
    ),
  );
}

describe('<SaveSearchDialog alerteCochee> — TCK-2475', () => {
  it('cochée quand le geste demande l’alerte', () => {
    monter(true);
    expect(screen.getByRole('checkbox', { name: new RegExp(fr.search.saveSearch.alsoAlert) })).toBeChecked();
  });

  it('décochée par défaut (TCK-599, C6)', () => {
    monter();
    expect(screen.getByRole('checkbox', { name: new RegExp(fr.search.saveSearch.alsoAlert) })).not.toBeChecked();
  });
});
