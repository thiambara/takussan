import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';

/**
 * TCK-633 (lot E) — l'adaptateur entre le panneau de filtres et la primitive combobox du lot D.
 * Les hooks sont remplacés (leurs propres tests gardent le réseau) : ce fichier garde ce que le
 * panneau reçoit — un NOM canonique, ou `undefined` pour retirer — et s'écrit par rôles ARIA, pour
 * survivre à une primitive réécrite.
 */

vi.mock('@/lib/queries/referentiel-public', () => ({
  useVillesDuReferentiel: () => ({
    data: {
      data: [
        { id: 1, region_id: 1, name: 'Dakar', slug: 'dakar', latitude: 14.7, longitude: -17.45 },
        { id: 2, region_id: 2, name: 'Thiès', slug: 'thies', latitude: 14.79, longitude: -16.93 },
      ],
    },
  }),
  useQuartiersDuReferentiel: (villeId: number | null) => ({
    data: villeId === 1
      ? {
          data: [
            { id: 10, city_id: 1, name: 'Almadies', slug: 'almadies', latitude: null, longitude: null, status: 'approved' },
            { id: 11, city_id: 1, name: 'Liberté 4', slug: 'liberte-4', latitude: null, longitude: null, status: 'approved' },
          ],
        }
      : undefined,
  }),
  useEquipementsApprouves: () => ({
    data: {
      data: [
        { id: 3, name: 'Piscine', slug: 'piscine' },
        { id: 4, name: 'Parking', slug: 'parking' },
        // Proposé par un annonceur puis approuvé : son slug n'est pas une clé du catalogue.
        { id: 5, name: 'Jardin potager', slug: 'jardin-potager' },
      ],
    },
  }),
}));

const { ChoixDeVille, ChoixDeQuartier, ChoixDEquipements } = await import('../ChoixDuReferentiel');

describe('TCK-633 — ChoixDeVille', () => {
  it('rend le NOM canonique choisi dans la liste', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(withIntl(<ChoixDeVille valeur={undefined} onChange={onChange} />));

    await user.type(screen.getByRole('combobox', { name: 'Ville' }), 'Thi');
    await user.click(await screen.findByRole('option', { name: 'Thiès' }));

    expect(onChange).toHaveBeenLastCalledWith('Thiès');
  });

  it('une ville de l’URL hors référentiel reste affichée, et se retire', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(withIntl(<ChoixDeVille valeur="Saly" onChange={onChange} />));

    expect(screen.getByRole('combobox', { name: 'Ville' })).toHaveValue('Saly');
    await user.click(screen.getByRole('button', { name: 'Retirer la ville' }));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('sans ville, aucun bouton de retrait', () => {
    render(withIntl(<ChoixDeVille valeur={undefined} onChange={vi.fn()} />));
    expect(screen.queryByRole('button', { name: 'Retirer la ville' })).not.toBeInTheDocument();
  });
});

describe('TCK-633 — ChoixDeQuartier', () => {
  it('est inactif tant qu’aucune ville n’est choisie', () => {
    render(withIntl(<ChoixDeQuartier ville={undefined} valeur={undefined} onChange={vi.fn()} />));
    expect(screen.getByRole('combobox', { name: 'Quartier' })).toBeDisabled();
  });

  it('propose les quartiers de la ville, retrouvée par son nom quelle qu’en soit la casse', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(withIntl(<ChoixDeQuartier ville="dakar" valeur={undefined} onChange={onChange} />));

    await user.type(screen.getByRole('combobox', { name: 'Quartier' }), 'Alma');
    await user.click(await screen.findByRole('option', { name: 'Almadies' }));

    expect(onChange).toHaveBeenLastCalledWith('Almadies');
  });
});

describe('TCK-633 — ChoixDEquipements', () => {
  it('ajoute un équipement du catalogue à ceux déjà choisis', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(withIntl(<ChoixDEquipements valeurs={['Parking']} onChange={onChange} />));

    await user.type(screen.getByRole('combobox', { name: 'Équipements' }), 'Pis');
    await user.click(await screen.findByRole('option', { name: 'Piscine' }));

    expect(onChange).toHaveBeenLastCalledWith(['Parking', 'Piscine']);
  });

  it('retire un équipement choisi par le bouton de sa puce', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(withIntl(<ChoixDEquipements valeurs={['Parking', 'Piscine']} onChange={onChange} />));

    await user.click(screen.getByRole('button', { name: 'Retirer Parking' }));

    expect(onChange).toHaveBeenLastCalledWith(['Piscine']);
  });
});

/**
 * TCK-633 (lot E, correction après vérification) — les équipements du CATALOGUE se lisent dans la
 * langue de l'écran (`libelleEquipement`, lot D) ; la valeur rendue au panneau reste le NOM
 * canonique, que la recherche compare. Un équipement proposé par un annonceur, ou inconnu du
 * catalogue (lien ancien), s'affiche tel quel.
 */
describe('TCK-633 — ChoixDEquipements traduit le catalogue', () => {
  it('en anglais, la liste propose « Swimming pool » et rend « Piscine »', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(withIntl(<ChoixDEquipements valeurs={[]} onChange={onChange} />, 'en'));

    await user.type(screen.getByRole('combobox', { name: 'Amenities' }), 'pool');
    await user.click(await screen.findByRole('option', { name: 'Swimming pool' }));

    expect(onChange).toHaveBeenLastCalledWith(['Piscine']);
  });

  it('en wolof, un équipement choisi se lit dans sa traduction', () => {
    render(withIntl(<ChoixDEquipements valeurs={['Piscine']} onChange={vi.fn()} />, 'wo'));
    expect(screen.getByText('Pisin')).toBeInTheDocument();
    expect(screen.queryByText('Piscine')).not.toBeInTheDocument();
  });

  it('un équipement proposé par un annonceur, ou hors catalogue, s’affiche tel quel', () => {
    render(withIntl(<ChoixDEquipements valeurs={['Jardin potager', 'Hammam maison']} onChange={vi.fn()} />, 'en'));
    expect(screen.getByText('Jardin potager')).toBeInTheDocument();
    expect(screen.getByText('Hammam maison')).toBeInTheDocument();
  });

  it('le retrait d’une puce traduite rend la liste des NOMS canoniques', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(withIntl(<ChoixDEquipements valeurs={['Piscine', 'Parking']} onChange={onChange} />, 'en'));

    await user.click(screen.getByRole('button', { name: /Swimming pool/ }));

    expect(onChange).toHaveBeenLastCalledWith(['Parking']);
  });
});
