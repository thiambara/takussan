/**
 * TCK-2881 — le jour écrit dans la demande. Le navigateur est à Paris : la résolution se fait sur le
 * jour de l'API (Dakar, UTC+0), jamais sur les composantes locales.
 */
process.env.TZ = 'Europe/Paris';

import { describe, expect, it } from 'vitest';
import { jourDuMessage } from '../jour-du-message';

// Mardi 3 novembre 2026, 09:20 à Dakar.
const MARDI = new Date('2026-11-03T09:20:00Z');

describe('jourDuMessage — TCK-2881', () => {
  it('« samedi » lu un mardi : le samedi qui suit', () => {
    expect(jourDuMessage('Bonjour, une visite samedi est-elle possible ?', MARDI)).toEqual({ jour: '2026-11-07', mot: 'samedi' });
  });

  it('« Samedi ? » : la casse et la ponctuation ne gênent pas', () => {
    expect(jourDuMessage('Disponible Samedi ?', MARDI)).toEqual({ jour: '2026-11-07', mot: 'samedi' });
  });

  it('« demain » : le lendemain ; « après-demain » n’est pas lu comme « demain »', () => {
    expect(jourDuMessage('Je peux passer demain matin.', MARDI)).toEqual({ jour: '2026-11-04', mot: 'demain' });
    expect(jourDuMessage('Je peux passer après-demain.', MARDI)).toEqual({ jour: '2026-11-05', mot: 'après-demain' });
  });

  it('« aujourd’hui », apostrophe droite ou typographique', () => {
    expect(jourDuMessage("Visite aujourd'hui ?", MARDI)?.jour).toBe('2026-11-03');
    expect(jourDuMessage('Visite aujourd’hui ?', MARDI)?.jour).toBe('2026-11-03');
  });

  it('le même jour de semaine qu’aujourd’hui : aujourd’hui (prochaine occurrence, aujourd’hui compris)', () => {
    expect(jourDuMessage('mardi ça vous va ?', MARDI)?.jour).toBe('2026-11-03');
    expect(jourDuMessage('lundi ça vous va ?', MARDI)?.jour).toBe('2026-11-09');
  });

  it('en anglais : « Saturday »', () => {
    expect(jourDuMessage('Could I visit on Saturday?', MARDI)).toEqual({ jour: '2026-11-07', mot: 'saturday' });
  });

  it('le premier jour par sa POSITION dans le message, pas par l’ordre de la liste', () => {
    expect(jourDuMessage('Samedi ou sinon lundi', MARDI)?.mot).toBe('samedi');
  });

  it('aucun jour : rien ; un mot qui CONTIENT un jour n’en est pas un', () => {
    expect(jourDuMessage('Le bien est-il toujours disponible ?', MARDI)).toBeNull();
    expect(jourDuMessage('Les samedis je travaille', MARDI)).toBeNull();
    expect(jourDuMessage(null, MARDI)).toBeNull();
  });

  it('minuit à Paris, encore la veille à Dakar : le jour est celui de Dakar', () => {
    // Samedi 7 nov., 23:30 à Dakar = dimanche 8 nov., 00:30 à Paris.
    expect(jourDuMessage('demain', new Date('2026-11-07T23:30:00Z'))?.jour).toBe('2026-11-08');
    // Le jour de semaine aussi : samedi à Dakar, « lundi » = le 9 (dimanche à Paris en dirait le 8).
    expect(jourDuMessage('lundi', new Date('2026-11-07T23:30:00Z'))?.jour).toBe('2026-11-09');
  });
});
