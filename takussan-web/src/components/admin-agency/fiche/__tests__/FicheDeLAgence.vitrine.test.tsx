import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('next/navigation', async () => (await import('./doublures')).navigation);
vi.mock('@/app/actions/admin-agency', async () => (await import('./doublures')).ACTIONS);
vi.mock('@/context/AuthContext', async () => (await import('./doublures')).auth);
vi.mock('@/hooks/useCan', async () => (await import('./doublures')).can);
vi.mock('@/lib/queries/kyc', async () => (await import('./doublures')).KYC);
vi.mock('@/lib/queries/admin-users', async (original) => ({ ...(await original<object>()), ...(await import('./doublures')).EQUIPE }));
vi.mock('@/lib/queries/agency-queues', async (original) => ({ ...(await original<object>()), ...(await import('./doublures')).fileDeModeration }));
vi.mock('@/lib/api', async (original) => ({ ...(await original<object>()), ...(await import('./doublures')).API }));

import fr from '@/messages/fr.json';
import type { Agency } from '@/types/agency';

import { ACTIONS, API, reinitialiserLesDoublures } from './doublures';
import { AGENCE, enregistrer, rendreLaFiche, type Utilisateur } from './outils';

/**
 * TCK-2524, porté sur la section « Fiche publique » de la fiche (TCK-2670) : compteurs, six biens
 * au plus refusés AVANT l'envoi (AC1), un 422 reposé sur son champ (AC1), l'aperçu de la couverture
 * qui suit la sélection (AC2), et « vider retire ».
 *
 * TCK-2670 — la vitrine n'a plus son propre enregistrement : elle part dans le `PATCH` unique de la
 * fiche, avec ses seules clés modifiées. Les VRAIS hooks de requête : seul `apiRequest` est doublé.
 */

const P = fr.admin.agencyPublicProfile;
const bien = (id: number, photo = true) => ({
  id,
  title: `Bien ${id}`,
  reference_number: `PR-${id}`,
  main_photo_url: photo ? `http://127.0.0.1:8002/storage/${id}-preview.webp` : null,
});
/** L'ordre de l'API : les plus récents d'abord. */
const PUBLICS = [bien(10), bien(11), bien(12), bien(13), bien(14), bien(15), bien(16), bien(17, false)];
/** Public et disponible, mais au-delà de la page reçue : seule une lecture par ids le rend. */
const HORS_PAGE = [bien(150)];

const ouvrir = (vitrine: Partial<Agency> = {}) => rendreLaFiche({ ...AGENCE, id: 1, tagline: null, highlights: [], showcase_property_ids: [], ...vitrine }, { section: 'publique', vitrine: true });
const accroche = () => screen.getByLabelText(/^Accroche/);
const raison = (n: number) => screen.getByLabelText(new RegExp(`^Raison ${n}`));
const couverture = () =>
  [...screen.getByTestId('apercu-couverture').querySelectorAll('[data-property-id]')].map((n) => Number(n.getAttribute('data-property-id')));
const choisir = (user: Utilisateur, id: number) => user.click(screen.getByRole('button', { name: `Ajouter « Bien ${id} » à la sélection` }));

beforeEach(() => {
  reinitialiserLesDoublures();
  API.apiRequest.mockImplementation(async (chemin: string) => {
    const ids = decodeURIComponent(chemin).match(/filter\[id\]=([^&]*)/)?.[1];
    if (ids) {
      const voulus = ids.split(',').map(Number);
      return { data: [...PUBLICS, ...HORS_PAGE].filter((b) => voulus.includes(b.id)), meta: { total: voulus.length } };
    }
    const recherche = decodeURIComponent(chemin).match(/filter\[search\]=([^&]*)/)?.[1];
    return { data: recherche ? PUBLICS.filter((b) => b.title.includes(recherche)) : PUBLICS, meta: { total: PUBLICS.length } };
  });
  ACTIONS.updateAgencyAction.mockResolvedValue({ ok: true, data: { ...AGENCE, id: 1, tagline: null, highlights: [], showcase_property_ids: [] } });
});

describe('Fiche de l’agence — la vitrine de la fiche publique (TCK-2524)', () => {
  it('ne demande que les biens PUBLICS et DISPONIBLES de l’agence, du plus récent au plus ancien', async () => {
    ouvrir();
    await screen.findByText('Bien 10');
    const chemin = API.apiRequest.mock.calls.map(([c]) => decodeURIComponent(c as string)).find((c) => c.startsWith('/api/properties?'))!;
    expect(chemin).toContain('filter[agency_id]=1');
    expect(chemin).toContain('filter[public]=1');
    expect(chemin).toContain('filter[status]=available');
    expect(chemin).toContain('sort=-published_at,-created_at,-id');
    expect(chemin).toContain('fields[properties]=id,title,reference_number');
  });

  it('compte les caractères de l’accroche et des raisons, bornés à 120 et 80', async () => {
    const user = userEvent.setup();
    ouvrir({ tagline: 'Depuis 2014.' });
    expect(accroche()).toHaveAttribute('maxlength', '120');
    expect(screen.getByText('12 / 120')).toBeInTheDocument();
    await user.type(accroche(), ' Dakar');
    expect(screen.getByText('18 / 120')).toBeInTheDocument();
    expect(raison(2)).toHaveAttribute('maxlength', '80');
    await user.type(raison(2), 'Wolof');
    expect(screen.getAllByText('5 / 80')).toHaveLength(1);
  });

  it('AC1 — une septième sélection est refusée avant l’envoi, et le dit', async () => {
    const user = userEvent.setup();
    ouvrir({ showcase_property_ids: [10, 11, 12, 13, 14, 15] });
    await screen.findByText('Bien 16');
    expect(screen.getByText('6 sur 6')).toBeInTheDocument();

    await choisir(user, 16);

    expect(screen.getByText('6 sur 6')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('6 biens au plus : retirez-en un pour en choisir un autre.');
    expect(document.querySelector('[data-slot="barre-de-la-fiche"]')).toBeNull();
  });

  it('AC1 — à six, retirer un bien rouvre le choix ; la sélection part seule', async () => {
    const user = userEvent.setup();
    ouvrir({ showcase_property_ids: [10, 11, 12, 13, 14, 15] });
    await screen.findByText('Bien 16');
    await user.click(screen.getByRole('button', { name: 'Retirer « Bien 12 » de la sélection' }));
    await choisir(user, 16);
    expect(screen.getByText('6 sur 6')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(await enregistrer(user)).toEqual({ showcase_property_ids: [10, 11, 13, 14, 15, 16] });
  });

  it('AC1 — un 422 de l’API s’affiche sur le champ visé, la ligne vide du milieu comptée', async () => {
    const user = userEvent.setup();
    ACTIONS.updateAgencyAction.mockResolvedValue({
      ok: false,
      status: 422,
      message: 'Les données sont invalides.',
      errors: {
        tagline: ['L’accroche ne peut pas dépasser 120 caractères.'],
        'highlights.1': ['Cette raison ne peut pas dépasser 80 caractères.'],
        'showcase_property_ids.0': ['Ce bien n’est pas un bien de votre agence.'],
      },
    });
    ouvrir({ tagline: 'Accroche', highlights: ['Un', '', 'Trois'], showcase_property_ids: [10] });
    await screen.findByText('Bien 11');
    await user.type(accroche(), ' du Plateau');
    await enregistrer(user);

    await waitFor(() => expect(accroche()).toHaveAttribute('aria-invalid', 'true'));
    expect(accroche()).toHaveAccessibleDescription(/L’accroche ne peut pas dépasser 120 caractères\./);
    // `highlights.1` est la DEUXIÈME raison envoyée : la troisième ligne de l'écran (la deuxième est vide).
    expect(raison(3)).toHaveAccessibleDescription(/Cette raison ne peut pas dépasser 80 caractères\./);
    expect(raison(2)).not.toHaveAttribute('aria-invalid');
    expect(screen.getByText('Ce bien n’est pas un bien de votre agence.')).toBeInTheDocument();
    // Tout est sur un champ : pas de bandeau générique en plus.
    expect(screen.queryByText('Les données sont invalides.')).not.toBeInTheDocument();
  });

  it('AC2 — l’aperçu de couverture suit la sélection et son ordre', async () => {
    const user = userEvent.setup();
    ouvrir();
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

  // Relevé de fidélité TCK-2670 — la fiche publique compte son portefeuille PUBLIC (`portfolio_count`,
  // `publicPortfolio` = public et disponible), le prédicat même de la liste de la vitrine. La colonne
  // dénormalisée `properties_count` comptait autre chose (tous les biens), et valait 0 sur la démo.
  it('l’aperçu compte les biens publics et disponibles (le total de la liste), jamais `properties_count`', async () => {
    ouvrir({ properties_count: 0 } as Partial<Agency>);
    const apercu = screen.getByTestId('apercu-fiche-publique');
    expect(await within(apercu).findByText(`${PUBLICS.length} biens`)).toBeInTheDocument();
    expect(within(apercu).queryByText('0 bien')).toBeNull();
  });

  it('l’aperçu montre l’accroche et les raisons tapées', async () => {
    const user = userEvent.setup();
    ouvrir();
    const apercu = screen.getByTestId('apercu-fiche-publique');
    await user.type(accroche(), 'On loue à Dakar.');
    await user.type(raison(1), 'Visites le samedi');
    expect(within(apercu).getByText('On loue à Dakar.')).toBeInTheDocument();
    expect(within(apercu).getByText('Visites le samedi')).toBeInTheDocument();
  });

  it('vider un champ le retire : tout vide part à null, dans le PATCH de la fiche', async () => {
    const user = userEvent.setup();
    ouvrir({ tagline: 'Avant', highlights: ['A'], showcase_property_ids: [10] });
    await screen.findByText('Bien 11');
    await user.clear(accroche());
    await user.clear(raison(1));
    await user.click(screen.getByRole('button', { name: 'Retirer « Bien 10 » de la sélection' }));
    expect(await enregistrer(user)).toEqual({ tagline: null, highlights: null, showcase_property_ids: null });
    expect(ACTIONS.updateAgencyAction).toHaveBeenCalledWith(1, { tagline: null, highlights: null, showcase_property_ids: null });
    expect(await screen.findByText(fr.admin.agencyConfig.successSaved)).toBeInTheDocument();
  });

  it('un bien de la sélection qui n’est plus public le dit, et la couverture ne le montre pas', async () => {
    ouvrir({ showcase_property_ids: [999, 10] });
    await screen.findByText('Bien 11');
    expect(await screen.findByText('Bien n° 999')).toBeInTheDocument();
    expect(screen.getByText(P.notPublicAnymore)).toBeInTheDocument();
    expect(couverture()).toEqual([10, 11, 12]);
  });

  it('un bien choisi au-delà de la page reçue se nomme par son id, et reste en tête de couverture', async () => {
    ouvrir({ showcase_property_ids: [150, 10] });
    expect(await screen.findByText('Bien 150')).toBeInTheDocument();
    await screen.findByText('Bien 11');
    expect(screen.queryByText('Bien n° 150')).not.toBeInTheDocument();
    expect(screen.queryByText(P.notPublicAnymore)).not.toBeInTheDocument();
    await waitFor(() => expect(couverture()).toEqual([150, 10, 11]));
    const lecture = API.apiRequest.mock.calls.map(([c]) => decodeURIComponent(c as string)).find((c) => c.includes('filter[id]='));
    expect(lecture).toContain('filter[id]=10,150');
    expect(lecture).toContain('filter[public]=1');
    expect(lecture).toContain('filter[status]=available');
    expect(lecture).toContain('filter[agency_id]=1');
  });

  it('la recherche passe par l’API (filter[search]), pas par un filtre sur la page reçue', async () => {
    const user = userEvent.setup();
    ouvrir();
    await screen.findByText('Bien 10');
    await user.type(screen.getByLabelText(P.pickLabel), '13');
    await waitFor(() =>
      expect(API.apiRequest.mock.calls.some(([c]) => decodeURIComponent(c as string).includes('filter[search]=13'))).toBe(true),
    );
    await waitFor(() => expect(screen.queryByText('Bien 12')).not.toBeInTheDocument());
  });

  it('aucun fieldset ne s’élargit à son contenu (min-width: min-content par défaut)', () => {
    // Mesuré à 390 px (TCK-2524) : sans `min-w-0`, la sélection portait son fieldset hors de la colonne.
    const { container } = ouvrir({ showcase_property_ids: [10] });
    const fieldsets = [...container.querySelectorAll('section[data-section="publique"] fieldset')];
    expect(fieldsets.length).toBeGreaterThanOrEqual(1);
    for (const f of fieldsets) expect(f).toHaveClass('min-w-0');
  });

  it('pointe vers la fiche publique de l’agence', () => {
    ouvrir();
    const liens = screen.getAllByRole('link', { name: P.viewPublic });
    expect(liens.every((l) => l.getAttribute('href') === '/agencies/dakar-immo')).toBe(true);
  });

  it('sans le droit de configurer (`vitrine` faux), ni section ni clé de vitrine', async () => {
    const user = userEvent.setup();
    rendreLaFiche({ ...AGENCE, tagline: 'Avant' }, { section: 'publique', vitrine: false });
    expect(screen.queryByRole('heading', { level: 2, name: fr.admin.agencyConfig.fiche.sections.publique.titre })).toBeNull();
    await user.type(document.getElementById('field-name') as HTMLInputElement, ' Plateau');
    expect(await enregistrer(user)).toEqual({ name: 'Dakar Immo Plateau' });
  });
});
