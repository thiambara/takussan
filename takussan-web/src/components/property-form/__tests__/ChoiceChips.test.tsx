import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ChoiceChips } from '../wizard/ChoiceChips';

/**
 * TCK-464 — ce que `ChoiceChips` doit tenir, et le défaut qu'il portait.
 *
 * Le composant sert DEUX usages : un choix unique qui gouverne la suite (type, contrat, statut
 * foncier) et un choix multiple (les équipements). Décrit avec la seule prop `value`, il ne
 * savait montrer qu'une sélection unique — les équipements déjà cochés n'apparaissaient nulle
 * part. Une pastille sélectionnée qui ne se distingue pas n'est pas une finition manquante :
 * c'est une information perdue, et l'utilisateur re-clique pour désélectionner ce qu'il croyait
 * absent.
 */
const OPTIONS = [
  { value: 'wifi', label: 'WiFi' },
  { value: 'clim', label: 'Climatisation' },
  { value: 'piscine', label: 'Piscine' },
];

describe('ChoiceChips', () => {
  it('rend une pastille par option, exposée comme un interrupteur', () => {
    render(
      <ChoiceChips id="c" label="Équipements" options={OPTIONS} value={undefined} onChange={vi.fn()} />,
    );

    const pastilles = screen.getAllByRole('button');
    expect(pastilles).toHaveLength(3);
    for (const p of pastilles) expect(p).toHaveAttribute('aria-pressed', 'false');
  });

  it('associe le groupe à son libellé', () => {
    render(
      <ChoiceChips id="c" label="Équipements" options={OPTIONS} value={undefined} onChange={vi.fn()} />,
    );
    expect(screen.getByRole('group', { name: 'Équipements' })).toBeInTheDocument();
  });

  it('en sélection UNIQUE, une seule pastille est enfoncée', () => {
    render(
      <ChoiceChips id="c" label="Équipements" options={OPTIONS} value="clim" onChange={vi.fn()} />,
    );

    expect(screen.getByRole('button', { name: 'Climatisation' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'WiFi' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('en sélection MULTIPLE, chaque pastille retenue est enfoncée', () => {
    render(
      <ChoiceChips
        id="c"
        label="Équipements"
        options={OPTIONS}
        value={undefined}
        selected={['wifi', 'piscine']}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'WiFi' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Piscine' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Climatisation' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('`selected` prend le pas sur `value` au RUNTIME, si jamais les deux sont fournis', () => {
    // M-10 — le type interdit désormais cette combinaison à un appelant TYPÉ (union discriminée) :
    // c'est la correction. `estRetenue` garde néanmoins son repli défensif au runtime, pour un
    // appelant qui contournerait le typage (`any`, JS pur) — ce test-là le vérifie, via le même
    // contournement délibéré.
    render(
      // @ts-expect-error — combinaison volontairement interdite par le type, testée au runtime seul.
      <ChoiceChips
        id="c"
        label="Équipements"
        options={OPTIONS}
        value="clim"
        selected={['wifi']}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'WiFi' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Climatisation' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('remonte la valeur cliquée, enfoncée ou non — la bascule appartient à l’appelant', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ChoiceChips
        id="c"
        label="Équipements"
        options={OPTIONS}
        value={undefined}
        selected={['wifi']}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Piscine' }));
    expect(onChange).toHaveBeenCalledWith('piscine');

    await user.click(screen.getByRole('button', { name: 'WiFi' }));
    expect(onChange).toHaveBeenLastCalledWith('wifi');
  });

  it('garde une cible tactile d’au moins 44 px (AC9)', () => {
    render(
      <ChoiceChips id="c" label="Équipements" options={OPTIONS} value={undefined} onChange={vi.fn()} />,
    );
    // `min-h-11` = 2,75rem = 44 px. jsdom ne calcule aucune hauteur : la classe est le seul
    // témoin vérifiable, et c'est elle que le composant ne doit pas perdre au fil des retouches.
    for (const p of screen.getAllByRole('button')) expect(p.className).toContain('min-h-11');
  });

  it('M-11 — `radioGroup` bascule vers la sémantique de groupe de radios', () => {
    render(
      <ChoiceChips
        id="c"
        label="Type"
        options={OPTIONS}
        value="clim"
        onChange={vi.fn()}
        radioGroup
      />,
    );

    expect(screen.getByRole('radiogroup', { name: 'Type' })).toBeInTheDocument();
    const actif = screen.getByRole('radio', { name: 'Climatisation' });
    expect(actif).toHaveAttribute('aria-checked', 'true');
    expect(actif).not.toHaveAttribute('aria-pressed');

    const inactif = screen.getByRole('radio', { name: 'WiFi' });
    expect(inactif).toHaveAttribute('aria-checked', 'false');
  });

  it('re-revue M-12 — en mode `aria-pressed`, les flèches NE CHANGENT RIEN', async () => {
    // C'est la moitié du test qui garde la frontière entre les deux modes (statut foncier,
    // équipements : multi-sélection, désélectionnables — le roving tabindex du radiogroup n'a
    // aucun sens ici, et chaque puce reste tabulable pour elle-même).
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ChoiceChips id="c" label="Équipements" options={OPTIONS} value="clim" onChange={onChange} />,
    );

    for (const p of screen.getAllByRole('button')) expect(p).not.toHaveAttribute('tabindex');

    screen.getByRole('button', { name: 'Climatisation' }).focus();
    await user.keyboard('{ArrowRight}{ArrowLeft}{Home}{End}');

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Climatisation' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('n’affiche l’icône que lorsqu’elle existe, et jamais aux lecteurs d’écran', () => {
    render(
      <ChoiceChips
        id="c"
        label="Type"
        options={[{ value: 'land', label: 'Terrain', icon: '🌍' }]}
        value={undefined}
        onChange={vi.fn()}
      />,
    );

    // L'emoji est un repère de FORME : il ne doit pas s'ajouter au nom accessible du bouton.
    expect(screen.getByRole('button', { name: 'Terrain' })).toBeInTheDocument();
  });
});
