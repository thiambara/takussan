/**
 * TCK-2632 — la liste de la messagerie se filtre CÔTÉ SERVEUR (TCK-2630), jamais sur la page chargée :
 * la recherche, « Non lus » et « Groupes » partent en `filter[…]`, et chaque filtre a sa propre clé de
 * requête, sous `['conversations', 'list']` (que visent l'invalidation et la pastille).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { buildQueryString } from '@/lib/api';
import { conversationListParams, filtresCanoniques } from '../conversations-list';
import {
  filDirectAvec,
  useConversationContext,
  useConversationsInfinite,
  useSendAttachment,
  useTrouverLeFilDirect,
  type FiltresDeLaListe,
} from '../conversations';
import type { Conversation } from '@/types/message';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ token: 'jeton', user: { id: 1 } }),
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'fr',
}));

function espionFetch() {
  const espion = vi.fn(async (..._args: Parameters<typeof fetch>): Promise<unknown> => ({
    ok: true,
    status: 200,
    json: async () => ({ data: [], meta: { current_page: 1, last_page: 1, counts: { all: 3, unread: 1, group: 1 } } }),
    text: async () => '{}',
  }));
  vi.stubGlobal('fetch', espion);
  return espion;
}

const parametres = (url: unknown) => new URL(String(url), 'http://x').searchParams;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('conversationListParams — les filtres de la liste (TCK-2632)', () => {
  it('sans filtre, aucun `filter[…]` ne part', () => {
    const qs = buildQueryString(conversationListParams(1, 30));
    expect([...new URLSearchParams(qs).keys()].filter((k) => k.startsWith('filter['))).toEqual([]);
  });

  it('la recherche, les non-lus et le type partent tels que l’API les lit', () => {
    const qs = new URLSearchParams(
      buildQueryString(conversationListParams(2, 30, { recherche: '  thiès ', nonLus: true, type: 'group' })),
    );
    expect(qs.get('filter[search]')).toBe('thiès');
    expect(qs.get('filter[unread]')).toBe('1');
    expect(qs.get('filter[type]')).toBe('group');
    expect(qs.get('page')).toBe('2');
  });

  it('une saisie vide n’est pas un filtre', () => {
    expect(filtresCanoniques({ recherche: '   ', nonLus: false })).toEqual({});
    expect(new URLSearchParams(buildQueryString(conversationListParams(1, 30, { participant: 12 }))).get('filter[participant]')).toBe('12');
  });
});

describe('useConversationsInfinite — une clé par filtre (TCK-2632)', () => {
  function monter(filtres: FiltresDeLaListe) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const rendu = renderHook((p: { filtres: FiltresDeLaListe }) => useConversationsInfinite({ filtres: p.filtres, refetchInterval: false }), {
      wrapper,
      initialProps: { filtres },
    });
    return { ...rendu, client };
  }

  it('la puce « Groupes » envoie `filter[type]=group`, et la recherche `filter[search]`', async () => {
    const espion = espionFetch();
    const { rerender } = monter({});
    await waitFor(() => expect(espion).toHaveBeenCalledTimes(1));
    expect(parametres(espion.mock.calls[0]![0]).get('filter[type]')).toBeNull();

    rerender({ filtres: { type: 'group' } });
    await waitFor(() => expect(espion).toHaveBeenCalledTimes(2));
    expect(parametres(espion.mock.calls[1]![0]).get('filter[type]')).toBe('group');

    rerender({ filtres: { type: 'group', recherche: 'thiès' } });
    await waitFor(() => expect(espion).toHaveBeenCalledTimes(3));
    expect(parametres(espion.mock.calls[2]![0]).get('filter[search]')).toBe('thiès');
  });

  it('la clé reste sous `[conversations, list]` : marquer un fil lu l’invalide', async () => {
    espionFetch();
    const { result, client } = monter({ nonLus: true });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const cles = client.getQueryCache().getAll().map((q) => q.queryKey);
    expect(cles).toContainEqual(['conversations', 'list', 'infinite', { nonLus: true }]);
    expect(result.current.data?.pages[0]?.meta.counts).toEqual({ all: 3, unread: 1, group: 1 });
  });
});

describe('useConversationContext (TCK-2632)', () => {
  it('lit le contexte du fil, et rien sans fil', async () => {
    const espion = espionFetch();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { rerender } = renderHook((p: { id: number | null }) => useConversationContext(p.id), {
      wrapper,
      initialProps: { id: null as number | null },
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(espion).not.toHaveBeenCalled();
    rerender({ id: 42 });
    await waitFor(() => expect(espion).toHaveBeenCalledTimes(1));
    expect(String(espion.mock.calls[0]![0])).toMatch(/\/api\/conversations\/42\/context$/);
  });
});

describe('useSendAttachment (TCK-2632)', () => {
  function monterEnvoi() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    return renderHook(() => useSendAttachment(7), { wrapper });
  }

  it('poste le fichier dans `file`, sur la route du texte, avec sa légende', async () => {
    const espion = espionFetch();
    const { result } = monterEnvoi();
    const pdf = new File(['%PDF'], 'bail.pdf', { type: 'application/pdf' });
    await result.current.mutateAsync({ file: pdf, type: 'document', content: '  Le bail signé ' });
    const [url, init] = espion.mock.calls[0]!;
    expect(String(url)).toMatch(/\/api\/conversations\/7\/messages$/);
    expect(String(url)).not.toMatch(/attachments/);
    const corps = (init as RequestInit).body as FormData;
    expect(corps.get('type')).toBe('document');
    expect((corps.get('file') as File).name).toBe('bail.pdf');
    expect(corps.get('content')).toBe('Le bail signé');
  });

  it('sans légende, `content` ne part pas', async () => {
    const espion = espionFetch();
    const { result } = monterEnvoi();
    await result.current.mutateAsync({ file: new File(['x'], 'p.jpg', { type: 'image/jpeg' }), type: 'image', content: '   ' });
    const corps = (espion.mock.calls[0]![1] as RequestInit).body as FormData;
    expect(corps.get('type')).toBe('image');
    expect(corps.has('content')).toBe(false);
  });
});

describe('le fil à deux qui existe déjà (TCK-2632, AC4)', () => {
  const membre = (user_id: number, left_at: string | null = null) => ({ id: user_id * 10, user_id, role: 'member', last_read_at: null, joined_at: '', left_at });
  const fil = (id: number, type: string, membres: unknown[]) => ({ id, type, participants: membres }) as unknown as Conversation;

  it('se reconnaît à l’IDENTIFIANT de la personne, membre actuel, dans un fil direct', () => {
    const liste = [
      fil(1, 'group', [membre(1), membre(9)]),
      fil(2, 'direct', [membre(1), membre(8)]),
      fil(3, 'direct', [membre(1), membre(9, '2026-10-01')]),
      fil(4, 'direct', [membre(1), membre(9)]),
      fil(5, 'direct', [membre(1), membre(9)]),
    ];
    expect(filDirectAvec(liste, 9)).toBe(4);
    expect(filDirectAvec(liste, 7)).toBeNull();
  });

  it('cherche au serveur les fils directs de la personne par son IDENTIFIANT, jamais par son nom', async () => {
    const espion = espionFetch();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useTrouverLeFilDirect(), { wrapper });
    await expect(result.current({ id: 9, name: 'Awa Ndiaye' })).resolves.toBeNull();
    const qs = parametres(espion.mock.calls[0]![0]);
    expect(qs.get('filter[type]')).toBe('direct');
    expect(qs.get('filter[participant]')).toBe('9');
    expect(qs.has('filter[search]')).toBe(false);
    expect((espion.mock.calls[0]![1] as RequestInit | undefined)?.method ?? 'GET').toBe('GET');
  });
});
