/**
 * TCK-2600 (ADR-0093 § 2-6) — la couche du brouillon local : ce qu'elle garde, ce qu'elle refuse de
 * garder, la purge à 30 jours, et le repli en mémoire quand le navigateur refuse ou que le quota est
 * atteint. Le moteur IndexedDB lui-même est éprouvé au navigateur (AC2) ; ici, des moteurs en
 * mémoire, dont deux qui échouent comme un navigateur échoue.
 */
import { describe, expect, it } from 'vitest';

import {
  DUREE_DE_GARDE_MS,
  moteurEnMemoire,
  ouvrirBrouillonLocal,
  PHOTOS_MAX,
  type MoteurDeStockage,
} from '../brouillon-local';

const JOUR = 24 * 60 * 60 * 1000;

function photo(nom: string, contenu = nom) {
  return { id: nom, fichier: new File([contenu], `${nom}.jpg`, { type: 'image/jpeg', lastModified: 1_700_000_000_000 }) };
}

/** Un moteur qui échoue sur `ecrire` (quota) ou partout (stockage refusé). */
function moteurQuiEchoue(comment: 'quota' | 'refus'): MoteurDeStockage {
  const sous = moteurEnMemoire();
  const erreur = () =>
    comment === 'quota' ? new DOMException('plein', 'QuotaExceededError') : new DOMException('refusé', 'SecurityError');
  return {
    lire: comment === 'refus' ? async () => Promise.reject(erreur()) : sous.lire,
    ecrire: async () => Promise.reject(erreur()),
    effacer: sous.effacer,
  };
}

describe('ce que le brouillon garde', () => {
  it('l’étape, les valeurs de l’annonce et les photos, relues telles quelles par une autre ouverture', async () => {
    const moteur = moteurEnMemoire();
    const premier = ouvrirBrouillonLocal({ moteur, maintenant: () => 1000 });
    await premier.ouvrir();
    await premier.ecrireValeurs(3, { type: 'studio', contract_type: 'rent', city: 'Dakar', price: 250000, rent_period: 'yearly' });
    await premier.ecrirePhotos([photo('salon'), photo('cuisine'), photo('chambre')]);

    const second = await ouvrirBrouillonLocal({ moteur, maintenant: () => 2000 }).ouvrir();
    expect(second.purge).toBe(false);
    expect(second.valeurs?.etape).toBe(3);
    expect(second.valeurs?.valeurs).toEqual({ type: 'studio', contract_type: 'rent', city: 'Dakar', price: 250000, rent_period: 'yearly' });
    expect(second.photos.map((p) => p.id)).toEqual(['salon', 'cuisine', 'chambre']);
    const [salon] = second.photos;
    expect(salon!.fichier).toBeInstanceOf(File);
    expect(salon!.fichier.name).toBe('salon.jpg');
    expect(salon!.fichier.type).toBe('image/jpeg');
    expect(await salon!.fichier.text()).toBe('salon');
  });

  it('rien d’une personne : numéro, code, jeton, prénom, nom et frais d’agence ne s’écrivent pas', async () => {
    const moteur = moteurEnMemoire();
    const brouillon = ouvrirBrouillonLocal({ moteur });
    await brouillon.ecrireValeurs(0, {
      type: 'studio',
      phone: '+221771234567',
      code: '598715',
      token: 'secret',
      first_name: 'Awa',
      last_name: 'Diop',
      agency_fee_months: 1,
    });
    const brut = await moteur.lire('valeurs');
    expect(brut?.valeurs).toEqual({ type: 'studio' });
  });

  it('dix photos au plus', async () => {
    const moteur = moteurEnMemoire();
    const brouillon = ouvrirBrouillonLocal({ moteur });
    await brouillon.ecrireValeurs(4, { type: 'villa' });
    await brouillon.ecrirePhotos(Array.from({ length: 12 }, (_, i) => photo(`p${i}`)));
    const relu = await ouvrirBrouillonLocal({ moteur }).ouvrir();
    expect(relu.photos).toHaveLength(PHOTOS_MAX);
    // Et ce qui dépasse ne s'écrit pas : le plafond tient dans le stockage, pas seulement à la relecture.
    expect(await moteur.lire('photos')).toHaveLength(PHOTOS_MAX);
  });
});

describe('la purge (30 jours sans geste)', () => {
  it('un brouillon de plus de 30 jours est effacé à l’ouverture, et l’ouverture le dit', async () => {
    const moteur = moteurEnMemoire();
    await ouvrirBrouillonLocal({ moteur, maintenant: () => 0 }).ecrireValeurs(2, { type: 'studio' });
    const ouvert = await ouvrirBrouillonLocal({ moteur, maintenant: () => DUREE_DE_GARDE_MS + JOUR }).ouvrir();
    expect(ouvert).toEqual({ valeurs: null, photos: [], purge: true });
    expect(await moteur.lire('valeurs')).toBeUndefined();
  });

  it('à 29 jours, il reste', async () => {
    const moteur = moteurEnMemoire();
    await ouvrirBrouillonLocal({ moteur, maintenant: () => 0 }).ecrireValeurs(2, { type: 'studio' });
    const ouvert = await ouvrirBrouillonLocal({ moteur, maintenant: () => 29 * JOUR }).ouvrir();
    expect(ouvert.purge).toBe(false);
    expect(ouvert.valeurs?.etape).toBe(2);
  });

  it('une photo ajoutée compte comme un geste', async () => {
    const moteur = moteurEnMemoire();
    let t = 0;
    const brouillon = ouvrirBrouillonLocal({ moteur, maintenant: () => t });
    await brouillon.ecrireValeurs(4, { type: 'studio' });
    t = 20 * JOUR;
    await brouillon.ecrirePhotos([photo('salon')]);
    const ouvert = await ouvrirBrouillonLocal({ moteur, maintenant: () => 45 * JOUR }).ouvrir();
    expect(ouvert.purge).toBe(false);
  });

  it('« Effacer ce brouillon » vide tout', async () => {
    const moteur = moteurEnMemoire();
    const brouillon = ouvrirBrouillonLocal({ moteur });
    await brouillon.ecrireValeurs(1, { type: 'studio' });
    await brouillon.ecrirePhotos([photo('salon')]);
    await brouillon.effacer();
    expect(await ouvrirBrouillonLocal({ moteur }).ouvrir()).toEqual({ valeurs: null, photos: [], purge: false });
  });
});

describe('quand le stockage manque, l’annonce reste en mémoire et l’état le dit', () => {
  it('pas d’IndexedDB du tout : en mémoire, raison « refus »', async () => {
    const brouillon = ouvrirBrouillonLocal({ moteur: null });
    expect(brouillon.etat()).toEqual({ persistance: 'memoire', raison: 'refus' });
    await brouillon.ecrireValeurs(1, { type: 'studio' });
    await brouillon.ecrirePhotos([photo('salon')]);
    const relu = await brouillon.ouvrir();
    expect(relu.valeurs?.valeurs).toEqual({ type: 'studio' });
    expect(relu.photos.map((p) => p.id)).toEqual(['salon']);
  });

  it('stockage refusé à la lecture : bascule en mémoire, raison « refus »', async () => {
    const brouillon = ouvrirBrouillonLocal({ moteur: moteurQuiEchoue('refus') });
    expect(brouillon.etat().persistance).toBe('navigateur');
    expect(await brouillon.ouvrir()).toEqual({ valeurs: null, photos: [], purge: false });
    expect(brouillon.etat()).toEqual({ persistance: 'memoire', raison: 'refus' });
  });

  it('quota atteint à l’écriture : bascule en mémoire, raison « quota », et la donnée refusée n’est pas perdue', async () => {
    const brouillon = ouvrirBrouillonLocal({ moteur: moteurQuiEchoue('quota') });
    await brouillon.ouvrir();
    await brouillon.ecrireValeurs(4, { type: 'studio', title: 'Studio à Mermoz' });
    await brouillon.ecrirePhotos([photo('salon'), photo('cuisine')]);
    expect(brouillon.etat()).toEqual({ persistance: 'memoire', raison: 'quota' });
    const relu = await brouillon.ouvrir();
    expect(relu.valeurs?.valeurs).toEqual({ type: 'studio', title: 'Studio à Mermoz' });
    expect(relu.photos.map((p) => p.id)).toEqual(['salon', 'cuisine']);
  });

  it('quota atteint sur les seules valeurs : le repli les emporte, sans attendre un autre geste', async () => {
    const brouillon = ouvrirBrouillonLocal({ moteur: moteurQuiEchoue('quota') });
    await brouillon.ouvrir();
    await brouillon.ecrireValeurs(2, { type: 'studio' });
    const relu = await brouillon.ouvrir();
    expect(relu.valeurs).toMatchObject({ etape: 2, valeurs: { type: 'studio' } });
  });
});
