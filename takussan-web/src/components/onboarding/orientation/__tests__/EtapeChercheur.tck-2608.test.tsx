import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import frMessages from '@/messages/fr.json';
import { withIntl } from '@/test/intl';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push, refresh: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 }, token: 'jeton', refreshUser: vi.fn() }),
}));

/** Le compte que l'API rend pour les critères demandés : la liste ouverte demandera les mêmes. */
const apiFetch = vi.fn(async (_chemin: string) => ({
  data: [
    { id: 1, title: 'Studio meublé lumineux', price: 250000, rent_period: 'monthly', area: 38, main_photo_url: null, location: { quarter: 'Mermoz', city: 'Dakar' } },
  ],
  meta: { total: 37 },
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiFetch: (chemin: string) => apiFetch(chemin),
}));

const creer = vi.fn(async (_payload: unknown) => ({ data: { id: 5 } }));
let dejaPris: { name: string }[] = [];
vi.mock('@/lib/queries/saved-searches', () => ({
  useSavedSearchesQuery: () => ({ data: { data: dejaPris } }),
  useCreateSavedSearchMutation: () => ({ mutateAsync: (p: unknown) => creer(p) }),
}));

const updateNotificationPreferences = vi.fn(async () => undefined);
vi.mock('@/lib/notification-preferences', () => ({
  updateNotificationPreferences: (...args: unknown[]) => updateNotificationPreferences(...(args as [])),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, prefetch: _prefetch, ...props }: { href: string; children: React.ReactNode; prefetch?: boolean }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { CoqueDEntree } from '@/components/entree/CoqueDEntree';

import { EtapeChercheur } from '../EtapeChercheur';

const T = frMessages.onboarding.orientation.chercheur;
const O = frMessages.onboarding.orientation;
const C = frMessages.coqueDEntree;
const QUARTIERS = ['Mermoz', 'Almadies', 'Ngor', 'Ouakam'];

/** Le bouton est rendu deux fois (pied collé du téléphone, colonne du bureau) : le même geste. */
async function voir(n = 37) {
  const boutons = await screen.findAllByRole('button', { name: `Voir les ${n} biens` });
  expect(boutons).toHaveLength(2);
  return boutons[0]!;
}

function monter(whatsapp: { numero: string } | null = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <CoqueDEntree libelles={{ marque: 'Takussan', retourAuSite: C.retourAuSite, fermer: C.fermer, quitter: C.quitter, avancement: C.avancement, sortie: C.sortie }}>
          <EtapeChercheur marque="Takussan" quartiersSuggeres={QUARTIERS} whatsapp={whatsapp} onRetour={vi.fn()} />
        </CoqueDEntree>
      </QueryClientProvider>,
    ),
  );
}

async function choisirMermozNgor150a300() {
  const user = userEvent.setup();
  monter();
  await user.click(screen.getByRole('button', { name: 'Mermoz' }));
  await user.click(screen.getByRole('button', { name: 'Ngor' }));
  await user.click(screen.getByRole('button', { name: T.tranches['150-300'] }));
  return user;
}

/**
 * TCK-2608 — « Où et pour combien ? » : UNE construction des critères sert le compte affiché, l'alerte
 * créée et la liste ouverte (AC2). L'alerte n'est créée qu'au geste « Voir les N biens ».
 */
describe('TCK-2608 — la porte du chercheur', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dejaPris = [];
  });

  it('AC2 — Mermoz + Ngor, 150 000 – 300 000 : le compte est le `meta.total` de la requête de liste aux mêmes critères', async () => {
    await choisirMermozNgor150a300();
    await voir();
    const derniere = apiFetch.mock.calls.at(-1)![0];
    const qs = new URLSearchParams(derniere.split('?')[1]);
    expect(derniere.startsWith('/public/properties/search?')).toBe(true);
    expect(qs.get('contract_type')).toBe('rent');
    expect(qs.get('locations')).toBe('Mermoz,Ngor');
    expect(qs.get('price_min')).toBe('150000');
    expect(qs.get('price_max')).toBe('300000');
    expect(qs.get('rent_period')).toBe('monthly');
  });

  it('AC2 — « Voir les 37 biens » crée l’alerte avec ces critères, puis ouvre la liste filtrée', async () => {
    const user = await choisirMermozNgor150a300();
    await user.click(await voir());
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    expect(creer).toHaveBeenCalledWith({
      name: 'Location · Mermoz, Ngor · 150 000 – 300 000 F CFA',
      criteria: { contract_type: 'rent', locations: ['Mermoz', 'Ngor'], price_min: 150000, price_max: 300000, rent_period: 'monthly' },
      notification_frequency: 'daily',
    });
    expect(push).toHaveBeenCalledWith('/properties?contract_type=rent&locations=Mermoz%2CNgor&price_min=150000&price_max=300000&rent_period=monthly');
  });

  it('aucune alerte au toucher d’une pastille : seulement au geste', async () => {
    await choisirMermozNgor150a300();
    expect(creer).not.toHaveBeenCalled();
  });

  it('un nom déjà pris par le compte reçoit un numéro (l’API rend 422 sur un doublon)', async () => {
    dejaPris = [{ name: 'Location · Mermoz, Ngor · 150 000 – 300 000 F CFA' }];
    const user = await choisirMermozNgor150a300();
    await user.click(await voir());
    await waitFor(() => expect(creer).toHaveBeenCalledTimes(1));
    expect((creer.mock.calls[0]![0] as { name: string }).name).toBe('Location · Mermoz, Ngor · 150 000 – 300 000 F CFA (2)');
  });

  it('« Passer » mène à la liste sans créer d’alerte', async () => {
    const user = await choisirMermozNgor150a300();
    const passer = screen.getAllByRole('button', { name: O.passer });
    expect(passer).toHaveLength(2); // la barre du téléphone et celle du bureau
    await user.click(passer[0]!);
    expect(push).toHaveBeenCalledWith('/properties');
    expect(creer).not.toHaveBeenCalled();
    expect(updateNotificationPreferences).not.toHaveBeenCalled();
  });

  it('à l’achat, le budget mensuel disparaît', async () => {
    const user = userEvent.setup();
    monter();
    expect(screen.getByRole('button', { name: T.tranches['moins-150'] })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: T.acheter }));
    expect(screen.queryByRole('button', { name: T.tranches['moins-150'] })).not.toBeInTheDocument();
  });

  it('« Autre » ajoute un quartier tapé, choisi d’office', async () => {
    const user = userEvent.setup();
    monter();
    await user.click(screen.getByRole('button', { name: T.autre }));
    await user.type(screen.getByRole('textbox', { name: T.autreLibelle }), 'Sacré-Cœur');
    await user.click(screen.getByRole('button', { name: T.ajouter }));
    expect(screen.getByRole('button', { name: 'Sacré-Cœur' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('WhatsApp : pas d’interrupteur quand la capacité est fermée (ou le canal verrouillé)', () => {
    monter(null);
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByText(T.whatsapp)).not.toBeInTheDocument();
  });

  it('WhatsApp ouvert et coupé : la préférence s’écrit au geste, à la valeur de l’interrupteur', async () => {
    const user = userEvent.setup();
    monter({ numero: '77 123 45 67' });
    const interrupteur = screen.getByRole('switch');
    expect(interrupteur).toBeChecked();
    await user.click(interrupteur);
    expect(updateNotificationPreferences).not.toHaveBeenCalled();
    await user.click(await voir());
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    expect(updateNotificationPreferences).toHaveBeenCalledWith('jeton', [{ event_type: 'saved_search_match', channel: 'whatsapp', enabled: false }]);
  });

  it('un échec de création est annoncé, et la liste ne s’ouvre pas', async () => {
    creer.mockRejectedValueOnce(new Error('422'));
    const user = await choisirMermozNgor150a300();
    await user.click(await voir());
    expect(await screen.findByRole('alert')).toHaveTextContent(T.erreurAlerte);
    expect(push).not.toHaveBeenCalled();
  });
});
