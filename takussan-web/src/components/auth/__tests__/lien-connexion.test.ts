/**
 * Revenir à la page quittée après la connexion — retour testeur du 2026-09-23 (TCK-568, M2).
 *
 * Les deux bouts du contrat `?redirect=` : qui fabrique le lien de connexion, et qui relit la
 * destination pour en faire un retour.
 */
import { describe, expect, it } from 'vitest';

import { destinationPublique, hrefConnexion } from '../lien-connexion';

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
    for (const chemin of ['/auth/register', '/app/overview', '/admin/users', '/onboarding/owner']) {
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
