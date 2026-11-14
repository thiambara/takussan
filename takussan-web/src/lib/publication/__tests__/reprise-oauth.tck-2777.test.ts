import { describe, expect, it } from 'vitest';

import {
  DESTINATION_REPRISE_COMPTE,
  DESTINATION_REPRISE_ECHEC,
  lireRepriseDePublication,
  retourApresEchecOAuth,
} from '../reprise-oauth';

/**
 * TCK-2777 — l'échec chez le fournisseur ne ramène sur `/publish` que par une LISTE BLANCHE de
 * chemins exacts, et rend une constante, jamais la chaîne mémorisée dans l'onglet.
 */
describe('retour après un échec OAuth', () => {
  it('l’intention de la feuille de compte ramène sur /publish, feuille rouverte au numéro', () => {
    expect(retourApresEchecOAuth(DESTINATION_REPRISE_COMPTE)).toBe(DESTINATION_REPRISE_ECHEC);
    expect(retourApresEchecOAuth('/publish')).toBe('/publish?reprise=echec');
  });

  it.each([
    ['une autre page du site', '/properties/x?action=reserver'],
    ['un chemin qui commence comme /publish', '/publishing'],
    ['un sous-chemin', '/publish/x'],
    ['un chemin normalisé hors de /publish', '/publish/../app'],
    ['un hôte protocole-relatif', '//evil.example/publish'],
    ['une URL absolue', 'https://evil.example/publish'],
    ['un antislash', '/\\evil.example/publish'],
    ['une tabulation retirée par le parseur', '/\t/evil.example/publish'],
    ['l’accueil', '/'],
    ['rien', null],
  ])('%s : pas de retour (la connexion, comme avant)', (_cas, intention) => {
    expect(retourApresEchecOAuth(intention)).toBeNull();
  });

  it('la valeur rendue ne vient jamais de l’entrée : la requête mémorisée ne passe pas', () => {
    expect(retourApresEchecOAuth('/publish?next=//evil.example#x')).toBe(DESTINATION_REPRISE_ECHEC);
  });
});

describe('la reprise demandée par l’URL de /publish', () => {
  it.each([
    ['?reprise=compte', 'compte'],
    ['?reprise=echec', 'echec'],
    ['?reprise=autre', null],
    ['', null],
  ])('%s → %s', (recherche, attendu) => {
    expect(lireRepriseDePublication(recherche)).toBe(attendu);
  });
});
