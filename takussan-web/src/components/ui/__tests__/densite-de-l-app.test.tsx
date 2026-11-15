import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { FIELD_DENSITY_HEIGHT } from '@/components/ui/field-density';

/**
 * TCK-2686 — ce que les primitives PORTENT pour suivre l'échelle de densité de `/app`. La feuille
 * (ce que la portée fait des jetons) est gardée par `src/app/__tests__/densite-de-l-app.test.ts` ;
 * le rendu, au navigateur sur la vitrine (notes du ticket).
 *
 * ⚠ Classes assemblées par morceaux : Tailwind scanne aussi les tests, et une assertion en forme de
 * classe y émettrait une règle.
 */
const classes = (el: Element) => el.className.split(/\s+/);
const H = 'h';

describe('Button — la hauteur et l’aspect viennent des jetons de densité', () => {
  it.each([
    ['default', [`${H}-controle`]],
    ['icon', ['size-controle']],
    ['sm', [`${H}-controle-petit`, 'text-petit-bouton', 'px-petit-bouton-x', 'gap-petit-bouton-espace', 'rounded-petit-bouton']],
    ['xl', [`${H}-controle-action`, 'px-5', 'text-corps']],
  ] as const)('taille %s', (size, attendues) => {
    render(<Button size={size}>Faire</Button>);
    const c = classes(screen.getByRole('button'));
    for (const a of attendues) expect(c).toContain(a);
    // Plus de hauteur figée de l'échelle : sinon la portée ne pourrait rien redéfinir.
    expect(c.filter((x) => /^(h|size)-\d/.test(x))).toEqual([]);
  });

  it.each([
    ['outline', ['bg-fond-contour'], ['bg-background']],
    ['secondary', ['text-encre-bouton-doux', 'font-bouton-doux'], ['font-medium', 'text-secondary-foreground']],
    ['destructive', ['border-bord-danger'], ['border-transparent']],
    ['ghost', ['text-encre-discrete'], []],
    ['sombre', ['bg-foreground', 'text-background'], ['bg-primary']],
  ] as const)('variante %s', (variant, presentes, absentes) => {
    render(<Button variant={variant}>Faire</Button>);
    const c = classes(screen.getByRole('button'));
    for (const a of presentes) expect(c).toContain(a);
    for (const a of absentes) expect(c).not.toContain(a);
  });

  it('les tailles et variantes existantes restent : défaut, `xs`, `icon-xs`, pression, survol', () => {
    render(<Button size="xs">Faire</Button>);
    const c = classes(screen.getByRole('button'));
    expect(c).toContain(`${H}-6`);
    expect(c).toContain('bg-primary');
    expect(c).toContain('hover:bg-[var(--primary-deep)]');
    expect(c).toContain('active:not-aria-[haspopup]:scale-[0.96]');
  });
});

describe('l’appelant qui écrit une hauteur ou une teinte GARDE LA MAIN (twMerge remplace le jeton)', () => {
  // Une classe `portee-app:h-9` ne se fusionne avec rien et vient plus tard dans la feuille : elle
  // aurait raboté les ~115 boutons dimensionnés par leur appelant (relevé du ticket).
  it.each([
    [{ className: `${H}-11` }, `${H}-controle`],
    [{ size: 'icon' as const, className: 'size-8' }, 'size-controle'],
    [{ size: 'sm' as const, className: 'text-xs' }, 'text-petit-bouton'],
    [{ variant: 'ghost' as const, className: 'text-destructive' }, 'text-encre-discrete'],
    [{ variant: 'outline' as const, className: 'bg-transparent' }, 'bg-fond-contour'],
    [{ variant: 'secondary' as const, className: 'font-semibold' }, 'font-bouton-doux'],
  ])('%o retire %s', (props, retiree) => {
    render(<Button {...props}>Faire</Button>);
    expect(classes(screen.getByRole('button'))).not.toContain(retiree);
  });

  it('Input : `bg-card` et une taille de texte d’appelant remplacent les jetons', () => {
    render(<Input aria-label="x" className="bg-card text-xs" />);
    const c = classes(screen.getByLabelText('x'));
    expect(c).not.toContain('bg-fond-champ');
    expect(c).not.toContain('text-champ');
  });
});

describe('les champs lisent les jetons (hauteur, texte, fond)', () => {
  it('Input', () => {
    render(<Input aria-label="x" />);
    const c = classes(screen.getByLabelText('x'));
    for (const a of [`${H}-controle`, 'text-champ', 'bg-fond-champ', FIELD_DENSITY_HEIGHT]) expect(c).toContain(a);
    for (const a of [`${H}-10`, 'text-base', 'md:text-sm', 'bg-transparent']) expect(c).not.toContain(a);
  });

  it('Textarea — `py-2.5 leading-snug` sous la portée, par ses jetons ; `min-h-*` d’appelant permis', () => {
    render(<Textarea aria-label="x" className="min-h-28" />);
    const c = classes(screen.getByLabelText('x'));
    for (const a of ['text-champ', 'bg-fond-champ', 'py-zone-texte-y', 'leading-zone-texte', 'min-h-28']) expect(c).toContain(a);
  });

  it('SelectTrigger — et la variante « filtre » (graisse 500)', () => {
    render(
      <Select>
        <SelectTrigger aria-label="a">
          <SelectValue />
        </SelectTrigger>
      </Select>,
    );
    const c = classes(screen.getByLabelText('a'));
    for (const a of [`${H}-controle`, 'text-declencheur', 'bg-fond-champ']) expect(c).toContain(a);
    expect(c).not.toContain('font-medium');
  });

  it('SelectTrigger variante « filtre »', () => {
    render(
      <Select>
        <SelectTrigger aria-label="b" variante="filtre">
          <SelectValue />
        </SelectTrigger>
      </Select>,
    );
    const el = screen.getByLabelText('b');
    expect(el.getAttribute('data-variante')).toBe('filtre');
    expect(classes(el)).toContain('font-medium');
  });

  it.each([
    ['DatePicker', <DatePicker key="d" value="" onValueChange={() => {}} data-testid="c" />],
    ['DateTimePicker', <DateTimePicker key="t" value="" onValueChange={() => {}} data-testid="c" />],
  ])('%s', (_nom, el) => {
    render(withIntl(el));
    const c = classes(screen.getByTestId('c'));
    for (const a of [`${H}-controle`, 'text-declencheur', 'bg-fond-champ', FIELD_DENSITY_HEIGHT]) expect(c).toContain(a);
    expect(c).not.toContain(`${H}-10`);
  });
});
