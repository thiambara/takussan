/**
 * TCK-2816 — sous impersonation, un rafraîchissement dont `/me` dépasse sa borne ne vide plus le
 * compte.
 *
 * Sous impersonation, `AuthProvider` n'a JAMAIS de jeton (TCK-600, ADR-0055 §6) : la règle de
 * TCK-2158 (« un `null` sans jeton dit une session fermée ») y vidait le compte de la cible au
 * premier `router.refresh()` dont `/me` dépassait `DELAI_ME_RACINE_MS`. Le layout racine dit
 * désormais l'impersonation par un booléen lu au serveur ; `AuthProvider` le traite comme un jeton
 * présent pour la seule règle de vidage. Un changement du signal, lui, n'hérite d'aucun compte :
 * l'entrée comme la sortie d'impersonation vident le compte quand `/me` manque.
 */
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { User } from '@/lib/auth';
import { withIntl } from '@/test/intl';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/app/messages',
  useSearchParams: () => new URLSearchParams(),
}));

const { AuthProvider, useAuth } = await import('@/context/AuthContext');
const { EtatVideDeLaMessagerie } = await import('@/components/messages/EtatVideDeLaMessagerie');

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    async () =>
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

const agent = { id: 7, first_name: 'Moussa', roles: ['agent'], two_factor_enabled: false } as unknown as User;
const autreAgent = { id: 8, first_name: 'Fatou', roles: ['agent'], two_factor_enabled: false } as unknown as User;
const operateur = { id: 1, first_name: 'Admin', roles: ['admin'], two_factor_enabled: false } as unknown as User;

function Lecteur() {
  const { user, token } = useAuth();
  return (
    <p data-testid="compte">
      {user ? `${user.id}|${user.first_name}` : 'aucun'}#{token ?? 'sans-jeton'}
    </p>
  );
}

function arbre(initialUser: User | null, initialToken: string | null, impersonation?: boolean): ReactNode {
  return withIntl(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AuthProvider initialUser={initialUser} initialToken={initialToken} impersonation={impersonation}>
        <Lecteur />
        <EtatVideDeLaMessagerie onNouvelle={() => {}} />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

const compte = () => screen.getByTestId('compte').textContent;
const etatDuPersonnel = () => screen.queryByRole('button', { name: 'Écrire à un client' });
const etatDuVisiteur = () => screen.queryByRole('link', { name: 'Parcourir les annonces' });

describe('AuthProvider sous impersonation (TCK-2816)', () => {
  it('AC1 — `/me` au-delà de sa borne sous impersonation : la cible reste, l’état vide du personnel', () => {
    const { rerender } = render(arbre(agent, null, true));
    expect(etatDuPersonnel()).toBeInTheDocument();

    rerender(arbre(null, null, true));
    expect(compte()).toBe('7|Moussa#sans-jeton');
    expect(etatDuPersonnel()).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Aucune conversation' })).toBeInTheDocument();
    expect(etatDuVisiteur()).not.toBeInTheDocument();
  });

  it('AC2 — hors impersonation et sans jeton : le compte est vidé, l’état vide du visiteur (TCK-2158)', () => {
    const { rerender } = render(arbre(agent, null));
    expect(etatDuPersonnel()).toBeInTheDocument();

    rerender(arbre(null, null));
    expect(compte()).toBe('aucun#sans-jeton');
    expect(etatDuVisiteur()).toBeInTheDocument();
    expect(etatDuPersonnel()).not.toBeInTheDocument();
  });

  it('AC2 bis — signal explicitement faux : même règle que sans signal', () => {
    const { rerender } = render(arbre(agent, null, false));
    rerender(arbre(null, null, false));
    expect(compte()).toBe('aucun#sans-jeton');
  });

  it('AC3 — sous impersonation, un autre utilisateur non nul se pose', () => {
    const { rerender } = render(arbre(agent, null, true));

    rerender(arbre(autreAgent, null, true));
    expect(compte()).toBe('8|Fatou#sans-jeton');
  });

  it('AC4 — le signal passe de vrai à faux sans jeton, après un compte gardé : le compte est vidé', () => {
    const { rerender } = render(arbre(agent, null, true));
    rerender(arbre(null, null, true));
    expect(compte()).toBe('7|Moussa#sans-jeton');

    rerender(arbre(null, null, false));
    expect(compte()).toBe('aucun#sans-jeton');
    expect(etatDuVisiteur()).toBeInTheDocument();
  });

  it('sortie d’impersonation avec le jeton de l’opérateur revenu mais `/me` en retard : la cible ne passe pas sous ce jeton', () => {
    const { rerender } = render(arbre(agent, null, true));

    rerender(arbre(null, 'jeton-operateur', false));
    expect(compte()).toBe('aucun#jeton-operateur');
  });

  it('entrée en impersonation avec `/me` en retard : le compte de l’opérateur ne passe pas sous la cible', () => {
    const { rerender } = render(arbre(operateur, 'jeton-operateur', false));

    rerender(arbre(null, null, true));
    expect(compte()).toBe('aucun#sans-jeton');
  });

  it('hors impersonation, un `null` sous un jeton présent garde le compte (TCK-2158 inchangé)', () => {
    const { rerender } = render(arbre(operateur, 'jeton-operateur', false));

    rerender(arbre(null, 'jeton-operateur', false));
    expect(compte()).toBe('1|Admin#jeton-operateur');
  });
});
