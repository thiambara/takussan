import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';

/**
 * TCK-2524 — le bloc « Fiche publique » : compteurs, six biens au plus refusés AVANT l'envoi (AC1),
 * un 422 reposé sur son champ (AC1), l'aperçu de la couverture qui suit la sélection (AC2), et
 * « vider retire ».
 *
 * Les VRAIS hooks de requête (`useApiQuery` sur un `QueryClient` de test) : seul `apiRequest` est
 * doublé, et il rend la page de biens publics selon la recherche demandée.
 */
const ROUTEUR = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ROUTEUR }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton', user: { id: 2 } }) }));
const ACTION = vi.hoisted(() => ({ updateAgencyVitrineAction: vi.fn() }));
vi.mock('@/app/actions/admin-agency', () => ACTION);
const API = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock('@/lib/api', async (importOriginal) => ({ ...(await importOriginal<object>()), apiRequest: API.apiRequest }));

import { AgencyPublicProfileCard } from '../AgencyPublicProfileCard';

const bien = (id: number, photo = true) => ({
  id,
  title: `Bien ${id}`,
  reference_number: `PR-${id}`,
  main_photo_url: photo ? `http://127.0.0.1:8002/storage/${id}-preview.webp` : null,
});
/** L'ordre de l'API : les plus récents d'abord. */
const PUBLICS = [bien(10), bien(11), bien(12), bien(13), bien(14), bien(15), bien(16), bien(17, false)];
/** Public et disponible, mais au-delà de la page reçue (le 150e bien) : seule une lecture par ids le rend. */
const HORS_PAGE = [bien(150)];

function rendre(agence: Partial<Parameters<typeof AgencyPublicProfileCard>[0]['agency']> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      {withIntl(
        <AgencyPublicProfileCard
          agency={{ id: 1, name: 'Dakar Immo', slug: 'dakar-immo', tagline: null, highlights: [], showcase_property_ids: [], ...agence }}
        />,
      )}
    </QueryClientProvider>,
  );
}

const couverture = () =>
  [...screen.getByTestId('apercu-couverture').querySelectorAll('[data-property-id]')].map((n) => Number(n.getAttribute('data-property-id')));
const choisir = async (user: ReturnType<typeof userEvent.setup>, id: number) =>
  user.click(screen.getAllByRole('checkbox').find((c) => c.closest('label')?.textContent?.includes(`Bien ${id}PR`))!);

beforeEach(() => {
  vi.clearAllMocks();
  API.apiRequest.mockImplementation(async (chemin: string) => {
    const ids = decodeURIComponent(chemin).match(/filter\[id\]=([^&]*)/)?.[1];
    if (ids) {
      const voulus = ids.split(',').map(Number);
      return { data: [...PUBLICS, ...HORS_PAGE].filter((b) => voulus.includes(b.id)), meta: { total: voulus.length } };
    }
    const recherche = decodeURIComponent(chemin).match(/filter\[search\]=([^&]*)/)?.[1];
    return { data: recherche ? PUBLICS.filter((b) => b.title.includes(recherche)) : PUBLICS, meta: { total: PUBLICS.length } };
  });
  ACTION.updateAgencyVitrineAction.mockResolvedValue({ ok: true, data: { id: 1, tagline: null, highlights: [], showcase_property_ids: [] } });
});

describe('AgencyPublicProfileCard — la vitrine de la fiche publique (TCK-2524)', () => {
  it('ne demande que les biens PUBLICS et DISPONIBLES de l’agence, du plus récent au plus ancien', async () => {
    rendre();
    await screen.findByText('Bien 10');
    const chemin = decodeURIComponent(API.apiRequest.mock.calls[0][0] as string);
    expect(chemin).toContain('/api/properties?');
    expect(chemin).toContain('filter[agency_id]=1');
    expect(chemin).toContain('filter[public]=1');
    expect(chemin).toContain('filter[status]=available');
    expect(chemin).toContain('sort=-published_at,-created_at,-id');
    expect(chemin).toContain('fields[properties]=id,title,reference_number');
  });

  it('compte les caractères de l’accroche et des raisons, bornés à 120 et 80', async () => {
    const user = userEvent.setup();
    rendre({ tagline: 'Depuis 2014.' });
    const accroche = screen.getByLabelText('Accroche');
    expect(accroche).toHaveAttribute('maxlength', '120');
    expect(screen.getByText('12 / 120')).toBeInTheDocument();
    await user.type(accroche, ' Dakar');
    expect(screen.getByText('18 / 120')).toBeInTheDocument();
    const raison = screen.getByLabelText('Raison 2');
    expect(raison).toHaveAttribute('maxlength', '80');
    await user.type(raison, 'Wolof');
    expect(screen.getAllByText('5 / 80')).toHaveLength(1);
  });

  it('AC1 — une septième sélection est refusée avant l’envoi, et le dit', async () => {
    const user = userEvent.setup();
    rendre({ showcase_property_ids: [10, 11, 12, 13, 14, 15] });
    await screen.findByText('Bien 16');
    expect(screen.getByText('6 sur 6')).toBeInTheDocument();

    await choisir(user, 16);

    expect(screen.getByText('6 sur 6')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('6 biens au plus : retirez-en un pour en choisir un autre.');
    const sixieme = screen.getAllByRole('checkbox').find((c) => c.closest('label')?.textContent?.includes('Bien 16PR'))!;
    expect(sixieme).not.toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Enregistrer la fiche publique' }));
    await waitFor(() => expect(ACTION.updateAgencyVitrineAction).toHaveBeenCalledOnce());
    expect(ACTION.updateAgencyVitrineAction.mock.calls[0][1].showcase_property_ids).toEqual([10, 11, 12, 13, 14, 15]);
  });

  it('AC1 — à six, retirer un bien rouvre le choix', async () => {
    const user = userEvent.setup();
    rendre({ showcase_property_ids: [10, 11, 12, 13, 14, 15] });
    await screen.findByText('Bien 16');
    await user.click(screen.getByRole('button', { name: 'Retirer « Bien 12 » de la sélection' }));
    await choisir(user, 16);
    expect(screen.getByText('6 sur 6')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('AC1 — un 422 de l’API s’affiche sur le champ visé, la ligne vide du milieu comptée', async () => {
    const user = userEvent.setup();
    ACTION.updateAgencyVitrineAction.mockResolvedValue({
      ok: false,
      status: 422,
      message: 'Les données sont invalides.',
      errors: {
        tagline: ['L’accroche ne peut pas dépasser 120 caractères.'],
        'highlights.1': ['Cette raison ne peut pas dépasser 80 caractères.'],
        'showcase_property_ids.0': ['Ce bien n’est pas un bien de votre agence.'],
      },
    });
    rendre({ tagline: 'Accroche', highlights: ['Un', '', 'Trois'], showcase_property_ids: [10] });
    await screen.findByText('Bien 11');
    await user.click(screen.getByRole('button', { name: 'Enregistrer la fiche publique' }));

    const accroche = screen.getByLabelText('Accroche');
    await waitFor(() => expect(accroche).toHaveAttribute('aria-invalid', 'true'));
    expect(accroche).toHaveAccessibleDescription(/L’accroche ne peut pas dépasser 120 caractères\./);
    // `highlights.1` est la DEUXIÈME raison envoyée : la troisième ligne de l'écran (la deuxième est vide).
    expect(screen.getByLabelText('Raison 3')).toHaveAccessibleDescription(/Cette raison ne peut pas dépasser 80 caractères\./);
    expect(screen.getByLabelText('Raison 2')).not.toHaveAttribute('aria-invalid');
    expect(screen.getByText('Ce bien n’est pas un bien de votre agence.')).toBeInTheDocument();
    // Tout est sur un champ : pas de bandeau générique en plus.
    expect(screen.queryByText('Les données sont invalides.')).not.toBeInTheDocument();
  });

  it('AC2 — l’aperçu de couverture suit la sélection et son ordre', async () => {
    const user = userEvent.setup();
    rendre();
    await screen.findByText('Bien 10');
    expect(couverture()).toEqual([10, 11, 12]);

    await choisir(user, 15);
    expect(couverture()).toEqual([15, 10, 11]);

    await choisir(user, 13);
    expect(couverture()).toEqual([15, 13, 10]);

    await user.click(screen.getByRole('button', { name: 'Monter « Bien 13 »' }));
    expect(couverture()).toEqual([13, 15, 10]);

    await user.click(screen.getByRole('button', { name: 'Retirer « Bien 15 » de la sélection' }));
    expect(couverture()).toEqual([13, 10, 11]);
  });

  it('l’aperçu montre l’accroche et les raisons tapées', async () => {
    const user = userEvent.setup();
    rendre();
    const apercu = screen.getByTestId('apercu-fiche-publique');
    await user.type(screen.getByLabelText('Accroche'), 'On loue à Dakar.');
    await user.type(screen.getByLabelText('Raison 1'), 'Visites le samedi');
    expect(within(apercu).getByText('On loue à Dakar.')).toBeInTheDocument();
    expect(within(apercu).getByText('Visites le samedi')).toBeInTheDocument();
  });

  it('vider un champ le retire : tout vide part à null', async () => {
    const user = userEvent.setup();
    rendre({ tagline: 'Avant', highlights: ['A'], showcase_property_ids: [10] });
    await screen.findByText('Bien 11');
    await user.clear(screen.getByLabelText('Accroche'));
    await user.clear(screen.getByLabelText('Raison 1'));
    await user.click(screen.getByRole('button', { name: 'Retirer « Bien 10 » de la sélection' }));
    await user.click(screen.getByRole('button', { name: 'Enregistrer la fiche publique' }));
    await waitFor(() => expect(ACTION.updateAgencyVitrineAction).toHaveBeenCalledWith(1, {
      tagline: null,
      highlights: null,
      showcase_property_ids: null,
    }));
    expect(await screen.findByText('Fiche publique enregistrée.')).toBeInTheDocument();
  });

  it('un bien de la sélection qui n’est plus public le dit, et se retire', async () => {
    rendre({ showcase_property_ids: [999, 10] });
    await screen.findByText('Bien 11');
    expect(screen.getByText('Bien n° 999')).toBeInTheDocument();
    expect(screen.getByText('N’est plus en ligne : la fiche ne le montre pas.')).toBeInTheDocument();
    expect(couverture()).toEqual([10, 11, 12]);
  });

  it('un bien choisi au-delà de la page reçue se nomme par son id, et reste en tête de couverture', async () => {
    rendre({ showcase_property_ids: [150, 10] });
    expect(await screen.findByText('Bien 150')).toBeInTheDocument();
    await screen.findByText('Bien 11');
    expect(screen.queryByText('Bien n° 150')).not.toBeInTheDocument();
    expect(screen.queryByText('N’est plus en ligne : la fiche ne le montre pas.')).not.toBeInTheDocument();
    await waitFor(() => expect(couverture()).toEqual([150, 10, 11]));
    const lecture = API.apiRequest.mock.calls.map(([c]) => decodeURIComponent(c as string)).find((c) => c.includes('filter[id]='));
    expect(lecture).toContain('filter[id]=10,150');
    // Même prédicat que la liste : un id que la lecture ne rend pas n'est plus montrable.
    expect(lecture).toContain('filter[public]=1');
    expect(lecture).toContain('filter[status]=available');
    expect(lecture).toContain('filter[agency_id]=1');
  });

  it('la recherche passe par l’API (filter[search]), pas par un filtre sur la page reçue', async () => {
    const user = userEvent.setup();
    rendre();
    await screen.findByText('Bien 10');
    await user.type(screen.getByLabelText('Choisir parmi vos biens publics'), '13');
    await waitFor(() =>
      expect(API.apiRequest.mock.calls.some(([c]) => decodeURIComponent(c as string).includes('filter[search]=13'))).toBe(true),
    );
    await waitFor(() => expect(screen.queryByText('Bien 12')).not.toBeInTheDocument());
  });

  it('aucun fieldset ne s’élargit à son contenu (min-width: min-content par défaut)', () => {
    // Mesuré à 390 px : sans `min-w-0`, la sélection portait son fieldset à 429 px dans une colonne de
    // 310 px, et `main` défilait de côté (469 contre 390). jsdom ne calcule pas la mise en page :
    // la règle est épinglée sur la classe qui la tient.
    const { container } = rendre({ showcase_property_ids: [10] });
    const fieldsets = [...container.querySelectorAll('fieldset')];
    expect(fieldsets.length).toBeGreaterThanOrEqual(2);
    for (const f of fieldsets) expect(f).toHaveClass('min-w-0');
  });

  it('pointe vers la fiche publique de l’agence', () => {
    rendre();
    expect(screen.getByRole('link', { name: 'Voir ma fiche publique' })).toHaveAttribute('href', '/agencies/dakar-immo');
  });
});
