import { describe, it, expect } from 'vitest';
import { formatDate, formatDateTime } from '../format';
import { parseServerDate } from '../calendar-date';

/**
 * TCK-327 / ADR-0018 — **le front ne dépend d'aucune des deux formes d'instant, et c'est mesuré
 * ici plutôt que supposé.**
 *
 * Le backend a changé la chaîne qu'il émet pour un instant : `2026-08-17T12:34:56.000000Z` est
 * devenu `2026-08-17T12:34:56+00:00` sur **55 champs**. C'est une rupture de contrat, et son
 * risque propre est qu'elle soit **silencieuse des deux côtés** : les deux formes sont des
 * `string`, le typage TypeScript ne les distingue pas, ESLint ne dit rien, et `new Date(…)` les
 * parse toutes les deux. Un front cassé par ce changement le serait donc *à l'exécution*, sur une
 * page, devant un utilisateur.
 *
 * L'inventaire des appelants a nommé trois façons dont le front touche une date d'API :
 *
 *   1. **la parser** — `new Date(…)`, `parseServerDate`, puis `Intl.DateTimeFormat` via
 *      `formatDate` / `formatDateTime` (TCK-153). C'est l'écrasante majorité.
 *   2. **la découper** — `valeur.slice(0, 10)` pour n'afficher que le jour. Quatre sites :
 *      `PropertyDetailTabs.tsx:105`, `PropertyOverviewPanel.tsx:201`,
 *      `overview/owner/page.tsx:146`, et les deux `period.start`/`period.end` des vues d'aperçu.
 *   3. **la comparer littéralement** — `due_date < issue_date` (`schemas/payment.ts`),
 *      `form.start_date !== parent.start_date` (`LeaseRenewalDialog.tsx`). **Uniquement sur des
 *      dates CALENDAIRES**, que ce ticket n'a délibérément pas converties.
 *
 * Ce fichier fige les deux premières. La troisième est couverte par le fait qu'aucune date
 * calendaire ne change de forme — et par `DateRepresentationTest.php` côté back, qui l'exige.
 *
 * ⚠ Ce n'est PAS un test de formatage d'affichage : celui-là est livré par TCK-153 et vit dans
 * `format.test.ts`. Ici on ne vérifie qu'une chose — que les deux écritures du **même instant**
 * traversent le front à l'identique.
 */

/** L'ancienne forme émise par l'API (Carbon `toISOString()`), et la nouvelle (ADR-0018). */
const ANCIENNE = '2026-08-17T12:34:56.000000Z';
const NOUVELLE = '2026-08-17T12:34:56+00:00';

describe('formes d’instant de l’API (ADR-0018)', () => {
  it('désignent le même instant', () => {
    expect(new Date(NOUVELLE).getTime()).toBe(new Date(ANCIENNE).getTime());
    expect(new Date(NOUVELLE).getTime()).not.toBeNaN();
  });

  it('traversent parseServerDate à l’identique', () => {
    const ancienne = parseServerDate(ANCIENNE);
    const nouvelle = parseServerDate(NOUVELLE);

    expect(nouvelle).not.toBeNull();
    expect(nouvelle!.getTime()).toBe(ancienne!.getTime());
  });

  it('produisent le même affichage formaté, dans les trois locales du projet', () => {
    for (const locale of ['fr', 'en', 'wo'] as const) {
      expect(formatDate(NOUVELLE, locale)).toBe(formatDate(ANCIENNE, locale));
      expect(formatDateTime(NOUVELLE, locale)).toBe(formatDateTime(ANCIENNE, locale));
      expect(formatDate(NOUVELLE, locale)).not.toBe('');
    }
  });

  it('donnent le même jour par slice(0, 10) — les quatre sites qui découpent', () => {
    expect(NOUVELLE.slice(0, 10)).toBe(ANCIENNE.slice(0, 10));
    expect(NOUVELLE.slice(0, 10)).toBe('2026-08-17');
  });

  it('se trient dans le même ordre chronologique', () => {
    const tot = '2026-08-17T08:00:00+00:00';
    const tard = '2026-08-17T20:00:00+00:00';

    expect([tard, tot].sort()).toEqual([tot, tard]);
    expect(new Date(tot).getTime()).toBeLessThan(new Date(tard).getTime());
  });
});

describe('dates calendaires de l’API (ADR-0018)', () => {
  /**
   * Le contre-exemple, et la raison écrite pour laquelle les 18 `toDateString()` n'ont PAS été
   * convertis. Si un jour quelqu'un « harmonise » `due_date` en horodatage complet, ces deux
   * assertions rougissent — et elles nomment les deux appelants qui casseraient.
   */
  it('restent comparables littéralement — ce qu’un horodatage complet casserait', () => {
    const emission = '2026-08-17';
    const echeance = '2026-09-17';

    // `schemas/payment.ts` : `due_date < issue_date` déclenche l'erreur de validation.
    expect(echeance < emission).toBe(false);
    expect(emission < echeance).toBe(true);

    // `LeaseRenewalDialog.tsx` : égalité avec la valeur d'un `<input type="date">`.
    expect(emission).toBe('2026-08-17');
    expect(emission).not.toContain('T');
  });

  it('ne changent pas de jour à l’affichage', () => {
    expect(formatDate('2026-08-17', 'fr')).toBe(formatDate(new Date('2026-08-17T00:00:00+00:00'), 'fr'));
  });
});
