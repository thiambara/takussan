/**
 * TCK-2954 — la forme du signal, ses canaux, la règle du curseur, et l'hôte de la connexion.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('laravel-echo', () => ({ default: class {} }));
vi.mock('pusher-js', () => ({ default: class {} }));

import { Curseurs, canalDeLaCible, canalDuSujet, lireSignal, sujetDuCanal } from '../signal';
import { optionsDHote } from '../connexion';

const s = (subject: string, cursor: string, event = 'message.created') => ({ subject, event, cursor });

describe('lireSignal', () => {
  it('ne recopie que les trois clés', () => {
    expect(lireSignal({ ...s('conversation:42', '2026-11-18T00:49:34.187325Z'), body: 'secret' })).toEqual(
      s('conversation:42', '2026-11-18T00:49:34.187325Z'),
    );
  });

  it.each([
    ['sujet sans identifiant', s('conversation:', '2026-11-18T00:49:34.187325Z')],
    ['identifiant nul', s('conversation:0', '2026-11-18T00:49:34.187325Z')],
    ['type en majuscules', s('Conversation:1', '2026-11-18T00:49:34.187325Z')],
    ['curseur en millisecondes', s('conversation:1', '2026-11-18T00:49:34.187Z')],
    ['événement vide', s('conversation:1', '2026-11-18T00:49:34.187325Z', '')],
    ['null', null],
  ])('%s : ignoré', (_cas, brut) => {
    expect(lireSignal(brut)).toBeNull();
  });
});

describe('les canaux', () => {
  it('sujet ↔ canal, et canal personnel de la session', () => {
    expect(canalDuSujet('conversation:42')).toBe('sujet.conversation.42');
    expect(sujetDuCanal('sujet.conversation.42')).toBe('conversation:42');
    expect(sujetDuCanal('utilisateur.7')).toBeNull();
    expect(canalDeLaCible({ personnel: ['notifications.updated'] }, 7)).toBe('utilisateur.7');
    expect(canalDeLaCible({ personnel: ['notifications.updated'] }, null)).toBeNull();
    expect(canalDeLaCible('pas-un-sujet', 7)).toBeNull();
  });
});

describe('Curseurs', () => {
  it('ignore un curseur plus ancien ou égal, par canal ET par couple (subject, event)', () => {
    const c = new Curseurs();
    expect(c.retenir('sujet.conversation.42', s('conversation:42', '2026-11-18T00:00:00.000002Z'))).toBe(true);
    expect(c.retenir('sujet.conversation.42', s('conversation:42', '2026-11-18T00:00:00.000002Z'))).toBe(false);
    expect(c.retenir('sujet.conversation.42', s('conversation:42', '2026-11-18T00:00:00.000001Z'))).toBe(false);
    // Un autre événement du même sujet a son propre curseur.
    expect(
      c.retenir('sujet.conversation.42', s('conversation:42', '2026-11-18T00:00:00.000002Z', 'conversation.read')),
    ).toBe(true);
    // La même émission atteint aussi le canal personnel : elle n'y est pas tue.
    expect(c.retenir('utilisateur.7', s('conversation:42', '2026-11-18T00:00:00.000002Z'))).toBe(true);
    expect(c.retenir('sujet.conversation.42', s('conversation:42', '2026-11-18T00:00:00.000003Z'))).toBe(true);
  });
});

describe('optionsDHote', () => {
  it('ws://hôte:port, et wss sur 443 par défaut', () => {
    expect(optionsDHote('ws://127.0.0.1:8081')).toEqual({ wsHost: '127.0.0.1', wsPort: 8081, wssPort: 8081, forceTLS: false });
    expect(optionsDHote('wss://temps-reel.exemple.test')).toEqual({
      wsHost: 'temps-reel.exemple.test',
      wsPort: 443,
      wssPort: 443,
      forceTLS: true,
    });
  });
});
