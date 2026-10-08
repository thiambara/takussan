import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CLE_INTENTION_OAUTH,
  intentionOAuthMemorisee,
  memoriserIntentionOAuth,
  oublierIntentionOAuth,
} from '../intention-oauth';

/** TCK-589 — l'intention survit à l'aller-retour OAuth, jamais vers un autre site. */
describe('intention OAuth', () => {
  beforeEach(() => window.sessionStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('mémorise une destination interne et la rend', () => {
    memoriserIntentionOAuth('/properties/x?action=reserver');
    expect(intentionOAuthMemorisee()).toBe('/properties/x?action=reserver');
    oublierIntentionOAuth();
    expect(intentionOAuthMemorisee()).toBeNull();
  });

  it('une destination hors du site efface la précédente au lieu de s’écrire', () => {
    memoriserIntentionOAuth('/properties/x');
    memoriserIntentionOAuth('//evil.example');
    expect(window.sessionStorage.getItem(CLE_INTENTION_OAUTH)).toBeNull();
  });

  it('refiltre à la lecture : le stockage est modifiable par tout script de l’origine', () => {
    window.sessionStorage.setItem(CLE_INTENTION_OAUTH, '//evil.example');
    expect(intentionOAuthMemorisee()).toBeNull();
  });

  it('stockage indisponible : rien ne lève, l’intention manque', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqué');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqué');
    });
    expect(() => memoriserIntentionOAuth('/properties/x')).not.toThrow();
    expect(intentionOAuthMemorisee()).toBeNull();
  });
});
