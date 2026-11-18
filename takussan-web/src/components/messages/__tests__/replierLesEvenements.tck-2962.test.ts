/**
 * TCK-2962 (AC4) — le repli des événements, fonction pure : les `event` consécutifs sans geste attendu se
 * replient (à partir de deux) ; un séparateur de jour, un message, une carte ou un événement qui attend le
 * lecteur coupe la suite.
 */
import { describe, expect, it } from 'vitest';
import type { ChatRenderItem } from '@/lib/messages/groupByDay';
import type { Message } from '@/types/message';
import { natureDuMessage, replierLesEvenements } from '../cartes/replierLesEvenements';

function m(id: number, type: Message['type'], action_attendue?: boolean): ChatRenderItem {
  return { kind: 'message', message: { id, type, action_attendue } as Message };
}
const jour = (cle: string): ChatRenderItem => ({ kind: 'separator', key: cle, date: new Date('2026-11-18') });

function forme(items: ReturnType<typeof replierLesEvenements>): string[] {
  return items.map((i) => (i.kind === 'evenements' ? `[${i.messages.map((x) => x.id).join(',')}]` : i.kind === 'separator' ? '|' : String(i.message.id)));
}

describe('replierLesEvenements', () => {
  it('trois événements consécutifs → une ligne ; celui qui attend le lecteur reste à part, en carte', () => {
    const sortie = replierLesEvenements([m(1, 'event'), m(2, 'event'), m(3, 'event'), m(4, 'event', true), m(5, 'text')]);
    expect(forme(sortie)).toEqual(['[1,2,3]', '4', '5']);
    expect(natureDuMessage({ type: 'event', action_attendue: true } as Message)).toBe('carte');
  });

  it('un événement seul reste une ligne ; un message, une carte ou un jour coupent la suite', () => {
    expect(forme(replierLesEvenements([m(1, 'event'), m(2, 'text'), m(3, 'event')]))).toEqual(['1', '2', '3']);
    expect(forme(replierLesEvenements([m(1, 'event'), m(2, 'event'), jour('j'), m(3, 'event'), m(4, 'event')]))).toEqual(['[1,2]', '|', '[3,4]']);
    expect(forme(replierLesEvenements([m(1, 'event'), m(2, 'card'), m(3, 'event')]))).toEqual(['1', '2', '3']);
  });

  it('un avis système (`system`) ne se replie pas avec les événements', () => {
    expect(forme(replierLesEvenements([m(1, 'event'), m(2, 'system'), m(3, 'event')]))).toEqual(['1', '2', '3']);
  });
});
