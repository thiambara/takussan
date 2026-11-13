/**
 * TCK-2601 — ce que la feuille de compte demande : ce qui manque, rien d'autre.
 */
import { describe, expect, it } from 'vitest';

import { manquesDeLaFeuille } from '../feuille-de-publication';

const COMPLET = {
  first_name: 'Awa',
  last_name: 'Diop',
  phone: '+221770000901',
  phone_verified_at: '2026-10-01T00:00:00Z',
  phone_whatsapp: true,
};

describe('manquesDeLaFeuille', () => {
  it('sans compte : la session, prénom, nom et numéro', () => {
    expect(manquesDeLaFeuille(null)).toEqual(['session', 'first_name', 'last_name', 'verified_phone']);
  });

  it('un compte complet : rien, la publication part directement', () => {
    expect(manquesDeLaFeuille(COMPLET)).toEqual([]);
    // Les CGU s'acceptent par la phrase sous le bouton : elles n'ouvrent pas la feuille.
    expect(manquesDeLaFeuille({ ...COMPLET, terms_accepted_at: null })).toEqual([]);
  });

  it('prénom ET nom requis (décision 1a) : le prénom seul fait demander le nom seul', () => {
    expect(manquesDeLaFeuille({ ...COMPLET, last_name: '' })).toEqual(['last_name']);
    expect(manquesDeLaFeuille({ ...COMPLET, first_name: '  ', last_name: '' })).toEqual(['first_name', 'last_name']);
  });

  it('numéro non vérifié : le numéro (la question WhatsApp part avec lui, en case)', () => {
    expect(manquesDeLaFeuille({ ...COMPLET, phone_verified_at: null, phone_whatsapp: null })).toEqual(['verified_phone']);
  });

  it('numéro vérifié sans réponse WhatsApp : la question, une fois ; « non » est une réponse', () => {
    expect(manquesDeLaFeuille({ ...COMPLET, phone_whatsapp: null })).toEqual(['whatsapp']);
    expect(manquesDeLaFeuille({ ...COMPLET, phone_whatsapp: false })).toEqual([]);
  });

  it('le serveur dit « numéro non vérifié » pour soi, le contexte le croit fait : la feuille le demande', () => {
    expect(manquesDeLaFeuille(COMPLET, { manquants: ['verified_phone', 'terms'], contactEstSoi: true })).toEqual(['verified_phone']);
    // Le contact est un AUTRE : rien à saisir pour soi.
    expect(manquesDeLaFeuille(COMPLET, { manquants: ['verified_phone'], contactEstSoi: false })).toEqual([]);
  });
});
