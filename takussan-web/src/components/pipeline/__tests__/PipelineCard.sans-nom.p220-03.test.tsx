import { render, screen } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { describe, expect, it } from 'vitest';

import { withIntl } from '@/test/intl';
import { PipelineCard } from '../PipelineCard';

/**
 * P220.03 (TCK-2281) — une fiche client née d'un compte créé par téléphone garde prénom et nom
 * vides. Décision du porteur : chaque écran la nomme par `nomAffichable()` (e-mail, numéro, `#<id>`),
 * avec les seuls champs qu'il charge déjà ; avant, il composait une chaîne vide.
 *
 * L'auteur de la fiche (`added_by`, chargé sans contact) garde sa ligne cachée quand il n'a pas
 * de nom : `nomCompletDe`, comme avant.
 */
describe('PipelineCard — fiche sans nom (P220.03)', () => {
  it('la carte, le sélecteur d’étape et les gestes la nomment par #<id>', () => {
    render(withIntl(
      <DndContext>
        <PipelineCard
          customer={{
            id: 31,
            first_name: '',
            last_name: '',
            phone: '+221770000622',
            pipeline_stage: 'lead',
            updated_at: '2026-10-20T10:00:00Z',
            created_at: '2026-10-20T10:00:00Z',
            added_by_id: 2,
            added_by: { id: 2, first_name: '', last_name: '' },
          }}
          onSelect={() => {}}
          onStageChange={() => {}}
        />
      </DndContext>,
    ));

    // Le numéro est chargé par la carte : il passe avant `#<id>`.
    expect(screen.getByText('+221 77 000 06 22')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Étape de +221 77 000 06 22' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Appeler +221 77 000 06 22' })).toBeInTheDocument();
    expect(screen.queryByText('par')).not.toBeInTheDocument();
  });
});
