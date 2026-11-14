/**
 * TCK-2619 — la page introuvable propose d'aller ailleurs : « Aller à… » ouvert dans la page, les récents
 * et quatre entrées du menu, deux retours. Monté DANS le contexte du menu de la coque (`AppShell` le
 * fournit) ; les lectures réseau du menu sont doublées comme dans `AppSidebar.personnalisation.test.tsx`.
 *
 * ⚠ Ce que jsdom ne prouve pas : que le H1 et le champ sont dans le HTML que Next SERT (le 404). Cela se
 * mesure en HTTP (rapport du ticket), pas ici. `introuvable.test.tsx` garde la CAUSE (le module du champ
 * et du retour n'est pas client).
 *
 * `not-found.tsx` est rendu tel quel : un composant serveur asynchrone qu'on attend, le compte et le
 * profil actif doublés (`getMeAction`, `getActiveProfileId`).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { ContexteDuMenuDeLaCoque } from '@/components/layout/contexte-du-menu-de-la-coque';
import { clePagesRecentes } from '@/lib/navigation/pages-recentes';
import type { User, UserRole } from '@/types/user';
import type { ProfileType } from '@/types/profile';

const chemin = vi.hoisted(() => ({ courant: '/app/zzz' }));
const pousser = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  usePathname: () => chemin.courant,
  useRouter: () => ({ push: pousser, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));
vi.mock('@/hooks/useCan', () => ({
  useMyCapabilities: () => ({ data: { data: { agency_id: 1, capabilities: ['properties.create'] } } }),
}));
vi.mock('@/hooks/useProfiles', () => ({
  useMyProfiles: () => ({ data: undefined, isLoading: false }),
  useSwitchActiveProfile: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/components/chat-widget/useUnreadCount', () => ({ useUnreadCount: () => 0 }));
vi.mock('@/lib/queries/visits', () => ({ usePendingVisitsCount: () => ({}) }));
vi.mock('@/lib/queries/contact-leads', () => ({ useUnhandledLeadsCount: () => ({}) }));
vi.mock('@/lib/queries/reviews-moderation', () => ({ fetchModerationQueue: () => Promise.resolve({ meta: { total: 0 } }) }));
vi.mock('@/lib/queries/property-moderation', () => ({
  fetchPropertyModerationQueue: () => Promise.resolve({ meta: { total: 0 } }),
}));
const compte = vi.hoisted(() => ({ roles: [] as string[], profil: undefined as string | undefined }));
vi.mock('@/app/actions/auth', () => ({ getMeAction: () => Promise.resolve({ id: 41, roles: compte.roles }) }));
vi.mock('@/lib/session', () => ({ getActiveProfileId: () => Promise.resolve(compte.profil) }));

const { default: AppNotFound } = await import('../not-found');

async function monter(roles: UserRole[], typeProfilActif: ProfileType | null = null) {
  const user = { id: 41, first_name: 'Awa', last_name: 'Diop', roles, agency_id: 7, preferences: {} } as unknown as User;
  compte.roles = roles;
  // Le cookie `active_profile_id` porte « <type>:<id> » (`typeDuProfilActif`).
  compte.profil = typeProfilActif ? `${typeProfilActif}:9` : undefined;
  const page = await AppNotFound();
  return render(
    withIntl(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ContexteDuMenuDeLaCoque.Provider value={{ user, agencyIsStandard: true, typeProfilActif, modulesMasques: [] }}>
          {page}
        </ContexteDuMenuDeLaCoque.Provider>
      </QueryClientProvider>,
    ),
  );
}

const champ = () => screen.getByRole('searchbox', { name: 'Rechercher une page, une action ou un espace' });
const secours = () => within(document.querySelector<HTMLElement>('[data-slot="secours-de-l-introuvable"]')!);

beforeEach(() => {
  chemin.courant = '/app/zzz';
  pousser.mockReset();
  window.localStorage.clear();
});

describe('TCK-2619 — la page introuvable propose d’aller ailleurs', () => {
  it('AC5 — H1 « Page introuvable » et le champ « Aller à… » ; taper « baux » propose « Baux » du menu', async () => {
    await monter(['customer', 'agency_admin']);
    expect(screen.getByRole('heading', { level: 1, name: 'Page introuvable' })).toBeInTheDocument();
    expect(champ()).toHaveAttribute('placeholder', 'Une page, une action, un espace…');
    await userEvent.setup().type(champ(), 'baux');
    expect(secours().getByRole('link', { name: 'Baux' })).toHaveAttribute('href', '/app/leases');
    // Entrée dans le champ ouvre la première page proposée.
    await userEvent.setup().keyboard('{Enter}');
    expect(pousser).toHaveBeenCalledWith('/app/leases');
  });

  it('à vide : les récents de l’appareil (« Récent »), puis quatre entrées du menu, sans l’accueil', async () => {
    window.localStorage.setItem(clePagesRecentes(41), JSON.stringify(['/app/leases', '/app/customers/12']));
    await monter(['customer', 'agency_admin']);
    const liens = secours().getAllByRole('link');
    const recents = liens.filter((l) => l.textContent?.endsWith('Récent'));
    expect(recents.map((l) => l.getAttribute('href'))).toEqual(['/app/leases', '/app/customers']);
    const entrees = liens.filter((l) => !l.textContent?.endsWith('Récent'));
    expect(entrees).toHaveLength(4);
    expect(entrees.map((l) => l.getAttribute('href'))).not.toContain('/app');
    // Aucune entrée n'est proposée deux fois.
    expect(new Set(liens.map((l) => l.getAttribute('href'))).size).toBe(liens.length);
  });

  it('une saisie sans page le dit, sans liste', async () => {
    await monter(['customer', 'agency_admin']);
    await userEvent.setup().type(champ(), 'zzqqx');
    expect(screen.getByText('Aucune page pour « zzqqx »')).toBeInTheDocument();
    expect(document.querySelector('[data-slot="secours-de-l-introuvable"]')).toBeNull();
  });

  it('les deux retours : la liste quand l’URL en a une, puis l’accueil ; « Retour à Aujourd’hui » chez l’agent', async () => {
    chemin.courant = '/app/leases/abc';
    const { unmount } = await monter(['customer', 'agency_admin']);
    expect(screen.getByRole('link', { name: 'Revenir à la liste' })).toHaveAttribute('href', '/app/leases');
    expect(screen.getByRole('link', { name: 'Retour à l’accueil' })).toHaveAttribute('href', '/app');
    unmount();
    chemin.courant = '/app/zzz';
    const agent = await monter(['customer', 'agent'], 'agent');
    expect(screen.queryByRole('link', { name: 'Revenir à la liste' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Retour à Aujourd’hui' })).toHaveAttribute('href', '/app');
    agent.unmount();
  });

  it('le retour se nomme sur le PROFIL ACTIF lu au serveur : l’admin qui est aussi agent, sous chacun', async () => {
    const sousAgent = await monter(['customer', 'agency_admin', 'agent'], 'agent');
    expect(screen.getByRole('link', { name: 'Retour à Aujourd’hui' })).toBeInTheDocument();
    sousAgent.unmount();
    await monter(['customer', 'agency_admin', 'agent'], 'agency_admin');
    expect(screen.getByRole('link', { name: 'Retour à l’accueil' })).toBeInTheDocument();
  });
});
