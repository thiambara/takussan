import { describe, expect, it } from 'vitest';

import {
  COOKIE_MODE_BIENS,
  PASTILLES_GESTION,
  cookieDuModeDeListe,
  pastilleGestionActive,
  pastilleGestionProposee,
  requeteDeLaPastille,
  requeteDuMode,
  resoudreMode,
} from '../mode-de-liste';

/**
 * TCK-2638 — le mode de la liste des biens (« Gestion » ou « Annonces ») : l'URL d'abord, puis la
 * mémoire de l'appareil (un cookie, lisible au rendu serveur), puis « Gestion » ; jamais « Gestion »
 * pour un compte qui n'a aucun bien à louer.
 */
describe('resoudreMode', () => {
  it('l’URL prime sur la mémoire de l’appareil', () => {
    expect(resoudreMode({ url: 'annonces', memoire: 'gestion', gestionProposee: true })).toBe('annonces');
    expect(resoudreMode({ url: 'gestion', memoire: 'annonces', gestionProposee: true })).toBe('gestion');
  });

  it('sans mode dans l’URL, la mémoire de l’appareil le reprend', () => {
    expect(resoudreMode({ url: undefined, memoire: 'annonces', gestionProposee: true })).toBe('annonces');
  });

  it('sans URL ni mémoire, « Gestion »', () => {
    expect(resoudreMode({ url: undefined, memoire: undefined, gestionProposee: true })).toBe('gestion');
  });

  it('une valeur inconnue est ignorée', () => {
    expect(resoudreMode({ url: 'portefeuille', memoire: 'x', gestionProposee: true })).toBe('gestion');
    expect(resoudreMode({ url: 'portefeuille', memoire: 'annonces', gestionProposee: true })).toBe('annonces');
  });

  it('un compte sans bien à louer n’a que les annonces, même si l’URL demande « Gestion »', () => {
    expect(resoudreMode({ url: 'gestion', memoire: 'gestion', gestionProposee: false })).toBe('annonces');
  });
});

describe('cookieDuModeDeListe', () => {
  it('mémorise le mode un an, sur la seule liste des biens', () => {
    expect(cookieDuModeDeListe('annonces', false)).toBe(
      `${COOKIE_MODE_BIENS}=annonces; path=/app/properties; max-age=31536000; samesite=lax`,
    );
    expect(cookieDuModeDeListe('gestion', true)).toMatch(/; secure$/);
  });
});

describe('requeteDuMode', () => {
  it('garde la recherche, les filtres et la page ; ne change que le mode', () => {
    const avant = new URLSearchParams('search=Mermoz&occupancy=vacant&page=2&per_page=50&mode=gestion');
    const apres = new URLSearchParams(requeteDuMode(avant, 'annonces'));
    expect(apres.get('mode')).toBe('annonces');
    expect(apres.get('search')).toBe('Mermoz');
    expect(apres.get('occupancy')).toBe('vacant');
    expect(apres.get('page')).toBe('2');
    expect(apres.get('per_page')).toBe('50');
  });
});

describe('les pastilles du mode Gestion', () => {
  it('sont, dans l’ordre : Tous, Occupés, Vacants, Loyer en retard, Préavis, À vendre', () => {
    expect(PASTILLES_GESTION.map((p) => p.cle)).toEqual(['tous', 'occupes', 'vacants', 'retard', 'preavis', 'aVendre']);
  });

  it('se lisent de l’URL', () => {
    expect(pastilleGestionActive(new URLSearchParams(''))).toBe('tous');
    expect(pastilleGestionActive(new URLSearchParams('occupancy=occupied'))).toBe('occupes');
    expect(pastilleGestionActive(new URLSearchParams('occupancy=vacant'))).toBe('vacants');
    expect(pastilleGestionActive(new URLSearchParams('occupancy=notice'))).toBe('preavis');
    expect(pastilleGestionActive(new URLSearchParams('occupancy=not_rental'))).toBe('aVendre');
    expect(pastilleGestionActive(new URLSearchParams('rent_late=1'))).toBe('retard');
  });

  it('TCK-2638 : « À vendre » ouvre la liste hors location (`occupancy=not_rental`)', () => {
    const avant = new URLSearchParams('search=Mermoz&rent_late=1&page=2&mode=gestion');
    const vente = new URLSearchParams(requeteDeLaPastille(avant, 'aVendre'));
    expect(vente.get('occupancy')).toBe('not_rental');
    expect(vente.has('rent_late')).toBe(false);
    expect(vente.has('page')).toBe(false);
    expect(vente.get('search')).toBe('Mermoz');
  });

  it('TCK-2638 : « À vendre » n’est proposée que s’il y a des biens hors location, ou qu’elle est active', () => {
    expect(pastilleGestionProposee('aVendre', 0, 'tous')).toBe(false);
    expect(pastilleGestionProposee('aVendre', 3, 'tous')).toBe(true);
    expect(pastilleGestionProposee('aVendre', 0, 'aVendre')).toBe(true);
    expect(pastilleGestionProposee('vacants', 0, 'tous')).toBe(true);
  });

  it('une pastille remplace la précédente, garde le reste et repart de la page 1', () => {
    const avant = new URLSearchParams('search=Mermoz&occupancy=vacant&page=3&mode=gestion');
    const retard = new URLSearchParams(requeteDeLaPastille(avant, 'retard'));
    expect(retard.get('rent_late')).toBe('1');
    expect(retard.has('occupancy')).toBe(false);
    expect(retard.has('page')).toBe(false);
    expect(retard.get('search')).toBe('Mermoz');
    expect(retard.get('mode')).toBe('gestion');

    const tous = new URLSearchParams(requeteDeLaPastille(retard, 'tous'));
    expect(tous.has('rent_late')).toBe(false);
    expect(tous.has('occupancy')).toBe(false);
    expect(tous.get('search')).toBe('Mermoz');
  });
});
