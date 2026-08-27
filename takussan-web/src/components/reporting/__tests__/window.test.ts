import { describe, expect, it } from 'vitest';

import { enDate, estPlageLibre, fenetrePrecedente, parametresFenetre } from '../window';

describe('fenêtre de rapport (TCK-361)', () => {
  it('rend le raccourci quand aucune plage libre n’est posée', () => {
    expect(estPlageLibre({ period: '12m' })).toBe(false);
    expect(parametresFenetre({ period: '12m' })).toEqual({ period: '12m' });
  });

  it('rend les deux bornes quand une plage libre est posée', () => {
    const fenetre = { period: '12m' as const, startsAt: '2026-01-01', endsAt: '2026-03-31' };

    expect(estPlageLibre(fenetre)).toBe(true);
    expect(parametresFenetre(fenetre)).toEqual({ starts_at: '2026-01-01', ends_at: '2026-03-31' });
  });

  /**
   * Une borne SEULE ne décrit aucune fenêtre. L'API la refuse (`required_with` croisé) ; ici on
   * vérifie que le front ne la lui envoie même pas, et retombe sur le raccourci.
   */
  it('ignore une borne isolée', () => {
    expect(parametresFenetre({ period: '6m', startsAt: '2026-01-01' })).toEqual({ period: '6m' });
    expect(parametresFenetre({ period: '6m', endsAt: '2026-03-31' })).toEqual({ period: '6m' });
  });

  describe('fenêtre précédente', () => {
    it('rend AUTANT DE BUCKETS que la série affichée, immédiatement avant elle', () => {
      const precedente = fenetrePrecedente([
        { starts_at: '2026-03-01T00:00:00+00:00', ends_at: '2026-03-31T23:59:59+00:00' },
        { starts_at: '2026-04-01T00:00:00+00:00', ends_at: '2026-04-30T23:59:59+00:00' },
      ], 'month');

      expect(precedente).not.toBeNull();
      // Deux buckets affichés → DEUX buckets comparés, collés à la borne de gauche.
      expect(precedente!.starts_at).toBe('2026-01-01');
      expect(precedente!.ends_at).toBe('2026-02-28');
    });

    /**
     * D8 — **la granularité est un paramètre, pas un commentaire.**
     *
     * Elle était une « précondition » écrite en prose : trois buckets JOURNALIERS rendaient
     * `2025-12-01 → 2026-02-28`, trois MOIS au lieu de trois jours — une comparaison fausse d'un
     * facteur 30, silencieuse. Les deux appelants passaient `month`, donc rien ne rougissait ; le
     * défaut attendait le premier sélecteur de granularité.
     */
    it('décale de trois JOURS des buckets journaliers, pas de trois mois', () => {
      const precedente = fenetrePrecedente([
        { starts_at: '2026-03-10T00:00:00+00:00', ends_at: '2026-03-10T23:59:59+00:00' },
        { starts_at: '2026-03-11T00:00:00+00:00', ends_at: '2026-03-11T23:59:59+00:00' },
        { starts_at: '2026-03-12T00:00:00+00:00', ends_at: '2026-03-12T23:59:59+00:00' },
      ], 'day');

      expect(precedente).toEqual({ starts_at: '2026-03-07', ends_at: '2026-03-09' });
    });

    it('décale de deux SEMAINES des buckets hebdomadaires', () => {
      const precedente = fenetrePrecedente([
        { starts_at: '2026-03-09T00:00:00+00:00', ends_at: '2026-03-15T23:59:59+00:00' },
        { starts_at: '2026-03-16T00:00:00+00:00', ends_at: '2026-03-22T23:59:59+00:00' },
      ], 'week');

      expect(precedente).toEqual({ starts_at: '2026-02-23', ends_at: '2026-03-08' });
    });

    /** Le décalage traverse les bornes de mois sans arithmétique maison — `Date` le fait. */
    it('traverse une borne de mois en granularité journalière', () => {
      const precedente = fenetrePrecedente([
        { starts_at: '2026-03-01T00:00:00+00:00', ends_at: '2026-03-01T23:59:59+00:00' },
        { starts_at: '2026-03-02T00:00:00+00:00', ends_at: '2026-03-02T23:59:59+00:00' },
      ], 'day');

      expect(precedente).toEqual({ starts_at: '2026-02-27', ends_at: '2026-02-28' });
    });

    it('rend null sur une série vide — il n’y a alors rien à comparer', () => {
      expect(fenetrePrecedente([], 'month')).toBeNull();
    });

    it('rend null sur des bornes illisibles plutôt qu’une fenêtre de NaN', () => {
      expect(fenetrePrecedente([{ starts_at: 'pas-une-date', ends_at: 'non plus' }], 'month')).toBeNull();
    });
  });

  /**
   * `toISOString()` bascule en UTC : à Dakar (UTC+0) c'est sans effet, mais une machine en UTC+2
   * — celles de la CI comprises — reculerait la date d'un jour sur tout `Date` de fin de journée.
   */
  it('formate une date en heure LOCALE, pas en UTC', () => {
    expect(enDate(new Date(2026, 0, 1, 23, 30))).toBe('2026-01-01');
    expect(enDate(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
  });
});
