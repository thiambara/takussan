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
 * ⚠️ **La propriété a été RESSERRÉE le 2026-08-27, et il faut dire pourquoi.** Elle disait « TROIS
 * chaînes différentes ». Elle reposait sur un `wo` rendu par l'ICU embarqué — vrai sur Node
 * v24.18.0 (`new Intl.DateTimeFormat('wo').resolvedOptions().locale` → `'wo'`), et c'était un
 * DÉFAUT plutôt qu'une propriété : `wo` groupait les milliers par un point (`1.234.567,89`) quand
 * le montant de la même carte, lui, passait déjà par `fr-SN` (`150 000 F CFA`), et quand l'axe du
 * même écran passait par date-fns, qui n'a pas de wolof et rend `mars`. Deux conventions de nombre
 * et deux de date sur un seul tableau de bord.
 *
 * `@/lib/format` aligne donc `wo` sur `fr-SN` — le raisonnement complet, avec ses mesures, est dans
 * l'en-tête de `src/lib/format.ts`. La propriété devient : **`en` se distingue, `wo` coïncide avec
 * `fr` DÉLIBÉRÉMENT**. Elle falsifie toujours le défaut qu'elle visait (un `'fr-FR'` en dur rend
 * UNE seule chaîne, pas deux), et le cas `wo` ci-dessous rougit sur l'autre décision — celle qui
 * rendrait du `wo` ICU réel.
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
  it('sert `fr-SN` et `en-GB` par un ICU distinct — sinon rien en dessous n’a de sens', () => {
    const resolues = ['fr-SN', 'en-GB'].map((l) => new Intl.DateTimeFormat(l).resolvedOptions().locale);
    expect(resolues).toEqual(['fr-SN', 'en-GB']);
  });

  it('⚠ mesure ce que `wo` fait RÉELLEMENT, au lieu de croire un docblock', () => {
    // Ce cas ne coche aucun AC : il DATE un fait d'environnement dont dépend la décision prise
    // dans `@/lib/format`. Le docblock que TCK-374 a corrigé affirmait que `wo` n'était « pas
    // livré par CLDR sur la plupart des runtimes » et qu'un TABLEAU forçait un repli sur `fr-SN`.
    // Les deux moitiés sont fausses ici, et c'est mesurable en deux lignes.
    expect(Intl.NumberFormat.supportedLocalesOf(['wo'])).toEqual(['wo']);
    expect(new Intl.NumberFormat(['wo', 'fr-SN']).resolvedOptions().locale).toBe('wo');

    // Si un runtime FUTUR cesse de servir `wo`, c'est ce cas-ci qui rougit, avec son nom — et la
    // décision de `@/lib/format` (aligner sur `fr-SN`) n'en devient que plus juste, pas moins.
  });
});

describe('formatteursPour — la partie pure', () => {
  it('distingue `en` de `fr` sur la MÊME date — un `fr-FR` en dur ne le ferait pas', () => {
    const rendus = LOCALES.map((l) => formatteursPour(l).dateTime(INSTANT));

    // Le défaut visé est « toutes les locales rendent la même chose » : deux chaînes distinctes le
    // falsifient, trois ne sont pas nécessaires — et l'exiger fabriquait le défaut `wo`.
    expect(new Set(rendus).size).toBe(2);
    expect(formatteursPour('en').dateTime(INSTANT)).not.toBe(formatteursPour('fr').dateTime(INSTANT));
    // La française est la seule des deux formes ; `wo` la partage, cf. le cas dédié ci-dessous.
    expect(rendus.filter((r) => r.includes('mars'))).toHaveLength(2);
  });

  it('distingue `en` de `fr` sur le MÊME entier', () => {
    const rendus = LOCALES.map((l) => formatteursPour(l).nombre(1_234_567.89));

    expect(new Set(rendus).size).toBe(2);
    expect(formatteursPour('en').nombre(1_234_567.89)).toBe('1,234,567.89');
  });

  it('⚠ rend `wo` aux conventions SÉNÉGALAISES, pas aux données CLDR de `wo` (D1)', () => {
    // ────────────────────────────────────────────────────────────────────────────────────────
    // LE CAS QUI PORTE LA DÉCISION. Il rougit sur l'AUTRE choix — celui qui laisserait `Intl`
    // rendre du `wo` réel — et il rougit sur CHACUNE de ses trois conséquences séparément, pour
    // que le message dise laquelle a bougé plutôt que « une chaîne a changé ».
    //
    // Mesuré le 2026-08-27, Node v24.18.0 :   `wo` → 1.234.567,89 · 14 Mar, 2026 · F CFA 150.000
    //                                       `fr-SN` → 1 234 567,89 · 14 mars 2026 · 150 000 F CFA
    // ────────────────────────────────────────────────────────────────────────────────────────
    const wo = formatteursPour('wo');
    const fr = formatteursPour('fr');

    // 1. Le nombre : espace de groupement, jamais le POINT des données CLDR `wo`.
    expect(wo.nombre(1_234_567.89)).toBe(fr.nombre(1_234_567.89));
    expect(wo.nombre(1_234_567.89)).not.toContain('.');
    expect(wo.nombre(1_234_567.89).replace(/\p{White_Space}/gu, '')).toBe('1234567,89');

    // 2. La date : le mois français de date-fns, jamais l'abrégé anglais `Mar` de `wo`.
    expect(wo.dateTime(INSTANT)).toBe(fr.dateTime(INSTANT));
    expect(wo.date(INSTANT)).toContain('mars');

    // 3. Le montant : `150 000 F CFA`, jamais `F CFA 150.000`. C'est la moitié qui avait DÉJÀ
    //    raison — l'assertion existe pour que la table reste UNE, et pas deux qui divergent.
    expect(wo.montant(150_000, 'XOF')).toBe(fr.montant(150_000, 'XOF'));
    expect(wo.montant(150_000, 'XOF')).toContain('F CFA');
    expect(wo.montant(150_000, 'XOF')).not.toContain('150.000');
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

  it('le rendu `en` diffère du rendu `fr` — un `fr-FR` en dur les rendrait identiques', () => {
    const rendus = LOCALES.map((locale) => {
      const { getByTestId, unmount } = render(withIntl(<Consommateur />, locale));
      const texte = getByTestId('rendu').textContent ?? '';
      unmount();
      return texte;
    });

    // `fr` et `wo` coïncident délibérément (cf. l'en-tête) ; `en` doit se détacher des deux.
    expect(new Set(rendus).size).toBe(2);
    const [rendufr, renduEn, renduWo] = rendus;
    expect(renduEn).not.toBe(rendufr);
    expect(renduWo).toBe(rendufr);
  });
});
