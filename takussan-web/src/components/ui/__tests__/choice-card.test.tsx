import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChoiceCard, ChoiceCardGroup } from '../choice-card';

/**
 * TCK-499 — ce que cette primitive doit garder, et pourquoi ça se teste.
 *
 * `ChoiceCard` remplace quatre `<input type="radio">` roulés à la main, dont celui de
 * l'assistant hôte : un radio natif se peint avec l'`accent-color` du système, et rendait
 * donc un point BLEU au milieu d'une page terracotta.
 *
 * ⚠ La correction facile aurait été de remplacer l'input par un `<div role="radio">` piloté
 * au clic. Elle aurait coûté la SÉMANTIQUE que personne ne réécrit gratuitement : un groupe
 * de radios natif se parcourt aux flèches, boucle, et n'occupe qu'UN arrêt de tabulation —
 * trois comportements du navigateur, pas de la feuille de style. La primitive garde donc
 * l'input natif en `sr-only` et n'en reprend que la peinture.
 *
 * Ce fichier éprouve cette propriété-là, parce que c'est celle qu'une refonte visuelle
 * ultérieure casserait sans s'en apercevoir — le rendu resterait identique.
 */

function GroupeDeuxOptions({ onSelect }: { readonly onSelect?: (v: string) => void }) {
  const choisir = onSelect ?? (() => {});
  return (
    <>
      <button type="button">avant</button>
      <ChoiceCardGroup legend="Type de profil">
        <ChoiceCard
          name="intent"
          value="individual"
          checked
          onSelect={choisir}
          title="Particulier"
          description="Vous publiez vos propres biens."
        />
        <ChoiceCard
          name="intent"
          value="professional"
          checked={false}
          onSelect={choisir}
          title="Professionnel"
          description="Nous créons une agence dédiée."
        />
      </ChoiceCardGroup>
      <button type="button">après</button>
    </>
  );
}

describe('ChoiceCard — la sémantique de groupe de radios est conservée', () => {
  it('rend de vrais radios, groupés par leur `name`', () => {
    render(<GroupeDeuxOptions />);

    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(2);
    for (const r of radios) {
      expect(r).toHaveAttribute('type', 'radio');
      expect(r).toHaveAttribute('name', 'intent');
    }
  });

  it('associe chaque radio à son intitulé — un choix qui ne s’annonce pas ne se fait pas au clavier', () => {
    render(<GroupeDeuxOptions />);

    expect(screen.getByRole('radio', { name: /Particulier/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Professionnel/ })).not.toBeChecked();
  });

  it('porte un intitulé de groupe — sans lui, un lecteur d’écran annonce « 1 sur 2 » sans dire de quoi', () => {
    render(<GroupeDeuxOptions />);

    expect(screen.getByRole('group', { name: 'Type de profil' })).toBeInTheDocument();
  });

  it('n’occupe qu’UN arrêt de tabulation pour le groupe entier', async () => {
    const user = userEvent.setup();
    render(<GroupeDeuxOptions />);

    await user.tab(); // → bouton « avant »
    expect(screen.getByRole('button', { name: 'avant' })).toHaveFocus();

    await user.tab(); // → le groupe, par son option retenue
    expect(screen.getByRole('radio', { name: /Particulier/ })).toHaveFocus();

    // Le second radio ne prend PAS d'arrêt : la tabulation suivante sort du groupe.
    // C'est le comportement natif — et c'est exactement ce qu'un `<div role="radio">`
    // piloté au clic aurait perdu en silence.
    await user.tab();
    expect(screen.getByRole('button', { name: 'après' })).toHaveFocus();
  });

  it('remonte la valeur choisie quand on clique sur la carte, pas seulement sur le radio', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<GroupeDeuxOptions onSelect={onSelect} />);

    // La cible est le TEXTE de l'option : c'est là que le doigt et la souris vont.
    // Le `<label>` englobant est ce qui rend toute la carte cliquable.
    await user.click(screen.getByText('Professionnel'));

    expect(onSelect).toHaveBeenCalledWith('professional');
  });

  it('révèle le contenu dépendant sous l’option retenue, et sous elle seule', () => {
    const { rerender } = render(
      <ChoiceCard
        name="intent"
        value="professional"
        checked={false}
        onSelect={() => {}}
        title="Professionnel"
      >
        <p>Contactez notre équipe.</p>
      </ChoiceCard>,
    );
    expect(screen.queryByText('Contactez notre équipe.')).not.toBeInTheDocument();

    rerender(
      <ChoiceCard
        name="intent"
        value="professional"
        checked
        onSelect={() => {}}
        title="Professionnel"
      >
        <p>Contactez notre équipe.</p>
      </ChoiceCard>,
    );
    expect(screen.getByText('Contactez notre équipe.')).toBeInTheDocument();
  });

  it('un choix désactivé ne se sélectionne pas', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <ChoiceCard
        name="intent"
        value="professional"
        checked={false}
        disabled
        onSelect={onSelect}
        title="Professionnel"
      />,
    );

    await user.click(screen.getByText('Professionnel'));
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('radio')).toBeDisabled();
  });
});
