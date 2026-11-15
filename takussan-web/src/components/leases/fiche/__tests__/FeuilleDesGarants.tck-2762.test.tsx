import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import type { LeaseGuarantor } from '@/lib/queries/leases';

/**
 * TCK-2762 — la feuille des garants reprend la carte « Garants » (`GuarantorSection`) qui quitte la
 * fiche : chaque garant (nom, téléphone en lien `tel:` — TCK-913 —, adresse), l'ajout à qui gère le
 * bail, borné à trois (TCK-044), et rien d'écrit pour un lecteur.
 */
const { CREATION, MODIFICATION, FICHE } = vi.hoisted(() => ({
  CREATION: { mutateAsync: vi.fn(async (_v: unknown) => ({ data: {} })), isPending: false },
  MODIFICATION: { mutateAsync: vi.fn(async (_v: unknown) => ({ data: {} })), isPending: false },
  FICHE: {
    data: {
      data: {
        id: 2,
        first_name: 'Ousmane',
        last_name: 'Seck',
        full_name: 'Ousmane Seck',
        phone: '+221770000002',
        email: 'ousmane@exemple.sn',
        id_type: 'id_card',
        id_number_masked: '•••• 0123',
        occupation: 'Comptable',
        employer: null,
        monthly_income_masked: '••••',
        relationship_to_tenant: 'Oncle',
        notes: null,
        created_at: '2026-10-01T10:00:00+00:00',
        updated_at: '2026-10-01T10:00:00+00:00',
      },
    },
    isError: false,
    refetch: () => {},
  },
}));

vi.mock('@/lib/queries/leases', () => ({
  useCreateGuarantor: () => CREATION,
  useUpdateGuarantor: () => MODIFICATION,
  useGuarantor: () => FICHE,
}));

import { FeuilleDesGarants } from '../FeuilleDesGarants';

const garant = (id: number, prenom: string, nom: string): LeaseGuarantor => ({
  id,
  first_name: prenom,
  last_name: nom,
  phone: `+22177 000 00 0${id}`,
  email: `${prenom.toLowerCase()}@exemple.sn`,
  role: null,
});

const monter = (garants: LeaseGuarantor[], peutGerer: boolean, surLAjout = false) =>
  render(withIntl(<FeuilleDesGarants leaseId={42} garants={garants} peutGerer={peutGerer} ouverte surLAjout={surLAjout} onFermer={() => {}} />));

beforeEach(() => {
  CREATION.mutateAsync.mockClear();
  MODIFICATION.mutateAsync.mockClear();
});

describe('FeuilleDesGarants (TCK-2762)', () => {
  it('nomme chaque garant, son téléphone en lien d’appel et son adresse', () => {
    monter([garant(1, 'Awa', 'Diop'), garant(2, 'Ousmane', 'Seck')], true);
    const feuille = screen.getByTestId('feuille-des-garants');

    expect(within(feuille).getByText('Awa Diop')).toBeInTheDocument();
    expect(within(feuille).getByText('Ousmane Seck')).toBeInTheDocument();
    expect(within(feuille).getByRole('link', { name: '+22177 000 00 02' })).toHaveAttribute('href', 'tel:+221770000002');
    expect(within(feuille).getByText('awa@exemple.sn')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ajouter un garant' })).toBeEnabled();
  });

  it('au troisième garant, l’ajout se ferme et la feuille dit pourquoi', () => {
    monter([garant(1, 'Awa', 'Diop'), garant(2, 'Ousmane', 'Seck'), garant(3, 'Fatou', 'Sow')], true);

    expect(screen.getByRole('button', { name: 'Ajouter un garant' })).toBeDisabled();
    expect(screen.getByText('Maximum 3 garants atteint')).toBeInTheDocument();
  });

  it('un lecteur sans `abilities.update` voit le garant, sans geste d’écriture', () => {
    monter([garant(1, 'Awa', 'Diop')], false);

    expect(screen.getByText('Awa Diop')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ajouter un garant' })).toBeNull();
    expect(screen.queryByText(/Maximum 3 garants/)).toBeNull();
  });

  it('l’ajout se fait dans la feuille : le POST part, puis la feuille revient à la liste', async () => {
    const user = userEvent.setup();
    monter([garant(1, 'Awa', 'Diop')], true);

    await user.click(screen.getByRole('button', { name: 'Ajouter un garant' }));
    const formulaire = screen.getByTestId('formulaire-du-garant');
    await user.type(within(formulaire).getByLabelText(/^Prénom/), 'Ousmane');
    await user.type(within(formulaire).getByLabelText(/^Nom/), 'Seck');
    await user.click(screen.getByRole('button', { name: 'Ajouter' }));

    await waitFor(() => expect(CREATION.mutateAsync).toHaveBeenCalledTimes(1));
    expect(CREATION.mutateAsync.mock.calls[0]![0]).toMatchObject({ first_name: 'Ousmane', last_name: 'Seck' });
    await waitFor(() => expect(screen.getByTestId('feuille-des-garants')).toBeInTheDocument());
  });

  it('ouverte sur l’ajout (bail sans garant), elle montre le formulaire d’emblée', () => {
    monter([], true, true);

    expect(screen.getByTestId('formulaire-du-garant')).toBeInTheDocument();
  });});

describe('FeuilleDesGarants — la modification (TCK-2762, décision 1 a)', () => {
  const modifiable = (partiel: Partial<LeaseGuarantor> = {}): LeaseGuarantor => ({
    ...garant(2, 'Ousmane', 'Seck'),
    can_edit: true,
    id_on_file: true,
    leases_count: 1,
    ...partiel,
  });

  it('« Modifier » sur la seule ligne que l’API dit modifiable, avec l’état de sa pièce', () => {
    monter([garant(1, 'Awa', 'Diop'), modifiable()], true);

    expect(within(screen.getByTestId('garant-1')).queryByRole('button')).toBeNull();
    expect(within(screen.getByTestId('garant-1')).queryByText(/pièce d’identité/)).toBeNull();
    expect(within(screen.getByTestId('garant-2')).getByRole('button', { name: 'Modifier Ousmane Seck' })).toBeInTheDocument();
    expect(within(screen.getByTestId('garant-2')).getByText('pièce d’identité renseignée')).toBeInTheDocument();
  });

  it('une pièce absente se dit « manquante »', () => {
    monter([modifiable({ id_on_file: false })], true);

    expect(screen.getByText('pièce d’identité manquante')).toBeInTheDocument();
  });

  it('un renommage n’envoie que le nom : ni le revenu ni la pièce chiffrés ne s’écrasent', async () => {
    const user = userEvent.setup();
    monter([modifiable()], true);

    await user.click(screen.getByRole('button', { name: 'Modifier Ousmane Seck' }));
    const formulaire = screen.getByTestId('modification-du-garant');
    expect(within(formulaire).getByLabelText(/^Nom/)).toHaveValue('Seck');
    expect(within(formulaire).getByText('Enregistré : •••• 0123. Laissez vide pour le garder.')).toBeInTheDocument();
    await user.clear(within(formulaire).getByLabelText(/^Nom/));
    await user.type(within(formulaire).getByLabelText(/^Nom/), 'Sow');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(MODIFICATION.mutateAsync).toHaveBeenCalledTimes(1));
    expect(MODIFICATION.mutateAsync.mock.calls[0]![0]).toEqual({ last_name: 'Sow' });
    await waitFor(() => expect(screen.getByTestId('feuille-des-garants')).toBeInTheDocument());
  });

  it('un revenu tapé puis effacé ne part pas comme un 0', async () => {
    const user = userEvent.setup();
    monter([modifiable()], true);

    await user.click(screen.getByRole('button', { name: 'Modifier Ousmane Seck' }));
    const formulaire = screen.getByTestId('modification-du-garant');
    await user.type(within(formulaire).getByLabelText(/Revenu mensuel/), '5');
    await user.clear(within(formulaire).getByLabelText(/Revenu mensuel/));
    await user.type(within(formulaire).getByLabelText(/^Profession/), ' senior');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(MODIFICATION.mutateAsync).toHaveBeenCalledTimes(1));
    expect(MODIFICATION.mutateAsync.mock.calls[0]![0]).toEqual({ occupation: 'Comptable senior' });
  });

  it('le garant partagé : la feuille dit que la modification vaut pour ses autres baux', async () => {
    const user = userEvent.setup();
    monter([modifiable({ leases_count: 3 })], true);

    await user.click(screen.getByRole('button', { name: 'Modifier Ousmane Seck' }));
    expect(screen.getByTestId('garant-partage')).toHaveTextContent('Ce garant est aussi celui de 2 autres baux : la modification vaut pour tous.');
  });

  it('le garant d’un seul bail : rien à dire', async () => {
    const user = userEvent.setup();
    monter([modifiable()], true);

    await user.click(screen.getByRole('button', { name: 'Modifier Ousmane Seck' }));
    expect(screen.queryByTestId('garant-partage')).toBeNull();
  });
});
