import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentType } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { AgencyStandardWelcomeWizard } from '@/components/agency/AgencyStandardWelcomeWizard';
import { AgentWelcomeWizard } from '@/components/agent/AgentWelcomeWizard';
import { CustomerWelcomeWizard } from '@/components/customer/CustomerWelcomeWizard';
import { OwnerWelcomeWizard } from '@/components/owner/OwnerWelcomeWizard';
import { TenantWelcomeWizard } from '@/components/tenant/TenantWelcomeWizard';
import { withIntl } from '@/test/intl';

/**
 * TCK-567 (M10) — la spec de TCK-251 met une « illustration au-dessus » de chaque diapositive, et
 * AUCUN parcours n'en passait : sur téléphone, la hauteur qu'elle devait occuper restait blanche
 * (capture du testeur, 2026-09-23, carrousel client « Find your perfect property »).
 *
 * La persistance (`/api/me/welcome-seen`) n'est pas le sujet : les deux hooks sont remplacés par
 * une modale ouverte, qui laisse passer les diapositives du parcours telles quelles.
 */
vi.mock('@/hooks/useWelcomeOnce', () => ({
  useWelcomeOnce: (_cle: string, slides: unknown[]) => ({
    open: true,
    slides,
    onComplete: () => {},
    onSkip: () => {},
  }),
}));
vi.mock('@/hooks/useTenantWelcomeOnce', () => ({
  useTenantWelcomeOnce: () => ({ open: true, onComplete: () => {}, onSkip: () => {} }),
}));
vi.mock('@/hooks/useAgencyStandardWelcomeOnce', () => ({
  useAgencyStandardWelcomeOnce: () => ({ open: true, agencyId: 1, onComplete: () => {}, onSkip: () => {} }),
}));

/** Les parcours qui passent LEUR icône par diapositive. */
const PARCOURS_ILLUSTRES: [string, ComponentType][] = [
  ['client (la capture du testeur)', CustomerWelcomeWizard],
  ['propriétaire', OwnerWelcomeWizard],
  ['agent', AgentWelcomeWizard],
  ['locataire', TenantWelcomeWizard],
  ['administrateur d’agence', AgencyStandardWelcomeWizard],
];

/** Tous les parcours qui montent `<WelcomeModal>` — tous illustrés depuis l'intégration du lot. */
const PARCOURS: [string, ComponentType][] = [...PARCOURS_ILLUSTRES];

/** La classe Lucide de l'icône affichée (`lucide lucide-house`), diapositive par diapositive. */
function iconesDesTroisDiapositives(): string[] {
  const dialog = screen.getByRole('dialog');
  const icones: string[] = [];
  for (let n = 1; n <= 3; n += 1) {
    icones.push(within(dialog).getByTestId('welcome-illustration').querySelector('svg')?.getAttribute('class') ?? '');
    if (n < 3) fireEvent.click(within(dialog).getByTestId('welcome-next'));
  }
  return icones;
}

describe('carrousels de bienvenue — une illustration sur chaque diapositive (TCK-567, M10)', () => {
  it.each(PARCOURS)('parcours %s : les trois diapositives sont illustrées', (_nom, Parcours) => {
    render(withIntl(<Parcours />));
    const dialog = screen.getByRole('dialog');

    for (let n = 1; n <= 3; n += 1) {
      const illustration = within(dialog).getByTestId('welcome-illustration');
      // Une illustration qui ne dessine rien serait le même bloc vide, en plus discret.
      expect(illustration.querySelector('svg')).not.toBeNull();
      if (n < 3) fireEvent.click(within(dialog).getByTestId('welcome-next'));
    }
  });

  it.each(PARCOURS_ILLUSTRES)('parcours %s : les trois diapositives ne répètent pas la même icône', (_nom, Parcours) => {
    render(withIntl(<Parcours />));
    const icones = iconesDesTroisDiapositives();

    expect(icones.every((c) => /lucide-/.test(c))).toBe(true);
    expect(new Set(icones).size).toBe(3);
  });
});
