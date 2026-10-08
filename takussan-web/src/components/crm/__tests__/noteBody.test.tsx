/**
 * TCK-591, AC19 (front) — la nature d'une note d'étape se traduit à l'affichage ; le corps ne
 * porte que le motif. « Perte : Budget » était écrit en base, en français, pour tout lecteur.
 */
import { render, screen } from '@testing-library/react';
import { useTranslations } from 'next-intl';
import { describe, expect, it } from 'vitest';

import { withIntl, type LocaleDeTest } from '@/test/intl';
import { noteBody } from '../noteBody';

function Note({ kind }: { readonly kind: 'loss' | 'conversion' | null }) {
  const t = useTranslations('agentCrm.notes');
  return <p>{noteBody({ body: 'Budget', kind }, t)}</p>;
}

describe('noteBody', () => {
  it.each<[LocaleDeTest, 'loss' | 'conversion' | null, string]>([
    ['en', 'loss', 'Lost: Budget'],
    ['fr', 'loss', 'Perte : Budget'],
    ['en', 'conversion', 'Converted: Budget'],
    ['fr', 'conversion', 'Conversion : Budget'],
    ['en', null, 'Budget'],
  ])('en %s, une note %s s’affiche « %s »', (locale, kind, attendu) => {
    render(withIntl(<Note kind={kind} />, locale));
    expect(screen.getByText(attendu)).toBeInTheDocument();
  });
});
