import { describe, expect, it } from 'vitest';
import { peutContacterLeBien } from '../contactDuBien';

describe('peutContacterLeBien', () => {
  it('propose le contact à un visiteur anonyme', () => {
    expect(
      peutContacterLeBien({ utilisateurId: null, destinataireId: 7, resolution: null }),
    ).toBe(true);
  });

  /** La règle que le doute doit protéger : on ne masque pas pendant que le réseau réfléchit. */
  it('propose le contact tant que la résolution n’a pas répondu', () => {
    expect(
      peutContacterLeBien({ utilisateurId: 3, destinataireId: 7, resolution: null }),
    ).toBe(true);
  });

  it('retire le contact au destinataire lui-même, sans attendre le réseau', () => {
    expect(
      peutContacterLeBien({ utilisateurId: 7, destinataireId: 7, resolution: null }),
    ).toBe(false);
  });

  /** AC8 — le cas que seul le serveur connaît : le collaborateur agent, distinct du propriétaire. */
  it('retire le contact quand le serveur dit que le destinataire est le visiteur', () => {
    expect(
      peutContacterLeBien({
        utilisateurId: 12,
        destinataireId: 7,
        resolution: { can_message: false },
      }),
    ).toBe(false);
  });

  it('propose le contact à un tiers sur un bien qui a un destinataire', () => {
    expect(
      peutContacterLeBien({
        utilisateurId: 12,
        destinataireId: 7,
        resolution: { can_message: true },
      }),
    ).toBe(true);
  });

  it('ne confond pas un propriétaire absent avec le visiteur', () => {
    expect(
      peutContacterLeBien({ utilisateurId: 7, destinataireId: null, resolution: null }),
    ).toBe(true);
  });
});
