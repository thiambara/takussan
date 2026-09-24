import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import frMessages from '@/messages/fr.json';
import { WizardDraftsBanner } from '../WizardDraftsBanner';
import type { WizardDraft } from '@/types/wizard-draft';

/**
 * TCK-566 — capture du testeur (2026-09-23) : « Reprenez là où vous vous étiez
 * arrêté — Vous avez 1 démarche en cours » + « Passage en pro », alors qu'il
 * avait seulement ouvert le formulaire depuis la notification. Le brouillon est
 * celui que l'ancien autosave écrivait vide, tel que l'API le rend (champs à
 * `null`, cf. `ConvertEmptyStringsToNull`).
 */
const FANTOME: WizardDraft = {
  id: 1,
  key: 'agency-upgrade-7',
  step: 0,
  data: {
    rc: null,
    ninea: null,
    rib_pro: null,
    address_fiscale: null,
    company_legal_name: null,
    planned_agents_count: null,
  },
  updated_at: '2026-09-23T09:00:00Z',
};

function rendre(initialDrafts: WizardDraft[]) {
  return render(
    <NextIntlClientProvider locale="fr" messages={frMessages}>
      <WizardDraftsBanner initialDrafts={initialDrafts} />
    </NextIntlClientProvider>,
  );
}

describe('<WizardDraftsBanner> — TCK-566', () => {
  const BANNIERE = frMessages.wizardDrafts.banner;

  it('un brouillon « Passage en pro » sans aucune saisie n’affiche pas de démarche en cours', () => {
    rendre([FANTOME]);

    expect(screen.queryByRole('region', { name: BANNIERE.ariaLabel })).not.toBeInTheDocument();
    expect(screen.queryByText(BANNIERE.labels['agency-upgrade'])).not.toBeInTheDocument();
  });

  it('un brouillon « Passage en pro » qui porte une saisie reste proposé à la reprise', () => {
    rendre([{ ...FANTOME, data: { ...FANTOME.data, rc: 'RC-1' } }]);

    expect(screen.getByRole('region', { name: BANNIERE.ariaLabel })).toBeInTheDocument();
    expect(screen.getByText(BANNIERE.labels['agency-upgrade'])).toBeInTheDocument();
    expect(screen.getByText('Vous avez 1 démarche en cours.')).toBeInTheDocument();
  });

  it('le fantôme ne compte pas dans le nombre de démarches', () => {
    rendre([
      FANTOME,
      { id: 2, key: 'host-individual-wizard', step: 2, data: { title: 'Villa' }, updated_at: null },
    ]);

    expect(screen.getByText('Vous avez 1 démarche en cours.')).toBeInTheDocument();
    expect(screen.queryByText(BANNIERE.labels['agency-upgrade'])).not.toBeInTheDocument();
  });
});
