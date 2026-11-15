import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import {
  approveProperty,
  fetchPropertyModerationDetail,
  rejectProperty,
  type ModerationProperty,
  type PropertyModerationDetail as Detail,
} from '@/lib/queries/property-moderation';
import { withIntl } from '@/test/intl';
import { PropertyModerationDetail } from '../PropertyModerationDetail';

/**
 * TCK-2673 — le bien à valider vu comme le public le verra (maquette `app-moderation` B, « Bien à
 * valider »). Le bien de démo est reproduit tel que l'API le sert (bien 352 de Dakar Immo, relevé
 * le 2026-11-12) : loyer mensuel, `apartment`, déposé par un bailleur, 4 photos sur 5 attendues,
 * adresse incomplète, aucune médiane comparable.
 */
vi.mock('@/lib/queries/property-moderation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/property-moderation')>()),
  approveProperty: vi.fn(),
  rejectProperty: vi.fn(),
  fetchPropertyModerationDetail: vi.fn(),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton' }) }));

const LIGNE = { id: 352, title: 'Appartement aux Mamelles' } as unknown as ModerationProperty;

const DEMO: Detail = {
  id: 352,
  reference_number: 'T-352',
  title: 'Appartement aux Mamelles',
  slug: null,
  status: 'pending',
  type: 'apartment',
  contract_type: 'rent',
  rent_period: 'monthly',
  price: 1_095_619,
  currency: 'XOF',
  area: 120,
  bedrooms: 3,
  bathrooms: 2,
  description: 'Bel appartement lumineux avec terrasse',
  photos: [1, 2, 3, 4].map((id) => ({ id, url: `https://exemple.test/p${id}.webp`, full_url: null })),
  address: { street: null, neighborhood: null, city: 'Dakar', region: null },
  agency_id: 7,
  submitted_at: null,
  submitted_by: { id: 9, name: 'Mouhamed Sene', profile: 'owner' },
  submitted_count_in_agency: 72,
  checks: {
    photos_count: 4,
    photos_expected: 5,
    address_complete: false,
    description_words: 6,
    description_has_contact: false,
    price_vs_median: null,
  },
};

function monter(detail: Detail = DEMO, telephone = false) {
  vi.mocked(fetchPropertyModerationDetail).mockResolvedValue({ data: detail } as never);
  const onModerated = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rendu = render(
    withIntl(
      <QueryClientProvider client={client}>
        <PropertyModerationDetail property={LIGNE} onModerated={onModerated} telephone={telephone} />
      </QueryClientProvider>,
    ),
  );
  return { onModerated, ...rendu };
}

describe('<PropertyModerationDetail> — TCK-2673', () => {
  beforeEach(() => {
    vi.mocked(approveProperty).mockReset();
    vi.mocked(rejectProperty).mockReset();
  });

  it('AC6 — prix en F CFA et sa période, type et profil en français ; ni « XOF » ni `apartment` dans le DOM', async () => {
    const { container } = monter();
    const prix = await screen.findByText((_, el) => el?.getAttribute('data-slot') === 'prix-du-bien');
    expect(prix.textContent?.replace(/\s/g, ' ')).toBe('1 095 619 F CFA/ mois'.replace(/\s/g, ' '));
    expect(screen.getByText('Appartement')).toBeInTheDocument();
    expect(within(container.querySelector('[data-slot="soumission"]') as HTMLElement).getByText(/Propriétaire/)).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/XOF/);
    expect(container.innerHTML).not.toMatch(/apartment/);
  });

  it('la soumission ne date rien sans `submitted_at`, et dit le rang du bien chez l’agence', async () => {
    const { container } = monter();
    const soumission = await screen.findByText((_, el) => el?.getAttribute('data-slot') === 'soumission');
    expect(soumission).toHaveTextContent('Mouhamed Sene');
    expect(soumission).toHaveTextContent('son 72ᵉ bien chez vous');
    expect(soumission).not.toHaveTextContent(/\ble\b \d/);
    expect(container.querySelector('[data-slot="soumission"]')).toBe(soumission);
  });

  it('la liste de contrôle compte ce qu’il faut voir, d’après les `checks` de l’API', async () => {
    monter();
    const liste = await screen.findByText((_, el) => el?.getAttribute('data-slot') === 'liste-de-controle');
    expect(liste).toHaveTextContent('2 points à voir');
    expect(liste).toHaveTextContent('4 photos seulement');
    expect(liste).toHaveTextContent('Adresse incomplète');
    expect(liste).toHaveTextContent('Description de 6 mots');
    expect(liste).toHaveTextContent('Prix sans comparaison');
  });

  it('un prix loin de la médiane du quartier est un point à voir', async () => {
    monter({
      ...DEMO,
      checks: { ...DEMO.checks, photos_count: 6, address_complete: true, price_vs_median: { median: 750_000, deviation_pct: 46.1, sample_size: 12 } },
    });
    const liste = await screen.findByText((_, el) => el?.getAttribute('data-slot') === 'liste-de-controle');
    expect(liste).toHaveTextContent('1 point à voir');
    expect(liste).toHaveTextContent(/Prix 46\s?% au-dessus de la médiane du quartier/);
    expect(liste).toHaveTextContent('Médiane de 12 biens comparables');
  });

  it('AC5 — « Demander une correction » reste inactif sans motif ou sous 20 caractères ; l’envoi part avec le motif et le texte', async () => {
    vi.mocked(rejectProperty).mockResolvedValue({} as never);
    const { onModerated } = monter();
    const user = userEvent.setup();
    const bouton = await screen.findByRole('button', { name: 'Demander une correction' });
    expect(bouton).toBeDisabled();

    // Un texte assez long, sans motif : toujours inactif.
    await user.type(screen.getByRole('textbox'), 'Le loyer dépasse les biens voisins.');
    expect(bouton).toBeDisabled();

    // Un motif, mais un texte trop court : inactif.
    await user.click(screen.getByRole('radio', { name: 'Prix incohérent' }));
    await user.clear(screen.getByRole('textbox'));
    await user.type(screen.getByRole('textbox'), 'Trop cher.');
    expect(bouton).toBeDisabled();
    expect(screen.getByText(/Envoyé à Mouhamed Sene · 20 caractères au moins · 10 saisis/)).toBeInTheDocument();

    await user.type(screen.getByRole('textbox'), ' Revoyez le loyer.');
    expect(bouton).toBeEnabled();
    await user.click(bouton);

    expect(rejectProperty).toHaveBeenCalledWith(352, { reasonCode: 'price', rejectionReason: 'Trop cher. Revoyez le loyer.' }, 'jeton');
    await vi.waitFor(() => expect(onModerated).toHaveBeenCalledWith('Correction demandée : le bien est renvoyé à son auteur.'));
  });

  it('« Publier » publie le bien et le dit', async () => {
    vi.mocked(approveProperty).mockResolvedValue({} as never);
    const { onModerated } = monter();
    await userEvent.click(await screen.findByRole('button', { name: 'Publier' }));
    expect(approveProperty).toHaveBeenCalledWith(352, 'jeton');
    await vi.waitFor(() => expect(onModerated).toHaveBeenCalledWith('Bien publié : il est en ligne.'));
  });

  it('téléphone — carrousel « 1 / 4 », et la correction s’écrit dans une feuille', async () => {
    vi.mocked(rejectProperty).mockResolvedValue({} as never);
    monter(DEMO, true);
    const user = userEvent.setup();
    expect(await screen.findByText('1 / 4')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Photo suivante' }));
    expect(screen.getByText('2 / 4')).toBeInTheDocument();

    // Aucun formulaire de correction avant d'ouvrir la feuille.
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Demander une correction' }));
    const feuille = await screen.findByRole('dialog');
    const envoyer = within(feuille).getByRole('button', { name: 'Envoyer la demande' });
    expect(envoyer).toBeDisabled();
    await user.click(within(feuille).getByRole('radio', { name: 'Photos floues ou trop peu nombreuses' }));
    await user.type(within(feuille).getByRole('textbox'), 'Ajoutez une photo de la cuisine, svp.');
    await user.click(envoyer);
    expect(rejectProperty).toHaveBeenCalledWith(352, { reasonCode: 'photos', rejectionReason: 'Ajoutez une photo de la cuisine, svp.' }, 'jeton');
  });
});
