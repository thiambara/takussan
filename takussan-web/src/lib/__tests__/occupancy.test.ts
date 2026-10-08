import { describe, expect, it } from 'vitest';

import { isNightOccupied, isStayFree } from '../occupancy';

/** TCK-596 §3B — nuits en [début, fin) : le jour de départ est libre pour une arrivée. */
const PRISES = [
  { start: '2026-11-10', end: '2026-11-13' },
  { start: '2026-11-20', end: '2026-11-21' },
];

describe('occupancy', () => {
  it('une nuit prise l’est du premier jour jusqu’à la veille du départ', () => {
    expect(isNightOccupied('2026-11-09', PRISES)).toBe(false);
    expect(isNightOccupied('2026-11-10', PRISES)).toBe(true);
    expect(isNightOccupied('2026-11-12', PRISES)).toBe(true);
    expect(isNightOccupied('2026-11-13', PRISES)).toBe(false);
  });

  it('un séjour qui finit le jour d’une arrivée, ou commence le jour d’un départ, est libre', () => {
    expect(isStayFree('2026-11-07', '2026-11-10', PRISES)).toBe(true);
    expect(isStayFree('2026-11-13', '2026-11-20', PRISES)).toBe(true);
  });

  it('un séjour qui franchit ou englobe une plage prise ne l’est pas', () => {
    expect(isStayFree('2026-11-08', '2026-11-11', PRISES)).toBe(false);
    expect(isStayFree('2026-11-14', '2026-11-25', PRISES)).toBe(false);
    expect(isStayFree('2026-11-05', '2026-11-30', PRISES)).toBe(false);
  });

  it('un séjour vide ou inversé n’est jamais libre', () => {
    expect(isStayFree('2026-11-05', '2026-11-05', [])).toBe(false);
    expect(isStayFree('2026-11-06', '2026-11-05', [])).toBe(false);
  });
});
