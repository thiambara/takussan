/**
 * TCK-2481 (ADR-0089 §5) — les compteurs du menu, sortis d'`AppSidebar` pour être lus aussi par la
 * barre d'onglets mobile : UNE règle de sondage, armée par les entrées rendues et non cadenassées
 * (TCK-377), et éteinte d'un drapeau (`actif`) là où la barre ne se voit pas.
 */
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCompteursDuMenu } from '../useCompteursDuMenu';

const appels = vi.hoisted(() => ({
  messages: [] as { enabled?: boolean }[],
  visites: [] as { enabled?: boolean }[],
  demandes: [] as { enabled?: boolean }[],
  avis: 0,
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton' }) }));
vi.mock('@/components/chat-widget/useUnreadCount', () => ({
  useUnreadCount: (o: { enabled?: boolean }) => {
    appels.messages.push(o);
    return o.enabled ? 3 : 0;
  },
}));
vi.mock('@/lib/queries/visits', () => ({
  usePendingVisitsCount: (o: { enabled?: boolean }) => {
    appels.visites.push(o);
    return { data: { meta: { total: 2 } } };
  },
}));
vi.mock('@/lib/queries/contact-leads', () => ({
  useUnhandledLeadsCount: (o: { enabled?: boolean }) => {
    appels.demandes.push(o);
    // TCK-2479 — une relecture ratée garde l'ancien `data` : le compteur vaut 0 quand même.
    return { data: { meta: { total: 5 } }, isError: true };
  },
}));
vi.mock('@/lib/queries/reviews-moderation', () => ({
  fetchModerationQueue: () => {
    appels.avis += 1;
    return Promise.resolve({ meta: { total: 4 } });
  },
}));

const ENTREES = [
  { counterKey: 'unreadMessages' as const },
  { counterKey: 'pendingVisits' as const },
  { counterKey: 'unhandledLeads' as const, locked: true },
];

function enveloppe({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  appels.messages.length = 0;
  appels.visites.length = 0;
  appels.demandes.length = 0;
  appels.avis = 0;
  vi.stubGlobal('fetch', vi.fn());
});

describe('TCK-2481 — useCompteursDuMenu, la règle de sondage du menu partagée avec la barre d’onglets', () => {
  it('ne sonde que les compteurs des entrées rendues et non cadenassées (TCK-377)', () => {
    const { result } = renderHook(() => useCompteursDuMenu(ENTREES), { wrapper: enveloppe });
    expect(appels.messages.at(-1)).toEqual({ enabled: true });
    expect(appels.visites.at(-1)).toEqual({ enabled: true });
    expect(appels.demandes.at(-1)).toEqual({ enabled: false });
    expect(result.current.unreadMessages).toBe(3);
    expect(result.current.pendingVisits).toBe(2);
  });

  it('`actif: false` (la barre d’onglets, masquée dès md) : aucun sondage', () => {
    renderHook(() => useCompteursDuMenu(ENTREES, { actif: false }), { wrapper: enveloppe });
    expect(appels.messages.at(-1)).toEqual({ enabled: false });
    expect(appels.visites.at(-1)).toEqual({ enabled: false });
    expect(appels.demandes.at(-1)).toEqual({ enabled: false });
  });

  it('une file de modération n’est lue que si une entrée la porte', async () => {
    renderHook(() => useCompteursDuMenu(ENTREES), { wrapper: enveloppe });
    expect(appels.avis).toBe(0);

    const { result } = renderHook(() => useCompteursDuMenu([{ counterKey: 'reviewModeration' }]), {
      wrapper: enveloppe,
    });
    await waitFor(() => expect(result.current.reviewModeration).toBe(4));
    expect(appels.avis).toBe(1);
  });

  it('une entrée dont le compteur est en erreur vaut 0, même avec un `data` gardé (TCK-2479)', () => {
    const { result } = renderHook(() => useCompteursDuMenu([{ counterKey: 'unhandledLeads' }]), {
      wrapper: enveloppe,
    });
    expect(appels.demandes.at(-1)).toEqual({ enabled: true });
    expect(result.current.unhandledLeads).toBe(0);
  });
});
