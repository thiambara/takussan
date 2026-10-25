import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';
import { ReasonDialog } from '../ReasonDialog';

/**
 * TCK-2371 (décision du porteur, sans entrée de piste) — la description du dialogue « converti /
 * perdu » lit `crm.pipeline.reasonDialog.descriptionConverted` ou `descriptionLost`, choisie par un
 * ternaire. Les deux clés manquaient dans les trois dictionnaires, et aucune garde ne le voyait :
 * `check:i18n` compare les langues entre elles, jamais au code. Le dialogue peignait le chemin de
 * la clé. Ce test est la garde de ces deux clés : il rend chaque branche, en français et en anglais
 * (l'anglais se replie sur le français : seule une égalité à la phrase anglaise prouve sa clé).
 */
const ATTENDU = {
  fr: {
    converted: 'Précisez pourquoi ce client est converti.',
    lost: 'Précisez pourquoi ce client est perdu.',
  },
  en: {
    converted: 'Explain why this customer converted.',
    lost: 'Explain why this customer was lost.',
  },
} as const;

describe('<ReasonDialog> — la description de chaque étape terminale', () => {
  it.each([
    ['fr', 'converted'],
    ['fr', 'lost'],
    ['en', 'converted'],
    ['en', 'lost'],
  ] as const)('en %s, vers « %s », le dialogue dit sa phrase', (locale, to) => {
    render(withIntl(
      <ReasonDialog
        pending={{ customerId: 7, from: 'negotiating', to }}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
      locale,
    ));

    expect(screen.getByRole('dialog')).toHaveAccessibleDescription(ATTENDU[locale][to]);
  });
});
