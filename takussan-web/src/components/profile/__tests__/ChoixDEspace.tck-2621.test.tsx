/**
 * TCK-2621 — l'écran « Choisir un espace ». Les hooks de bascule sont les VRAIS
 * (`useSwitchActiveProfile`), branchés sur un `fetch` simulé : c'est le corps du `PATCH` qu'on juge.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Profile } from '@/types/profile';
import { withIntl } from '@/test/intl';
import { ChoixDEspace } from '../ChoixDEspace';
import { COOKIE_CHOIX_CLIENT } from '@/lib/espaces';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }) }));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 176 }, refreshUser: vi.fn(), setActiveProfileId: vi.fn() }),
}));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: vi.fn() }) }));

const ESPACES: Profile[] = [
  { id: 'agent:5', type: 'agent', numeric_id: 5, agency_id: 1, agency: { id: 1, name: 'Dakar Immo', slug: 'dakar-immo', kind: 'standard', city: 'Dakar' }, status: 'active', created_at: null },
  { id: 'owner:9', type: 'owner', numeric_id: 9, agency_id: 2, agency: { id: 2, name: 'Thiès Properties', slug: 'thies-properties', kind: 'standard', city: 'Thiès' }, status: 'active', created_at: null },
];

let corps: unknown[] = [];
function monter(prenom = 'Khady') {
  corps = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url === '/api/me/active-profile') {
      corps.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ data: ESPACES[1] }), { status: 200 });
    }
    return new Response(JSON.stringify({ data: ESPACES, meta: { active_profile_id: null, count: 2 } }), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={queryClient}>
      <ChoixDEspace espaces={ESPACES} prenom={prenom} userId={176} />
    </QueryClientProvider>,
  ));
  return userEvent.setup();
}

beforeEach(() => {
  refresh.mockReset();
  document.cookie = `${COOKIE_CHOIX_CLIENT}=; Path=/; Max-Age=0`;
});
afterEach(() => vi.unstubAllGlobals());

describe('TCK-2621 — Choisir un espace', () => {
  it('une carte par espace : agence, puis « rôle · ville » ; jamais le slug', () => {
    monter();
    expect(screen.getByRole('heading', { level: 1, name: 'Dans quel espace travaillez-vous ?' })).toBeInTheDocument();
    expect(screen.getByText('Khady, votre compte ouvre deux espaces. Vous pourrez en changer à tout moment depuis le menu du compte.')).toBeInTheDocument();
    const dakar = screen.getByRole('radio', { name: /Dakar Immo/ });
    const thies = screen.getByRole('radio', { name: /Thiès Properties/ });
    expect(dakar).toBeChecked();
    expect(thies).not.toBeChecked();
    expect(screen.getByText('Agent · Dakar')).toBeInTheDocument();
    expect(screen.getByText('Propriétaire · Thiès')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/dakar-immo|thies-properties/);
    expect(screen.getByRole('group', { name: 'Vos espaces' })).toBeInTheDocument();
  });

  it('sans prénom, la phrase ne commence pas par une virgule', () => {
    monter('  ');
    expect(screen.getByText(/^Votre compte ouvre deux espaces\./)).toBeInTheDocument();
  });

  it('choisir Thiès envoie {profile_id, remember: true} — la case est cochée par défaut', async () => {
    const u = monter();
    await u.click(screen.getByRole('radio', { name: /Thiès Properties/ }));
    expect(screen.getByRole('checkbox', { name: 'Se souvenir de mon choix' })).toBeChecked();
    await u.click(screen.getByRole('button', { name: 'Continuer dans Thiès Properties' }));
    await waitFor(() => expect(corps).toEqual([{ profile_id: 'owner:9', remember: true }]));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('la case décochée envoie remember: false', async () => {
    const u = monter();
    await u.click(screen.getByRole('checkbox', { name: 'Se souvenir de mon choix' }));
    await u.click(screen.getByRole('button', { name: 'Continuer dans Dakar Immo' }));
    await waitFor(() => expect(corps).toEqual([{ profile_id: 'agent:5', remember: false }]));
  });

  it('« Continuer en tant que client » ne lie rien : le témoin de session, puis le rafraîchissement', async () => {
    const u = monter();
    await u.click(screen.getByRole('button', { name: 'Continuer en tant que client' }));
    expect(document.cookie).toContain(`${COOKIE_CHOIX_CLIENT}=176`);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(corps).toEqual([]);
  });

  it('le clavier : les flèches passent d’un espace à l’autre (radios natifs)', async () => {
    const u = monter();
    screen.getByRole('radio', { name: /Dakar Immo/ }).focus();
    await u.keyboard('{ArrowDown}');
    expect(screen.getByRole('radio', { name: /Thiès Properties/ })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Continuer dans Thiès Properties' })).toBeInTheDocument();
  });
});
