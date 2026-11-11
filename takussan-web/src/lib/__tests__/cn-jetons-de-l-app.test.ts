import { describe, expect, it } from 'vitest';

import { cn } from '@/lib/utils';

/**
 * TCK-2685 — `cn()` (= `twMerge(clsx())`) connaît les jetons de la partie connectée.
 *
 * Mesuré avant l'extension : `cn('text-ui', 'text-foreground')` rendait `text-foreground` seul
 * (`text-ui`, inconnu, pris pour une couleur), et `cn('shadow-feuille', 'shadow-sm')` gardait les deux.
 * Toutes les primitives de TCK-2686 à TCK-2691 passent par `cva` + `cn` : sans cette table, une taille
 * de texte disparaîtrait à la première couleur posée par l'appelant, sans erreur.
 */
const t = (n: string) => `text-${n}`;

describe('TCK-2685 — cn() et les jetons de l’app', () => {
  it.each(['pastille', 'legende', 'ui', 'corps', 'action', 'titre-court', 'affiche-22', 'affiche-40'])(
    'une taille %s survit à une couleur, et une couleur à elle',
    (n) => {
      expect(cn(t(n), t('foreground'))).toBe(`${t(n)} ${t('foreground')}`);
      expect(cn(t('muted-foreground'), t(n))).toBe(`${t('muted-foreground')} ${t(n)}`);
      expect(cn(t(n), t('encre-douce'))).toBe(`${t(n)} ${t('encre-douce')}`);
    },
  );

  it('une taille de l’app et une taille du thème se remplacent (dernière gagnante)', () => {
    expect(cn(t('sm'), t('ui'))).toBe(t('ui'));
    expect(cn(t('ui'), t('xs'))).toBe(t('xs'));
    expect(cn(t('corps'), t('ui'))).toBe(t('ui'));
  });

  it('l’encre douce reste une couleur : elle remplace une autre couleur', () => {
    expect(cn(t('foreground'), t('encre-douce'))).toBe(t('encre-douce'));
  });

  it('ombres, espacement des lettres et taille d’icône se remplacent comme les leurs', () => {
    expect(cn('shadow-sm', 'shadow-feuille')).toBe('shadow-feuille');
    expect(cn('shadow-carte-d-entree', 'shadow-sm')).toBe('shadow-sm');
    expect(cn('shadow-carte-levee', 'shadow-sm')).toBe('shadow-sm');
    expect(cn('shadow-filet', 'shadow-none')).toBe('shadow-none');
    expect(cn('tracking-tight', 'tracking-titre')).toBe('tracking-titre');
    expect(cn('size-4', 'size-icone')).toBe('size-icone');
  });

  it('la variante `w1440:` reste une variante distincte', () => {
    expect(cn('xl:flex', 'w1440:grid')).toBe('xl:flex w1440:grid');
  });
});
