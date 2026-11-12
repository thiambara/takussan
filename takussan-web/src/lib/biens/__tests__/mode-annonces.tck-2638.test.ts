import { describe, expect, it } from 'vitest';

import {
  ONGLETS_ANNONCES,
  PASTILLES_ANNONCES,
  gestionProposee,
  lireVoir,
  parametresSansFiltre,
  pastilleAnnoncesActive,
  requeteDeLaPastille,
  requeteDeLaPastilleAnnonces,
  requeteDesSuivants,
} from '../mode-de-liste';

/**
 * TCK-2638 (lot B) — le mode Annonces : « Toutes », puis la partition de `filter[listing]` (décisions
 * du porteur 1 a et 2 a) ; au bureau, les onglets de statut « Vendus, loués » et « Archivés » ; au
 * téléphone, « Afficher les 20 suivants ».
 */
const p = (q: string) => new URLSearchParams(q);

describe('pastilles du mode Annonces', () => {
  it('« Toutes » en tête, puis les quatre états de `filter[listing]`, comptés par le résumé', () => {
    expect(PASTILLES_ANNONCES.map((x) => [x.cle, x.compte])).toEqual([
      ['toutes', 'total'],
      ['enLigne', 'online'],
      ['aValider', 'pending_validation'],
      ['brouillons', 'drafts'],
      ['horsLigne', 'offline'],
    ]);
    expect(ONGLETS_ANNONCES.slice(5).map((x) => x.cle)).toEqual(['vendusLoues', 'archives']);
  });

  it('l’active se lit dans l’URL ; « Toutes » sans filtre d’annonce', () => {
    expect(pastilleAnnoncesActive(p(''))).toBe('toutes');
    expect(pastilleAnnoncesActive(p('listing=online'))).toBe('enLigne');
    expect(pastilleAnnoncesActive(p('listing=offline&search=x'))).toBe('horsLigne');
    expect(pastilleAnnoncesActive(p('status=sold,rented'))).toBe('vendusLoues');
    expect(pastilleAnnoncesActive(p('include_archived=1&status=archived'))).toBe('archives');
    expect(pastilleAnnoncesActive(p('status=available'))).toBe('toutes');
  });

  it('une pastille remplace la précédente, garde recherche et mode, repart de la page 1', () => {
    expect(p(requeteDeLaPastilleAnnonces(p('mode=annonces&search=Mermoz&listing=draft&page=3&voir=60'), 'enLigne')).toString())
      .toBe('mode=annonces&search=Mermoz&listing=online');
    expect(requeteDeLaPastilleAnnonces(p('mode=annonces&listing=online'), 'toutes')).toBe('mode=annonces');
  });

  it('quitter un onglet de statut retire son statut (et les archives) ; un statut des filtres reste', () => {
    expect(requeteDeLaPastilleAnnonces(p('status=archived&include_archived=1'), 'enLigne')).toBe('listing=online');
    expect(requeteDeLaPastilleAnnonces(p('listing=online'), 'archives')).toBe('status=archived&include_archived=1');
    expect(requeteDeLaPastilleAnnonces(p('status=available'), 'enLigne')).toBe('status=available&listing=online');
  });

  it('les paramètres de l’autre mode ne filtrent pas : ils restent dans l’URL pour le retour', () => {
    expect(parametresSansFiltre('annonces').has('occupancy')).toBe(true);
    expect(parametresSansFiltre('annonces').has('listing')).toBe(false);
    expect(parametresSansFiltre('gestion').has('listing')).toBe(true);
    expect(parametresSansFiltre('gestion').has('occupancy')).toBe(false);
    expect(parametresSansFiltre('gestion').has('voir')).toBe(true);
  });
});

describe('le sélecteur n’est proposé qu’à un portefeuille qui a des biens à louer', () => {
  it('occupés + vacants > 0', () => {
    expect(gestionProposee({ occupied: 0, vacant: 1 })).toBe(true);
    expect(gestionProposee({ occupied: 2, vacant: 0 })).toBe(true);
    expect(gestionProposee({ occupied: 0, vacant: 0 })).toBe(false);
  });
});

describe('« Afficher les 20 suivants » (téléphone)', () => {
  it('`voir` grandit de 20, repart de la page 1, borné à 100', () => {
    expect(requeteDesSuivants(p('mode=gestion&page=2'), 20)).toBe('mode=gestion&voir=40');
    expect(requeteDesSuivants(p('voir=40'), 40)).toBe('voir=60');
    expect(requeteDesSuivants(p('voir=100'), 100)).toBe('voir=100');
    expect(requeteDesSuivants(p('per_page=10'), 10)).toBe('');
  });

  it('`voir` ne vaut qu’un multiple de 20 entre 40 et 100', () => {
    expect([lireVoir('40'), lireVoir('100'), lireVoir('20'), lireVoir('30'), lireVoir('120'), lireVoir('x'), lireVoir(undefined)])
      .toEqual([40, 100, undefined, undefined, undefined, undefined, undefined]);
  });

  it('une pastille de Gestion repart de la longueur d’une page', () => {
    expect(requeteDeLaPastille(p('voir=60&occupancy=vacant'), 'occupes')).toBe('occupancy=occupied');
  });
});
