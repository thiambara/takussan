import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { OngletsDeFiche } from '../OngletsDeFiche';

/**
 * TCK-2522 (revue du 2026-11-09, décision de la session) — au téléphone, les onglets de la fiche
 * d'agence collent à `top-0`, comme la maquette FicheDBiens : aucune rangée ne colle au-dessus
 * d'eux (`EnTeteDeFiche` ne fixe plus rien). En bureau, sous la barre du site, à SA formule (`NavbarSpacer` : 77 px à 1024, 74,6 à 1440) —
 * une valeur figée à 77 laissait une bande de 2 px à 1440 où passaient les cartes (contre-vérification
 * du 2026-11-09).
 */
describe('OngletsDeFiche — où la liste colle', () => {
  const rendre = () =>
    render(
      <OngletsDeFiche
        libelle="Sections de Dakar Immo"
        onglets={[
          { id: 'biens', libelle: 'Biens', compte: 67, contenu: <p>biens</p> },
          { id: 'infos', libelle: 'Infos', contenu: <p>infos</p> },
        ]}
      />,
    );

  it('au téléphone à top-0 (aucune rangée au-dessus), en bureau sous la barre du site', () => {
    rendre();
    const liste = screen.getByRole('tablist', { name: 'Sections de Dakar Immo' });
    const classes = liste.className.split(/\s+/);
    expect(classes).toEqual(expect.arrayContaining(['sticky', 'top-0', 'lg:top-[calc(var(--spacing)*6+53px)]']));
    expect(classes).not.toContain('top-14');
  });

  it('l’ancre de retour en haut du panneau suit la même hauteur', () => {
    const { container } = rendre();
    const ancre = container.querySelector('[aria-hidden]')!;
    expect(ancre.className.split(/\s+/)).toEqual(expect.arrayContaining(['scroll-mt-0', 'lg:scroll-mt-[calc(var(--spacing)*6+53px)]']));
  });
});
