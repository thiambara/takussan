import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  Combobox,
  ComboboxMultiple,
  replierPourIdentite,
  replierPourRecherche,
  type OptionDeListe,
} from '../combobox';

/**
 * TCK-633 — la liste à recherche du formulaire du bien. Ce qu'on éprouve est ce que la
 * recherche de Base UI ne fait pas : l'accent replié pour TROUVER, la casse seule pour décider
 * qu'un nom EXISTE déjà, et Entrée qui choisit l'existant avant de créer.
 */
const QUARTIERS: OptionDeListe[] = [
  { value: '1', label: 'Liberté 4' },
  { value: '2', label: 'Mermoz' },
  { value: '3', label: 'Médina' },
  { value: '4', label: 'Grand Yoff' },
];

function Simple({ surChoix, surCreation }: { surChoix: (o: OptionDeListe | null) => void; surCreation: (t: string) => void }) {
  const [valeur, setValeur] = useState<string | null>(null);
  return (
    <Combobox
      label="Quartier"
      options={QUARTIERS}
      value={valeur}
      onChange={(o) => {
        setValeur(o?.value ?? null);
        surChoix(o);
      }}
      aucunResultat="Aucun résultat"
      creation={{ libelle: (t) => `Ajouter « ${t} »`, surCreation }}
    />
  );
}

function Libre() {
  const [texte, setTexte] = useState('');
  const [valeur, setValeur] = useState<string | null>(null);
  return (
    <Combobox
      label="Quartier"
      options={QUARTIERS}
      value={valeur}
      onChange={(o) => setValeur(o?.value ?? null)}
      aucunResultat="Aucun résultat"
      saisieLibre={{ texte, surSaisie: setTexte }}
    />
  );
}

function Multiple({ surCreation }: { surCreation: (t: string) => void }) {
  const [valeurs, setValeurs] = useState<OptionDeListe[]>([]);
  return (
    <ComboboxMultiple
      label="Équipements"
      options={[{ value: '10', label: 'Piscine' }, { value: '11', label: 'Climatisation' }]}
      valeurs={valeurs}
      onChange={setValeurs}
      aucunResultat="Aucun équipement"
      retirer={(nom) => `Retirer ${nom}`}
      creation={{ libelle: (t) => `Ajouter « ${t} »`, surCreation }}
    />
  );
}

describe('replis', () => {
  it('la recherche replie les accents, les espaces et la casse', () => {
    expect(replierPourRecherche('  Liberté   4 ')).toBe('liberte 4');
  });

  it('la recherche replie aussi tirets et apostrophes, comme le résolveur du serveur (TCK-788)', () => {
    expect(replierPourRecherche('Grand-Yoff')).toBe(replierPourRecherche('Grand Yoff'));
    expect(replierPourRecherche('Cité d’Arafat')).toBe('cite d arafat');
    expect(replierPourRecherche("Cité d'Arafat")).toBe('cite d arafat');
  });

  it("l'identité ne replie QUE la casse et les espaces — comme l'index du serveur", () => {
    expect(replierPourIdentite('LIBERTÉ  4')).toBe('liberté 4');
    expect(replierPourIdentite('Liberte 4')).not.toBe(replierPourIdentite('Liberté 4'));
  });
});

describe('<Combobox>', () => {
  it('une recherche sans accent trouve le nom accentué', async () => {
    const user = userEvent.setup();
    render(<Simple surChoix={vi.fn()} surCreation={vi.fn()} />);

    await user.type(screen.getByLabelText('Quartier'), 'medina');

    expect(await screen.findByRole('option', { name: 'Médina' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Mermoz' })).not.toBeInTheDocument();
  });

  it('un clic choisit, et le champ affiche le choix', async () => {
    const user = userEvent.setup();
    const surChoix = vi.fn();
    render(<Simple surChoix={surChoix} surCreation={vi.fn()} />);

    await user.type(screen.getByLabelText('Quartier'), 'merm');
    await user.click(await screen.findByRole('option', { name: 'Mermoz' }));

    expect(surChoix).toHaveBeenLastCalledWith({ value: '2', label: 'Mermoz' });
    expect(screen.getByLabelText('Quartier')).toHaveValue('Mermoz');
  });

  it('Entrée sur un nom absent CRÉE', async () => {
    const user = userEvent.setup();
    const surCreation = vi.fn();
    render(<Simple surChoix={vi.fn()} surCreation={surCreation} />);

    await user.type(screen.getByLabelText('Quartier'), 'Cité Keur Gorgui');
    expect(await screen.findByRole('option', { name: 'Ajouter « Cité Keur Gorgui »' })).toBeInTheDocument();
    await user.keyboard('{Enter}');

    expect(surCreation).toHaveBeenCalledWith('Cité Keur Gorgui');
  });

  it('aucune création pour un nom identique à la casse près', async () => {
    const user = userEvent.setup();
    render(<Simple surChoix={vi.fn()} surCreation={vi.fn()} />);

    await user.type(screen.getByLabelText('Quartier'), 'MERMOZ');

    expect(await screen.findByRole('option', { name: 'Mermoz' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Ajouter/ })).not.toBeInTheDocument();
  });

  it('« Liberte 4 » liste « Liberté 4 » EN PREMIER et propose de créer ; Entrée choisit l’existant', async () => {
    const user = userEvent.setup();
    const surChoix = vi.fn();
    const surCreation = vi.fn();
    render(<Simple surChoix={surChoix} surCreation={surCreation} />);

    await user.type(screen.getByLabelText('Quartier'), 'Liberte 4');
    const options = await screen.findAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Liberté 4', 'Ajouter « Liberte 4 »']);
    await user.keyboard('{Enter}');

    expect(surChoix).toHaveBeenLastCalledWith({ value: '1', label: 'Liberté 4' });
    expect(surCreation).not.toHaveBeenCalled();
  });

  it('« Grand-Yoff » trouve « Grand Yoff » et Entrée choisit l’existant (TCK-788)', async () => {
    const user = userEvent.setup();
    const surChoix = vi.fn();
    const surCreation = vi.fn();
    render(<Simple surChoix={surChoix} surCreation={surCreation} />);

    await user.type(screen.getByLabelText('Quartier'), 'Grand-Yoff');
    const options = await screen.findAllByRole('option');
    expect(options[0]).toHaveTextContent('Grand Yoff');
    await user.keyboard('{Enter}');

    expect(surChoix).toHaveBeenLastCalledWith({ value: '4', label: 'Grand Yoff' });
    expect(surCreation).not.toHaveBeenCalled();
  });

  it('un quartier tapé HORS liste survit à Échap et à la sortie du champ', async () => {
    const user = userEvent.setup();
    render(<Libre />);

    await user.type(screen.getByLabelText('Quartier'), 'Cité Keur Gorgui');
    await user.keyboard('{Escape}');
    await user.tab();

    expect(screen.getByLabelText('Quartier')).toHaveValue('Cité Keur Gorgui');
  });
});

describe('<ComboboxMultiple>', () => {
  it('ajoute en puce, retire, et crée par Entrée', async () => {
    const user = userEvent.setup();
    const surCreation = vi.fn();
    render(<Multiple surCreation={surCreation} />);
    const champ = screen.getByLabelText('Équipements');

    await user.type(champ, 'pisc');
    await user.click(await screen.findByRole('option', { name: 'Piscine' }));
    expect(screen.getByRole('button', { name: 'Retirer Piscine' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Retirer Piscine' }));
    expect(screen.queryByRole('button', { name: 'Retirer Piscine' })).not.toBeInTheDocument();

    await user.type(champ, 'Puits');
    await screen.findByRole('option', { name: 'Ajouter « Puits »' });
    await user.keyboard('{Enter}');
    expect(surCreation).toHaveBeenCalledWith('Puits');
  });

  it('Échap ferme la liste, et liste fermée n’efface AUCUNE puce', async () => {
    const user = userEvent.setup();
    render(<Multiple surCreation={vi.fn()} />);

    await user.type(screen.getByLabelText('Équipements'), 'pisc');
    await user.click(await screen.findByRole('option', { name: 'Piscine' }));
    await user.keyboard('{Escape}{Escape}');

    expect(screen.getByRole('button', { name: 'Retirer Piscine' })).toBeInTheDocument();
  });
});
