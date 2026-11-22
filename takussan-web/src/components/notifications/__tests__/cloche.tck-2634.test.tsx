import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { NotificationBell } from '@/components/layout/NotificationBell';
import type { AppNotification, NotificationsQuery, NotificationsResponse } from '@/lib/notifications';
import type { MyProfilesResponse, Profile } from '@/types/profile';
import { withIntl } from '@/test/intl';

/**
 * TCK-2634 — la cloche par familles : la puce « À traiter » filtre côté serveur, l'icône se lit dans
 * `famille`, les répétitions se replient (et « Tout lire » d'un repli lit chacune de ses lignes), le
 * verbe d'une ligne à traiter est un lien vers son objet, la feuille du téléphone rend le focus à la
 * cloche, et un avis d'une autre agence bascule d'espace, par la ligne comme par son verbe.
 */

const getNotificationsMock = vi.fn<(q: NotificationsQuery) => Promise<{ ok: true; data: NotificationsResponse }>>();
const markReadMock = vi.fn();
const markManyMock = vi.fn();
const push = vi.fn();
const mutateAsync = vi.fn();
let profils: MyProfilesResponse | undefined;

vi.mock('@/app/actions/notifications', () => ({
  getNotificationsAction: (q: NotificationsQuery) => getNotificationsMock(q),
  markNotificationReadAction: (id: number) => markReadMock(id),
  markNotificationUnreadAction: vi.fn(),
  markNotificationsReadAction: (ids: number[]) => markManyMock(ids),
  markAllNotificationsReadAction: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/app',
  useSearchParams: () => new URLSearchParams(''),
}));
vi.mock('@/hooks/useProfiles', () => ({
  useMyProfiles: () => ({ data: profils, isLoading: profils === undefined }),
  useSwitchActiveProfile: () => ({ mutateAsync, isPending: false }),
}));

const MAINTENANT = new Date();
const ilYA = (minutes: number) => new Date(MAINTENANT.getTime() - minutes * 60_000).toISOString();

let suivant = 100;
function ligne(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: suivant++,
    type: 'system',
    code: 'boost.ended',
    params: { property: 'Studio meublé, Mermoz' },
    target: { kind: 'property', id: 1, path: '/app/properties/1' },
    title: 'Mise en avant terminée',
    body: null,
    is_read: false,
    read_at: null,
    created_at: ilYA(60),
    famille: 'bien',
    a_traiter: false,
    ...overrides,
  };
}

const VISITE = () =>
  ligne({
    code: 'visit.requested',
    params: { property: 'Studio meublé, Mermoz', scheduled_at: '2026-11-12T10:00:00Z', contact: null },
    param_types: { property: 'text', scheduled_at: 'datetime', contact: 'text' },
    target: { kind: 'visit', id: 4, path: '/app/visits/4' },
    title: 'Demande de visite',
    famille: 'visite',
    a_traiter: true,
    created_at: ilYA(5),
  });

function reponse(data: AppNotification[], aTraiter = 1): { ok: true; data: NotificationsResponse } {
  return {
    ok: true,
    data: {
      data,
      meta: {
        total: data.length,
        unread: data.filter((d) => !d.read_at).length,
        current_page: 1,
        last_page: 1,
        counts: { a_traiter_non_lues: aTraiter, par_famille: { visite: 1, bien: data.length - 1 } },
      },
    },
  };
}

function rendre(emplacement: 'colonne' | 'en-tete' = 'colonne') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <NotificationBell emplacement={emplacement} />
      </QueryClientProvider>,
    ),
  );
}

async function ouvrir(emplacement: 'colonne' | 'en-tete' = 'colonne') {
  const utilisateur = userEvent.setup();
  rendre(emplacement);
  await utilisateur.click(screen.getByRole('button', { name: 'Notifications' }));
  const cloche = await screen.findByRole('dialog', { name: 'Centre de notifications' });
  return { utilisateur, cloche };
}

describe('TCK-2634 — la cloche par familles', () => {
  beforeEach(() => {
    suivant = 100;
    getNotificationsMock.mockReset();
    markReadMock.mockReset();
    markManyMock.mockReset();
    push.mockReset();
    mutateAsync.mockReset().mockResolvedValue({ data: {} });
    profils = undefined;
    const boosts = Array.from({ length: 9 }, (_, i) => ligne({ params: { property: `Bien n° ${i + 1}` } }));
    getNotificationsMock.mockImplementation(async (q) => reponse(q.aTraiter ? [VISITE()] : [VISITE(), ...boosts]));
  });

  it('la puce « À traiter » envoie filter[a_traiter] (côté serveur) et porte le compte de l’API', async () => {
    const { utilisateur, cloche } = await ouvrir();
    expect(getNotificationsMock).toHaveBeenCalledWith({ perPage: 20, aTraiter: false });

    const puce = within(cloche).getByRole('button', { name: /^À traiter\s*1$/ });
    await utilisateur.click(puce);

    await waitFor(() => expect(getNotificationsMock).toHaveBeenLastCalledWith({ perPage: 20, aTraiter: true }));
    expect(within(cloche).getByRole('button', { name: /^À traiter\s*1$/ })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(within(cloche).queryByText(/Mise en avant terminée/)).not.toBeInTheDocument());
  });

  it('passer à « À traiter » montre le squelette, jamais les lignes de « Tout » sous la puce', async () => {
    const { utilisateur, cloche } = await ouvrir();
    await within(cloche).findByText(/Mise en avant terminée/);
    getNotificationsMock.mockImplementation((q) => (q.aTraiter ? new Promise(() => {}) : Promise.resolve(reponse([VISITE()]))));

    await utilisateur.click(within(cloche).getByRole('button', { name: /^À traiter\s*1$/ }));

    expect(cloche.querySelector('[data-slot=squelette-des-notifications]')).not.toBeNull();
    expect(within(cloche).queryByText(/Mise en avant terminée/)).not.toBeInTheDocument();
    // Les comptes restent ceux de « Tout » pendant le chargement.
    expect(within(cloche).getByRole('button', { name: /^À traiter\s*1$/ })).toBeInTheDocument();
    expect(cloche.querySelector('[data-slot=liste-de-la-cloche]')).toHaveAttribute('aria-busy', 'true');
  });

  it('« À traiter » vide dit « Rien à traiter », pas « Vous êtes à jour » (des non lues restent)', async () => {
    // L'API rend `meta.unread` sans tenir compte des filtres (relevé du 2026-11-12) : 1 non lue, même sous « À traiter ».
    getNotificationsMock.mockImplementation(async (q) => {
      const r = reponse(q.aTraiter ? [] : [ligne()], 0);
      return { ...r, data: { ...r.data, meta: { ...r.data.meta, unread: 1 } } };
    });
    const { utilisateur, cloche } = await ouvrir();
    await utilisateur.click(within(cloche).getByRole('button', { name: /^À traiter\s*0$/ }));
    expect(await within(cloche).findByText('Rien à traiter')).toBeInTheDocument();
    expect(within(cloche).queryByText('Vous êtes à jour')).not.toBeInTheDocument();
  });

  it('l’icône se lit dans `famille`, jamais dans une liste de codes du front', async () => {
    const { cloche } = await ouvrir();
    await within(cloche).findByText(/Demande de visite/);
    const familles = [...cloche.querySelectorAll('[data-slot=icone-de-famille]')].map((el) => el.getAttribute('data-famille'));
    expect(familles).toEqual(['visite', 'bien']);
    // La date relative de la maquette, par next-intl (aucune locale figée).
    expect(within(cloche).getByText('il y a 5 min')).toBeInTheDocument();
    expect(within(cloche).getByText('Aujourd’hui')).toBeInTheDocument();
  });

  it('9 lignes consécutives de même code se replient en UNE ligne « Mise en avant terminée · 9 biens »', async () => {
    const { utilisateur, cloche } = await ouvrir();
    const repli = await within(cloche).findByRole('button', { name: /Mise en avant terminée · 9 biens/ });
    expect(within(cloche).getAllByText(/Mise en avant terminée/)).toHaveLength(1);
    expect(repli).toHaveAttribute('aria-expanded', 'false');

    await utilisateur.click(repli);
    expect(repli).toHaveAttribute('aria-expanded', 'true');
    // Trois d'emblée, puis « Voir les 6 autres » : chacune ouvre son bien.
    await utilisateur.click(within(cloche).getByRole('button', { name: 'Voir les 6 autres' }));
    const depliees = cloche.querySelectorAll('[data-slot=ligne-depliee]');
    expect(depliees).toHaveLength(9);
    for (const el of depliees) expect(within(el as HTMLElement).getByRole('link')).toHaveAttribute('href', '/app/properties/1');
  });

  it('« Tout lire » d’un repli marque chacune de ses 9 lignes', async () => {
    markManyMock.mockImplementation(async (ids: number[]) => ({
      ok: true,
      data: { lues: ids.map((id) => ligne({ id, read_at: MAINTENANT.toISOString(), is_read: true })), echecs: 0 },
    }));
    const { utilisateur, cloche } = await ouvrir();
    await within(cloche).findByRole('button', { name: /Mise en avant terminée · 9 biens/ });

    await utilisateur.click(within(cloche).getByRole('button', { name: 'Tout lire (9)' }));

    await waitFor(() => expect(markManyMock).toHaveBeenCalledTimes(1));
    expect(markManyMock.mock.calls[0][0]).toEqual([100, 101, 102, 103, 104, 105, 106, 107, 108]);
    // Le compte des non-lues suit : 10 → 1.
    await waitFor(() => expect(within(cloche).getByText('1 non lue · 1 à traiter')).toBeInTheDocument());
  });

  it('« Tout lire » d’un repli qui n’aboutit qu’en partie corrige les lues ET dit combien ont échoué', async () => {
    markManyMock.mockImplementation(async (ids: number[]) => ({
      ok: true,
      data: { lues: ids.slice(0, 7).map((id) => ligne({ id, read_at: MAINTENANT.toISOString(), is_read: true })), echecs: 2 },
    }));
    const { utilisateur, cloche } = await ouvrir();
    await within(cloche).findByRole('button', { name: /Mise en avant terminée · 9 biens/ });

    await utilisateur.click(within(cloche).getByRole('button', { name: 'Tout lire (9)' }));

    expect(await within(cloche).findByRole('alert')).toHaveTextContent('2 notifications n’ont pas pu être marquées lues. Réessayez.');
    // Les 7 lues sont corrigées : 10 → 3 non lues.
    await waitFor(() => expect(within(cloche).getByText('3 non lues · 1 à traiter')).toBeInTheDocument());
  });

  it('une ligne à traiter porte le verbe de son code, en lien vers son objet ; une ligne sans verbe a son chevron', async () => {
    const { cloche } = await ouvrir();
    const verbe = await within(cloche).findByRole('link', { name: 'Confirmer' });
    expect(verbe).toHaveAttribute('href', '/app/visits/4');
    // Le verbe principal de la liste est plein, les autres en contour.
    expect(verbe.className).toContain('bg-primary');
  });

  it('le verbe plein va à la première ligne à traiter RENDUE — jamais à une ligne cachée dans un repli', async () => {
    const lue = (minutes: number) => ({ ...VISITE(), read_at: ilYA(1), is_read: true, created_at: ilYA(minutes) });
    const nonLue = { ...VISITE(), created_at: ilYA(30), target: { kind: 'visit', id: 9, path: '/app/visits/9' } };
    getNotificationsMock.mockImplementation(async () => reponse([lue(1), lue(2), lue(3), nonLue]));
    const { cloche } = await ouvrir();
    const verbe = await within(cloche).findByRole('link', { name: 'Confirmer' });
    // Les trois lues sont repliées : le seul verbe visible est celui de la non lue, et il est plein.
    expect(verbe).toHaveAttribute('href', '/app/visits/9');
    expect(verbe.className).toContain('bg-primary');
  });

  it('une ligne sans code n’a pas de verbe, même « à traiter »', async () => {
    getNotificationsMock.mockImplementation(async () => reponse([{ ...VISITE(), code: null, title: 'Visite (ancienne)' }]));
    const { cloche } = await ouvrir();
    await within(cloche).findByText('Visite (ancienne)');
    expect(within(cloche).queryByRole('link', { name: 'Confirmer' })).not.toBeInTheDocument();
  });

  it('au téléphone, la cloche ouvre une feuille ; Échap la ferme et rend le focus à la cloche', async () => {
    const { utilisateur, cloche } = await ouvrir('en-tete');
    expect(cloche).toHaveAttribute('data-slot', 'feuille-des-notifications');
    expect(within(cloche).getByRole('button', { name: 'Fermer' })).toBeInTheDocument();

    await utilisateur.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Notifications' })).toHaveFocus());
  });

  it('au téléphone, le geste retour ferme la feuille', async () => {
    await ouvrir('en-tete');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('un avis d’une autre agence bascule d’espace avant d’ouvrir sa page — par son verbe aussi (LienDansLAgence)', async () => {
    const profil = (id: string, type: Profile['type'], agencyId: number): Profile => ({
      id,
      type,
      numeric_id: 1,
      agency_id: agencyId,
      status: 'active',
      created_at: null,
      agency: { id: agencyId, name: agencyId === 2 ? 'Thiès Properties' : 'Dakar Immo', slug: `a${agencyId}` },
    } as Profile);
    profils = {
      data: [profil('agency_admin:1', 'agency_admin', 1), profil('agency_admin:2', 'agency_admin', 2)],
      meta: { active_profile_id: 'agency_admin:1', count: 2 },
    };
    const avis = ligne({
      code: 'review.to_moderate',
      title: 'Avis à modérer',
      famille: 'avis',
      a_traiter: true,
      target: { kind: 'review_moderation', id: null, path: '/app/agency/reviews', agency_id: 2 },
    });
    getNotificationsMock.mockImplementation(async () => reponse([avis]));
    markReadMock.mockResolvedValue({ ok: true, data: { ...avis, read_at: MAINTENANT.toISOString() } });

    const { utilisateur, cloche } = await ouvrir();
    expect(await within(cloche).findByText('Dans Thiès Properties')).toBeInTheDocument();
    await utilisateur.click(within(cloche).getByRole('link', { name: 'Modérer' }));

    expect(mutateAsync).toHaveBeenCalledWith('agency_admin:2');
    await waitFor(() => expect(push).toHaveBeenCalledWith('/app/agency/reviews'));
    expect(markReadMock).toHaveBeenCalledWith(avis.id);
  });
});
