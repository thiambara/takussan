/**
 * TCK-1502 (P94.02) — le contrat de l'agenda : `GET /api/calendar` émet `start`/`end` en heure
 * murale UTC (`2026-10-18 21:54:01`, sans `T` ni fuseau), et `parseServerDate` la lit en heure
 * LOCALE du navigateur. L'agenda affiche donc l'heure murale, quel que soit le fuseau.
 *
 * Le navigateur est forcé à Paris AVANT toute date : sous UTC (Dakar, UTC+0), les deux lectures
 * coïncident et le test ne prouverait rien — la précondition le vérifie. Le pendant API est
 * `takussan-api/tests/Feature/Calendar/CalendarWallClockFormTest.php`, qui épingle la forme émise :
 * changer de contrat (passer le collecteur à `iso()`) se fait des deux côtés à la fois.
 */
process.env.TZ = 'Europe/Paris';

import { describe, expect, it } from 'vitest';
import { parseServerDate } from '@/lib/calendar-date';

describe('parseServerDate — navigateur à Europe/Paris', () => {
  it('précondition : le navigateur n’est pas à UTC', () => {
    expect(new Date('2026-10-18T21:54:01Z').getTimezoneOffset()).not.toBe(0);
  });

  it('lit la forme murale de l’API à l’heure écrite, sans décalage', () => {
    const d = parseServerDate('2026-10-18 21:54:01');
    expect(d).not.toBeNull();
    expect(d!.getDate()).toBe(18);
    expect(d!.getHours()).toBe(21);
    expect(d!.getMinutes()).toBe(54);
  });

  it('une forme à fuseau (`iso()`) serait décalée : ce n’est pas le contrat de l’agenda', () => {
    const d = parseServerDate('2026-10-18T21:54:01+00:00');
    expect(d!.getHours()).toBe(23);
  });
});
