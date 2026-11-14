/**
 * TCK-2785 — la sonde de doublon dit quand elle ne peut plus vérifier. Le 429 du seau épuisé (vingt
 * identités complètes par heure et par personne, TCK-2590) rendait une liste vide, exactement comme
 * « aucun doublon » : l'agent poursuivait en croyant le contact neuf. La sonde a désormais trois états
 * — rien trouvé, trouvé, vérification impossible (429 et son attente, ou autre) — et la création le dit
 * dans une ligne neutre, sans bloquer l'envoi.
 */
import { focusManager, onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';
import { createQueryClient } from '@/lib/query-client';
import { withIntl } from '@/test/intl';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/app/customers',
  useSearchParams: () => new URLSearchParams(),
}));
const api = vi.hoisted(() => ({ lire: vi.fn() }));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: api.lire,
}));
vi.mock('@/app/actions/dashboard-customers', () => ({
  createCustomerAction: vi.fn(),
  updateCustomerAction: vi.fn(),
}));

import { CreationDuClient } from '../CreationDuClient';

function ouvrir(client: QueryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return render(withIntl(<QueryClientProvider client={client}>
    <CreationDuClient open onClose={vi.fn()} />
  </QueryClientProvider>));
}

/** Le bureau (dès `xl`) : un seul panneau, et « Créer la fiche » au pied. */
function bureau() {
  vi.spyOn(window, 'matchMedia').mockImplementation((q: string) => ({
    matches: q.includes('80rem'),
    media: q,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }) as unknown as MediaQueryList);
}

const sondes = () => api.lire.mock.calls.filter(([chemin]) => String(chemin).startsWith('/api/customers/duplicates'));

/** Le 429 générique du limiteur (`bootstrap/app.php`) : même corps que la fiche soit masquée ou libre. */
const trop = (retryAfter?: number) => new ApiError(429, { message: 'Too Many Attempts.', code: 'too_many_requests', ...(retryAfter !== undefined ? { retry_after: retryAfter } : {}) });

const PAUSE = /La vérification des doublons est en pause/;
const IMPOSSIBLE = 'La vérification des doublons n’a pas pu se faire. Vous pouvez enregistrer la fiche.';
const ALERTE = 'Déjà dans vos clients';

beforeEach(() => {
  // Seul `Date` est figé : la temporisation de la sonde court toujours.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-14T14:00:00Z'));
  api.lire.mockReset();
  bureau();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function saisir(user: ReturnType<typeof userEvent.setup>, telephone: string) {
  await user.type(screen.getByLabelText(/Prénom/), 'Astou');
  await user.type(screen.getByLabelText(/^Nom/), 'Mbengue');
  await user.type(screen.getByLabelText('Téléphone'), telephone);
}

describe('la sonde au seau épuisé ne se fait plus passer pour « aucun doublon »', () => {
  it('429 {retry_after: 1800} : la ligne dit la reprise 30 minutes plus tard, à l’heure de Dakar, sans alerte de doublon (AC1)', async () => {
    api.lire.mockRejectedValue(trop(1800));
    const user = userEvent.setup();
    ouvrir();
    await saisir(user, '70 648 20 56');
    expect(await screen.findByText('La vérification des doublons est en pause jusqu’à 14:30 (heure de Dakar). Vous pouvez enregistrer la fiche.')).toBeInTheDocument();
    expect(screen.queryByText(ALERTE)).toBeNull();
    expect(screen.queryByText(IMPOSSIBLE)).toBeNull();
    // Une ligne neutre : le champ du téléphone ne prend pas la bordure d'alerte du doublon.
    expect(screen.getByLabelText('Téléphone').className).not.toContain('border-warning');
  });

  it('429 sans retry_after : la ligne de pause, sans heure', async () => {
    api.lire.mockRejectedValue(trop());
    const user = userEvent.setup();
    ouvrir();
    await saisir(user, '70 648 20 56');
    expect(await screen.findByText('La vérification des doublons est en pause pour le moment. Vous pouvez enregistrer la fiche.')).toBeInTheDocument();
    expect(screen.queryByText(/jusqu’à/)).toBeNull();
    expect(screen.queryByText(ALERTE)).toBeNull();
  });

  it('la ligne du 429 ne dépend pas de la saisie : le même texte pour un numéro et pour un e-mail', async () => {
    api.lire.mockRejectedValue(trop(1800));
    const user = userEvent.setup();
    ouvrir();
    await saisir(user, '77 000 00 01');
    const avecNumero = (await screen.findByText(PAUSE)).textContent;
    await user.clear(screen.getByLabelText('Téléphone'));
    await user.click(screen.getByRole('button', { name: /e-mail/i }));
    await user.type(screen.getByLabelText(/E-mail/), 'cache@exemple.sn');
    await waitFor(() => expect(sondes().some(([c]) => String(c).includes('email='))).toBe(true));
    expect((await screen.findByText(PAUSE)).textContent).toBe(avecNumero);
  });

  it('200 {data: []} : ni ligne ni alerte, comme avant (AC2)', async () => {
    api.lire.mockResolvedValue({ data: [] });
    const user = userEvent.setup();
    ouvrir();
    await saisir(user, '70 648 20 56');
    await waitFor(() => expect(sondes()).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText(PAUSE)).toBeNull();
    expect(screen.queryByText(IMPOSSIBLE)).toBeNull();
    expect(screen.queryByText(ALERTE)).toBeNull();
  });

  it.each([
    ['une 500', () => new ApiError(500, { message: 'Server Error' })],
    ['une erreur réseau', () => new TypeError('Failed to fetch')],
  ])('%s : « vérification impossible », sans heure, et jamais déguisée en 429 (AC3)', async (_cas, erreur) => {
    api.lire.mockRejectedValue(erreur());
    const user = userEvent.setup();
    ouvrir();
    await saisir(user, '70 648 20 56');
    expect(await screen.findByText(IMPOSSIBLE)).toBeInTheDocument();
    expect(screen.queryByText(PAUSE)).toBeNull();
    expect(screen.queryByText(ALERTE)).toBeNull();
  });

  it.each([
    ['429', () => trop(1800), PAUSE],
    ['500', () => new ApiError(500, {}), IMPOSSIBLE],
    ['réseau', () => new TypeError('Failed to fetch'), IMPOSSIBLE],
  ] as const)('« Créer la fiche » reste actif sur %s (AC4)', async (_cas, erreur, ligne) => {
    api.lire.mockRejectedValue(erreur());
    const user = userEvent.setup();
    ouvrir();
    await saisir(user, '70 648 20 56');
    await screen.findByText(ligne);
    expect(screen.getByRole('button', { name: 'Créer la fiche' })).toBeEnabled();
  });
});

describe('un 429 ne se relance pas tout seul (AC5)', () => {
  afterEach(() => {
    focusManager.setFocused(undefined);
    onlineManager.setOnline(true);
  });

  it('ni relance, ni retour au premier plan, ni retour du réseau : aucun appel sans nouvelle saisie ; la suivante sonde et rend la normale', async () => {
    api.lire.mockRejectedValueOnce(trop(1800));
    const user = userEvent.setup();
    // Le client de PRODUCTION, pas celui des tests (`retry: false`) : c'est sa politique qui est jugée.
    ouvrir(createQueryClient());
    await saisir(user, '70 648 20 56');
    await screen.findByText(PAUSE);
    expect(sondes()).toHaveLength(1);

    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
      onlineManager.setOnline(false);
      onlineManager.setOnline(true);
    });
    await new Promise((r) => setTimeout(r, 1500));
    expect(sondes()).toHaveLength(1);
    expect(screen.getByText(PAUSE)).toBeInTheDocument();

    // L'attente passée, la saisie suivante sonde, et le seau rempli répond : retour à la normale.
    vi.setSystemTime(new Date('2026-11-14T14:31:00Z'));
    api.lire.mockResolvedValue({ data: [] });
    await user.type(screen.getByLabelText('Téléphone'), '{Backspace}7');
    await waitFor(() => expect(sondes()).toHaveLength(2));
    await waitFor(() => expect(screen.queryByText(PAUSE)).toBeNull());
    expect(screen.queryByText(IMPOSSIBLE)).toBeNull();
    expect(screen.queryByText(ALERTE)).toBeNull();
  });
});
