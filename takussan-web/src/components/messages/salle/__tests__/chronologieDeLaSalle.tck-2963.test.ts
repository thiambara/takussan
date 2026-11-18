/**
 * TCK-2963 (AC4) — la chronologie d'une salle : un mois passé sous UN séparateur, ses événements repliés (même
 * un seul) ; le mois courant jour par jour, ses suites d'événements repliées mais OUVERTES. L'ordre n'est
 * jamais changé : une carte ou un message coupe une suite.
 */
import { describe, expect, it } from 'vitest';

import { chronologieDeLaSalle } from '../chronologieDeLaSalle';
import { message } from './donnees';

const MAINTENANT = new Date('2026-11-18T12:00:00Z');

describe('chronologieDeLaSalle (TCK-2963)', () => {
  it('replie les événements d’un mois passé, ouvre ceux du mois courant', () => {
    const septembre = [message('event', '2026-09-02T09:00:00Z'), message('event', '2026-09-12T09:00:00Z')];
    const octobre = message('event', '2026-10-05T09:00:00Z');
    const novembre = [message('event', '2026-11-05T09:00:00Z'), message('event', '2026-11-05T10:00:00Z')];

    const sortie = chronologieDeLaSalle([...novembre, octobre, ...septembre], MAINTENANT);

    expect(sortie.map((e) => e.kind)).toEqual(['mois', 'evenements', 'mois', 'evenements', 'separator', 'evenements']);
    const replis = sortie.filter((e) => e.kind === 'evenements');
    expect(replis.map((e) => e.kind === 'evenements' && e.ouvert)).toEqual([false, false, true]);
    expect(replis.map((e) => e.kind === 'evenements' && e.messages.length)).toEqual([2, 1, 2]);
    expect(replis.map((e) => e.kind === 'evenements' && e.passe)).toEqual([true, true, false]);
  });

  it('un événement seul du mois courant reste une ligne', () => {
    const sortie = chronologieDeLaSalle([message('event', '2026-11-18T08:00:00Z')], MAINTENANT);
    expect(sortie.map((e) => e.kind)).toEqual(['separator', 'message']);
  });

  it('un message coupe la suite d’un mois passé, sans changer l’ordre', () => {
    const a = message('event', '2026-10-01T09:00:00Z');
    const texte = message('text', '2026-10-02T09:00:00Z');
    const b = message('event', '2026-10-03T09:00:00Z');

    const sortie = chronologieDeLaSalle([b, texte, a], MAINTENANT);

    expect(sortie.map((e) => e.kind)).toEqual(['mois', 'evenements', 'message', 'evenements']);
    const texteRendu = sortie[2];
    expect(texteRendu?.kind === 'message' && texteRendu.message.id).toBe(texte.id);
    expect(texteRendu?.kind === 'message' && texteRendu.passe).toBe(true);
  });

  it('un événement qui attend le lecteur reste une carte, hors de la suite', () => {
    const geste = message('event', '2026-10-02T09:00:00Z', { action_attendue: true });
    const sortie = chronologieDeLaSalle([message('event', '2026-10-01T09:00:00Z'), geste], MAINTENANT);
    expect(sortie.map((e) => e.kind)).toEqual(['mois', 'evenements', 'message']);
  });

  it('un mois d’une autre année a son propre séparateur', () => {
    const sortie = chronologieDeLaSalle([message('text', '2025-11-20T09:00:00Z'), message('text', '2026-11-02T09:00:00Z')], MAINTENANT);
    expect(sortie.map((e) => e.kind)).toEqual(['mois', 'message', 'separator', 'message']);
  });
});
