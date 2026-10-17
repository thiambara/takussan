/**
 * P08.08 (TCK-756) — une barre d'onglets trop large défile dans sa propre boîte, au lieu de
 * pousser la page de côté (patron de `CustomerDetailTabs`, ramené dans la primitive).
 *
 * jsdom ne mesure aucune largeur : ce test garde les classes qui portent le comportement. Mesuré
 * par le mesureur (Chromium, 2026-10-15) : 454 px pour les cinq onglets des paiements et 394 px
 * pour ceux du bien, contre 328 px disponibles à 360.
 *
 * - `max-w-full` borne la liste à son conteneur, `overflow-x-auto` la fait défiler ;
 * - `justify-center-safe` et non `justify-center` : centré, un contenu qui déborde perd son début,
 *   hors d'atteinte du défilement ;
 * - `line` en est exclue : son liseré actif est posé 5 px SOUS la liste et serait rogné.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Tabs, TabsList, TabsTrigger } from '../tabs';

function liste(variant?: 'default' | 'line') {
  render(
    <Tabs defaultValue="a">
      <TabsList variant={variant} aria-label="onglets">
        <TabsTrigger value="a">Encaissements</TabsTrigger>
        <TabsTrigger value="b">Factures</TabsTrigger>
      </TabsList>
    </Tabs>,
  );
  return screen.getByRole('tablist', { name: 'onglets' });
}

describe('TabsList — défilement horizontal (TCK-756)', () => {
  it('la variante par défaut défile dans sa boîte, bornée à son conteneur', () => {
    const classes = liste().classList;
    expect(classes).toContain('overflow-x-auto');
    expect(classes).toContain('max-w-full');
    expect(classes).toContain('justify-center-safe');
    expect(classes).not.toContain('justify-center');
  });

  it('la variante « line » ne défile pas, pour ne pas rogner son liseré', () => {
    expect(liste('line').classList).not.toContain('overflow-x-auto');
  });
});
