/**
 * Ce que TCK-364 promet, et le seul moyen de le falsifier.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER N'ASSERTE PAS UNE CHAÎNE FRANÇAISE
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Le test naturel — « la date s'affiche `14 mars 2026` » — est **coché par le code qu'on vient de
 * retirer**. `new Intl.DateTimeFormat('fr-FR', …)` le passe, et c'était précisément le défaut. Un
 * critère qu'une régression coche aussi n'est pas un critère.
 *
 * Ce qui le peut, c'est une propriété que le littéral `'fr-FR'` viole par construction : **la même
 * date, dans les trois locales, donne trois chaînes DIFFÉRENTES**. Une seule d'entre elles peut
 * être française.
 *
 * ⚠️ Ça repose sur un fait d'environnement, mesuré le 2026-08-27 sur Node v24.18.0 : `wo` EST
 * servi par l'ICU embarqué (`new Intl.DateTimeFormat('wo').resolvedOptions().locale` → `'wo'`),
 * et rend `14 Mar, 2026` là où `fr-SN` rend `14 mars 2026`. Le docblock de
 * `src/lib/format.ts` affirme l'inverse (« Wolof isn't shipped in CLDR for most runtimes ») —
 * d'où le premier cas ci-dessous, qui mesure au lieu de croire : si un runtime futur replie `wo`
 * sur la racine, c'est LUI qui rougit, avec son nom, plutôt que les quatre autres en cascade.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LOCALES, type Locale } from '@/i18n/config';
import { withIntl } from '@/test/intl';
import { DATE_COURTE, formatteursPour, useFormatteurs, VALEUR_ABSENTE } from '../useFormatteurs';

/** Un instant sans ambiguïté de fuseau : Dakar est à UTC+0 toute l'année. */
const INSTANT = '2026-03-14T09:05:00Z';

function Consommateur() {
  const fmt = useFormatteurs();
  return <span data-testid="rendu">{fmt.dateTime(INSTANT)}</span>;
}

describe('le préalable d’environnement', () => {
  it('sert les trois locales par un ICU distinct — sinon rien en dessous n’a de sens', () => {
    const resolues = LOCALES.map((l) => new Intl.DateTimeFormat(l).resolvedOptions().locale);
    expect(new Set(resolues).size).toBe(3);
  });
});

describe('formatteursPour — la partie pure', () => {
  it('rend TROIS chaînes différentes pour la MÊME date', () => {
    const rendus = LOCALES.map((l) => formatteursPour(l).dateTime(INSTANT));

    expect(new Set(rendus).size).toBe(3);
    // Et l'une d'elles seulement est la française — l'ancien comportement.
    expect(rendus.filter((r) => r.includes('mars'))).toHaveLength(1);
  });

  it('rend TROIS nombres différents pour le MÊME entier', () => {
    const rendus = LOCALES.map((l) => formatteursPour(l).nombre(1_234_567.89));

    expect(new Set(rendus).size).toBe(3);
  });

  it('rend la valeur absente plutôt qu’une chaîne vide', () => {
    const fmt = formatteursPour('fr');

    expect(fmt.date(null)).toBe(VALEUR_ABSENTE);
    expect(fmt.dateTime(undefined)).toBe(VALEUR_ABSENTE);
    expect(fmt.date('pas-une-date')).toBe(VALEUR_ABSENTE);
  });

  it('accepte DATE_COURTE — `dateStyle` + composants lèverait un TypeError', () => {
    // Régression : `formatDate` de `@/lib/format` pose `dateStyle: 'medium'` en défaut puis étale
    // les options. Sans `sansStyleParDefaut`, cette ligne jette
    // `TypeError: Invalid option : option` — à l'exécution seulement, tsc et ESLint la laissent
    // passer. C'est ce qui a fait rougir `AgencyModerationCard` pendant l'implémentation.
    expect(() => formatteursPour('fr').date('2026-01-15T10:00:00Z', DATE_COURTE)).not.toThrow();
    expect(formatteursPour('fr').date('2026-01-15T10:00:00Z', DATE_COURTE)).toBe('15 janv. 2026');
  });

  it('formate le montant au contrat du dépôt, pas au code ISO', () => {
    expect(formatteursPour('fr').montant(150_000, 'XOF')).toContain('F CFA');
  });
});

describe('useFormatteurs — la locale vient bien de next-intl', () => {
  it.each(LOCALES.map((l) => [l] as [Locale]))(
    'suit la locale du provider (%s) sans qu’aucun appelant ne la passe',
    (locale) => {
      const { unmount } = render(withIntl(<Consommateur />, locale));

      expect(screen.getByTestId('rendu')).toHaveTextContent(formatteursPour(locale).dateTime(INSTANT));
      unmount();
    },
  );

  it('les trois rendus diffèrent — un `fr-FR` en dur les rendrait identiques', () => {
    const rendus = LOCALES.map((locale) => {
      const { getByTestId, unmount } = render(withIntl(<Consommateur />, locale));
      const texte = getByTestId('rendu').textContent ?? '';
      unmount();
      return texte;
    });

    expect(new Set(rendus).size).toBe(3);
  });
});
