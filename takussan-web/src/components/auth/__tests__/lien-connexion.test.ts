/**
 * Revenir à la page quittée après la connexion — retour testeur du 2026-09-23 (TCK-568, M2).
 *
 * Les deux bouts du contrat `?redirect=` : qui fabrique le lien de connexion, et qui relit la
 * destination pour en faire un retour.
 */
import { describe, expect, it } from 'vitest';

import {
  debutDuGesteQuitte,
  destinationPublique,
  hrefConnexion,
  hrefConnexionPour,
  lireActionDEntree,
  slugDuBienQuitte,
} from '../lien-connexion';

describe('hrefConnexion — le lien « Connexion » emporte la page courante', () => {
  it('une recherche filtrée part AVEC ses filtres', () => {
    expect(hrefConnexion('/fr/properties?type=office&city=Dakar')).toBe(
      '/auth/login?redirect=%2Ffr%2Fproperties%3Ftype%3Doffice%26city%3DDakar',
    );
  });

  it('une fiche de bien, d’agent (slug à point compris)', () => {
    expect(hrefConnexion('/en/properties/villa-a-fann')).toBe(
      '/auth/login?redirect=%2Fen%2Fproperties%2Fvilla-a-fann',
    );
    expect(hrefConnexion('/fr/agents/owner.agency4')).toBe(
      '/auth/login?redirect=%2Ffr%2Fagents%2Fowner.agency4',
    );
  });

  it('depuis l’accueil, le lien reste nu : on s’y connecte pour aller à son espace', () => {
    for (const accueil of ['/', '/fr', '/en', '/wo', '/fr?utm=x']) {
      expect(hrefConnexion(accueil)).toBe('/auth/login');
    }
  });

  it('hors du site public, rien à quoi revenir', () => {
    for (const chemin of ['/auth/register', '/app/overview', '/app/agency/team', '/onboarding/owner']) {
      expect(hrefConnexion(chemin)).toBe('/auth/login');
    }
  });
});

describe('destinationPublique — ce vers quoi « Retour » peut mener', () => {
  it('rend une page publique, requête comprise', () => {
    expect(destinationPublique('/fr/properties?type=office')).toBe('/fr/properties?type=office');
    expect(destinationPublique('/properties/villa-a-fann')).toBe('/properties/villa-a-fann');
  });

  it('refuse la console : sans session, le proxy renverrait ici', () => {
    expect(destinationPublique('/app')).toBeNull();
    expect(destinationPublique('/app/settings/agency/upgrade')).toBeNull();
  });

  it('refuse toute sortie du site — la redirection ouverte', () => {
    for (const brute of ['//evil.tld', '/\\evil.tld', 'https://evil.tld/fr', 'javascript:alert(1)']) {
      expect(destinationPublique(brute)).toBeNull();
    }
  });

  it('rend null sans paramètre', () => {
    expect(destinationPublique(null)).toBeNull();
    expect(destinationPublique(undefined)).toBeNull();
    expect(destinationPublique('')).toBeNull();
  });
});

// TCK-2604 — l'action interrompue (liste fermée) et le bien quitté, lus par la connexion.
describe('l’intention d’entrée', () => {
  it('une action de la liste fermée, rien d’autre', () => {
    for (const action of ['reservation', 'visite', 'alerte', 'favori', 'publication', 'invitation']) {
      expect(lireActionDEntree(action)).toBe(action);
    }
    for (const brute of [null, '', 'RESERVATION', 'reserver', '<script>', 'reservation ']) {
      expect(lireActionDEntree(brute)).toBeNull();
    }
  });

  it('hrefConnexionPour : la page encodée, l’action en clair', () => {
    expect(hrefConnexionPour('/fr/properties/x?action=reserver', 'reservation')).toBe(
      '/auth/login?redirect=%2Ffr%2Fproperties%2Fx%3Faction%3Dreserver&intention=reservation',
    );
    expect(hrefConnexionPour('/publish')).toBe('/auth/login?redirect=%2Fpublish');
  });

  it('le slug du bien : la fiche (langue ou non), le tunnel de réservation', () => {
    expect(slugDuBienQuitte('/fr/properties/villa-a-fann-x1?action=reserver')).toBe('villa-a-fann-x1');
    expect(slugDuBienQuitte('/properties/villa-a-fann-x1')).toBe('villa-a-fann-x1');
    expect(slugDuBienQuitte('/wo/bookings?property=studio-a1&debut=2099-01-10')).toBe('studio-a1');
  });

  it('rien d’autre qu’un slug de bien, et jamais hors du site', () => {
    for (const brute of [
      null,
      '/fr/properties',
      '/fr/properties?type=villa',
      '/fr/properties/a/b',
      '/fr/properties/..',
      '/fr/properties/%2E%2E',
      '/fr/bookings?property=../x',
      '/app/properties/12',
      '//evil.example/properties/x',
      'https://evil.example/properties/x',
    ]) {
      expect(slugDuBienQuitte(brute), String(brute)).toBeNull();
    }
  });

  it('les dates du geste : un début valide, une fin seulement après lui', () => {
    expect(debutDuGesteQuitte('/fr/properties/x?debut=2099-01-10&fin=2099-01-14')).toEqual({ debut: '2099-01-10', fin: '2099-01-14' });
    expect(debutDuGesteQuitte('/fr/properties/x?debut=2099-01-10&fin=2099-01-01')).toEqual({ debut: '2099-01-10', fin: null });
    expect(debutDuGesteQuitte('/fr/properties/x?debut=demain')).toBeNull();
    expect(debutDuGesteQuitte('/fr/properties/x')).toBeNull();
  });

  it('une date hors calendrier est écartée, jamais rendue « Invalid Date » (r3 de 861535de2)', () => {
    // La forme AAAA-MM-JJ ne suffit pas : 13ᵉ mois, 45ᵉ jour, 30 février, année hors bornes.
    expect(debutDuGesteQuitte('/fr/properties/x?debut=2026-13-45&fin=2026-99-99')).toBeNull();
    expect(debutDuGesteQuitte('/fr/properties/x?debut=2027-02-30')).toBeNull();
    expect(debutDuGesteQuitte('/fr/properties/x?debut=1999-12-31')).toBeNull();
    expect(debutDuGesteQuitte('/fr/properties/x?debut=2101-01-01')).toBeNull();
    // Un début réel et une fin impossible : le début reste, la fin tombe.
    expect(debutDuGesteQuitte('/fr/properties/x?debut=2026-12-05&fin=2026-12-32')).toEqual({ debut: '2026-12-05', fin: null });
    expect(debutDuGesteQuitte('/fr/properties/x?debut=2028-02-29&fin=2028-03-01')).toEqual({ debut: '2028-02-29', fin: '2028-03-01' });
  });
});
