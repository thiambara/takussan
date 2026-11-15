import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';

import { ChercherUnBien, PublierUnBien, SiAucuneRecherche } from '../ChercherEtPublier';
import { FavorisQuiBougent } from '../FavorisQuiBougent';
import { ReponseRecue } from '../ReponseRecue';
import { VosVisites, type VisiteAVenir } from '../VosVisites';

/**
 * TCK-2853 — l'accueil du client : la carte de visite complète (photo, agent, « Déplacer », « Itinéraire »),
 * « … vous a répondu · Lire » au bureau, « Chercher un bien », « Vous avez un bien à louer ? » et les
 * favoris en forme de colonne. La couche RÉSEAU est doublée par chemin ; les hooks tournent pour de vrai.
 */
const reseau = vi.hoisted(() => ({
  appels: [] as { chemin: string; methode: string; corps: unknown }[],
  fils: [] as unknown[],
  recherches: [] as unknown[],
  favoris: [] as unknown[],
  visite: null as unknown,
  rafraichir: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: reseau.toast }) }));

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 5, roles: ['customer'] }, token: 'jeton' }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: reseau.rafraichir }), usePathname: () => '/app' }));

vi.mock('@/lib/api', async (importOriginal) => {
  const reel = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...reel,
    apiFetch: vi.fn(async (chemin: string) => {
      const jour = /date=(\d{4}-\d{2}-\d{2})/.exec(chemin)?.[1] ?? '';
      return { data: { slots: ['09:30', '10:00'].map((label) => ({ start: `${jour}T${label}:00Z`, label, available: true })) } };
    }),
    apiRequest: vi.fn(async (chemin: string, options: { method?: string; body?: unknown } = {}) => {
      const methode = options.method ?? 'GET';
      const lu = decodeURIComponent(chemin);
      const corps = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
      reseau.appels.push({ chemin: lu, methode, corps });
      if (lu.startsWith('/api/conversations?')) return { data: reseau.fils, meta: { total: reseau.fils.length, current_page: 1, last_page: 1, per_page: 1 } };
      if (lu.startsWith('/api/saved-searches')) return { data: reseau.recherches };
      if (lu.startsWith('/api/favorites')) return { data: reseau.favoris, meta: { total: reseau.favoris.length, current_page: 1, last_page: 1, per_page: 2 } };
      if (lu === '/api/property-visits/11/reschedule' && methode === 'POST') {
        return { data: { id: 11, property_id: 3, status: 'scheduled', scheduled_at: (corps as { scheduled_at: string }).scheduled_at } };
      }
      if (lu.startsWith('/api/property-visits/11') && methode === 'GET') return { data: reseau.visite };
      throw new Error(`requête inattendue : ${methode} ${lu}`);
    }),
  };
});

function monter(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}>{ui}</QueryClientProvider>));
}

const CONFIRMEE: VisiteAVenir = {
  id: 11,
  scheduled_at: '2026-11-12T10:00:00Z',
  status: 'confirmed',
  property: { id: 3, title: 'Studio meublé à Mermoz', cover_url: 'http://127.0.0.1:8002/storage/studio.webp', address_line: 'Mermoz, Dakar', coordinates: { lat: 14.7083, lng: -17.4736 } },
  agent: { name: 'Sokhna Sène' },
  can_reschedule: true,
};

beforeEach(() => {
  reseau.appels = [];
  reseau.fils = [];
  reseau.recherches = [];
  reseau.favoris = [];
  reseau.visite = { id: 11, property_id: 3, status: 'confirmed', scheduled_at: '2026-11-12T10:00:00Z', property: { id: 3, title: 'Studio meublé à Mermoz', slug: 'studio-meuble-mermoz' } };
  reseau.rafraichir.mockReset();
});

describe('TCK-2853 — la carte de visite du client', () => {
  it('AC1 — visite confirmée : la photo, « Studio meublé à Mermoz · Sokhna Sène », « Déplacer » et « Itinéraire » vers les coordonnées', () => {
    monter(<VosVisites visites={[CONFIRMEE]} />);
    const carte = document.querySelector<HTMLElement>('[data-slot="carte-de-visite-client"]')!;
    expect(carte.querySelector('img')?.getAttribute('src')).toContain('studio.webp');
    expect(within(carte).getByText('Studio meublé à Mermoz · Sokhna Sène')).toBeTruthy();
    expect(within(carte).getByRole('button', { name: 'Déplacer' })).toBeTruthy();
    const itineraire = within(carte).getByRole('link', { name: 'Itinéraire' });
    expect(itineraire.getAttribute('href')).toBe('https://www.google.com/maps/dir/?api=1&destination=14.7083,-17.4736');
    expect(itineraire.getAttribute('target')).toBe('_blank');
    // Les deux gestes de la maquette : « Voir la visite » ne prend pas de place.
    expect(within(carte).queryByRole('link', { name: 'Voir la visite' })).toBeNull();
  });

  it('sans coordonnées (visite non confirmée) : pas d’« Itinéraire » ; sans `can_reschedule` : pas de « Déplacer » — « Voir la visite » garde le chemin', () => {
    const enAttente: VisiteAVenir = { ...CONFIRMEE, id: 12, status: 'scheduled', property: { ...CONFIRMEE.property!, coordinates: undefined } };
    const figee: VisiteAVenir = { ...CONFIRMEE, id: 13, can_reschedule: false };
    monter(<VosVisites visites={[enAttente, figee]} />);
    const [a, b] = [...document.querySelectorAll<HTMLElement>('[data-slot="carte-de-visite-client"]')];
    expect(within(a!).queryByRole('link', { name: 'Itinéraire' })).toBeNull();
    expect(within(a!).getByRole('button', { name: 'Déplacer' })).toBeTruthy();
    expect(within(a!).getByRole('link', { name: 'Voir la visite' }).getAttribute('href')).toBe('/app/visits/12');
    expect(within(b!).queryByRole('button', { name: 'Déplacer' })).toBeNull();
    expect(within(b!).getByRole('link', { name: 'Itinéraire' })).toBeTruthy();
  });

  it('des coordonnées servies sur une visite non confirmée ne font pas d’« Itinéraire »', () => {
    monter(<VosVisites visites={[{ ...CONFIRMEE, status: 'scheduled' }]} />);
    expect(screen.queryByRole('link', { name: 'Itinéraire' })).toBeNull();
  });

  it('AC2 — « Déplacer » → un créneau → POST …/reschedule → la carte affiche la nouvelle date, en attente, sans « Itinéraire »', async () => {
    const user = userEvent.setup();
    monter(<VosVisites visites={[CONFIRMEE]} />);
    const carte = document.querySelector<HTMLElement>('[data-slot="carte-de-visite-client"]')!;
    expect(within(carte).getByText(/jeu\. 12 nov\. · 10:00/i)).toBeTruthy();

    await user.click(within(carte).getByRole('button', { name: 'Déplacer' }));
    // Un jour de la fenêtre que l'API accepte (du jour à J+60) : le champ a pour `min` le jour courant.
    const jour = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    fireEvent.change(await screen.findByLabelText('Date'), { target: { value: jour } });
    await user.click(await screen.findByRole('button', { name: '09:30' }));
    await user.click(screen.getByRole('button', { name: 'Proposer' }));

    await waitFor(() => expect(within(carte).getByText(/· 09:30$/)).toBeTruthy());
    expect(within(carte).queryByText(/12 nov\. · 10:00/)).toBeNull();
    const poste = reseau.appels.find((a) => a.methode === 'POST');
    expect(poste).toEqual({ chemin: '/api/property-visits/11/reschedule', methode: 'POST', corps: { scheduled_at: `${jour}T09:30:00Z` } });
    expect(within(carte).getByText('En attente de confirmation')).toBeTruthy();
    expect(within(carte).queryByRole('link', { name: 'Itinéraire' })).toBeNull();
    expect(reseau.rafraichir).toHaveBeenCalled();
  });
});

describe('TCK-2853 — « … vous a répondu · Lire » (bureau)', () => {
  const FIL = {
    id: 55,
    subject: null,
    type: 'direct',
    status: 'active',
    last_message_at: new Date(Date.now() - 65 * 60_000).toISOString(),
    last_message_preview: 'Oui, le studio est libre au 1ᵉʳ décembre.',
    last_message: { id: 900, type: 'text', metadata: null },
    unread_count: 1,
    participants: [
      { id: 1, user_id: 5, role: 'member', last_read_at: null, joined_at: '2026-11-01', left_at: null, user: { id: 5, full_name: 'Fatou Ndiaye', avatar_url: null } },
      { id: 2, user_id: 31, role: 'member', last_read_at: null, joined_at: '2026-11-01', left_at: null, user: { id: 31, full_name: 'Sokhna Sène', avatar_url: null } },
    ],
  };

  it('AC3 — un fil non lu : « Sokhna Sène vous a répondu », la citation, « il y a 1 h », et « Lire » ouvre ce fil ; la lecture est filtrée par le serveur', async () => {
    reseau.fils = [FIL];
    monter(<ReponseRecue />);
    expect(await screen.findByText('Sokhna Sène vous a répondu')).toBeTruthy();
    const rangee = document.querySelector<HTMLElement>('[data-slot="reponse-recue"]')!;
    expect(rangee.textContent).toContain('« Oui, le studio est libre au 1ᵉʳ décembre. » · il y a 1 h');
    expect(within(rangee).getByRole('link', { name: 'Lire' }).getAttribute('href')).toBe('/app/messages?conversation=55');
    const lu = reseau.appels.find((a) => a.chemin.startsWith('/api/conversations?'))!.chemin;
    expect(lu).toContain('filter[unread]=1');
    expect(lu).toContain('filter[type]=direct');
    expect(lu).toContain('per_page=1');
  });

  it('AC3 — sans fil non lu : aucune rangée', async () => {
    const { container } = monter(<ReponseRecue />);
    await waitFor(() => expect(reseau.appels.some((a) => a.chemin.startsWith('/api/conversations?'))).toBe(true));
    await new Promise((r) => setTimeout(r, 0));
    expect(container.querySelector('[data-slot="reponse-recue"]')).toBeNull();
  });

  it('un avis système n’est jamais cité', async () => {
    reseau.fils = [{ ...FIL, last_message: { id: 901, type: 'system', metadata: { event: 'renamed' } }, last_message_preview: 'X a renommé le fil' }];
    monter(<ReponseRecue />);
    await screen.findByText('Sokhna Sène vous a répondu');
    expect(document.body.textContent).not.toContain('X a renommé');
  });

  // TCK-2860 — `last_message.sender_id` (TCK-2858) : le client qui a écrit le dernier mot n'a pas « reçu de réponse ».
  it('TCK-2860 — le dernier message est du client lui-même : aucune rangée ; d’un autre : la rangée', async () => {
    reseau.fils = [{ ...FIL, last_message: { id: 902, type: 'text', metadata: null, sender_id: 5 } }];
    const { container } = monter(<ReponseRecue />);
    await waitFor(() => expect(reseau.appels.some((a) => a.chemin.startsWith('/api/conversations?'))).toBe(true));
    await new Promise((r) => setTimeout(r, 0));
    expect(container.querySelector('[data-slot="reponse-recue"]')).toBeNull();
  });

  it('TCK-2860 — le dernier message est de l’autre (`sender_id` posé) : la rangée', async () => {
    reseau.fils = [{ ...FIL, last_message: { id: 903, type: 'text', metadata: null, sender_id: 31 } }];
    monter(<ReponseRecue />);
    expect(await screen.findByText('Sokhna Sène vous a répondu')).toBeTruthy();
  });
});

describe('TCK-2853 — chercher et publier', () => {
  it('AC4 — « Chercher un bien » mène à la recherche publique ; AC5 — « Vous avez un bien à louer ? » à l’entrée de publication', () => {
    monter(
      <>
        <ChercherUnBien href="/fr/properties?contract_type=rent&city=Dakar" />
        <PublierUnBien />
      </>,
    );
    expect(screen.getByRole('link', { name: 'Chercher un bien' }).getAttribute('href')).toBe('/fr/properties?contract_type=rent&city=Dakar');
    const publier = screen.getByRole('link', { name: /Vous avez un bien à louer \?\s*Publiez-le en quelques minutes\./ });
    expect(publier.getAttribute('href')).toBe('/publish');
  });

  it('l’invitation à chercher n’est rendue qu’au client sans recherche sauvegardée', async () => {
    const { unmount } = monter(<SiAucuneRecherche><p>invitation</p></SiAucuneRecherche>);
    expect(await screen.findByText('invitation')).toBeTruthy();
    unmount();
    reseau.recherches = [{ id: 1, user_id: 5, name: 'Studio à Mermoz', criteria: {}, notification_frequency: 'off', is_active: true, results_count: null, alert_channels: [], last_viewed_at: null, created_at: '2026-10-01T00:00:00Z' }];
    monter(<SiAucuneRecherche><p>invitation</p></SiAucuneRecherche>);
    await waitFor(() => expect(reseau.appels.filter((a) => a.chemin.startsWith('/api/saved-searches'))).toHaveLength(2));
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText('invitation')).toBeNull();
  });
});

describe('TCK-2853 — AC6 : les favoris en forme de colonne', () => {
  it('au bureau : l’intertitre de colonne, un id distinct de celui du téléphone', async () => {
    reseau.favoris = [
      { id: 1, availability: 'available', price_change: -20_000, property: { id: 3, slug: 'studio', title: 'Studio meublé', price: 180_000, currency: 'XOF', contract_type: 'rent', rent_period: 'monthly', main_photo_url: null, location: { quarter: 'Mermoz' } } },
    ];
    monter(
      <>
        <FavorisQuiBougent className="md:hidden" />
        <FavorisQuiBougent bureau className="max-md:hidden" />
      </>,
    );
    await waitFor(() => expect(document.querySelectorAll('[data-slot="favoris-qui-bougent"]')).toHaveLength(2));
    const [telephone, bureau] = [...document.querySelectorAll<HTMLElement>('[data-slot="favoris-qui-bougent"]')];
    expect(telephone!.getAttribute('aria-labelledby')).toBe('favoris-qui-bougent');
    expect(bureau!.getAttribute('aria-labelledby')).toBe('favoris-qui-bougent-bureau');
    expect(document.getElementById('favoris-qui-bougent-bureau')?.closest('section')).toBe(bureau);
    expect(reseau.appels.filter((a) => a.chemin.startsWith('/api/favorites'))).toHaveLength(1);
  });
});
