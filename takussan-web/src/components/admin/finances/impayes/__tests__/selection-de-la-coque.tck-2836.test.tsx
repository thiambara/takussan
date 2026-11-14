/**
 * TCK-2836 — les impayés se branchent sur la sélection de la coque : en mode sélection, `TeteDeSelection`
 * déclare une sélection (la coque retire alors la barre d'onglets au téléphone, et l'emplacement de la
 * barre collante « Relancer la sélection » devient le bas de l'écran) ; hors du mode, rien n'est déclaré.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TeteDeSelection } from '@/components/admin/finances/impayes/SelectionDesImpayes';
import { FournisseurDEnTete, useDeclarationDEnTete } from '@/components/layout/en-tete-de-la-coque';
import { withIntl } from '@/test/intl';

function Sonde() {
  return <output data-testid="sonde">{useDeclarationDEnTete().selection ? 'selection' : 'aucune'}</output>;
}

function monter(modeSelection: boolean) {
  return withIntl(
    <FournisseurDEnTete>
      <Sonde />
      {modeSelection ? (
        <TeteDeSelection n={0} montant="0 F" nonAffiches={0} toutesCochees={false} onToutSelectionner={vi.fn()} onRelancer={vi.fn()} />
      ) : null}
    </FournisseurDEnTete>,
  );
}

describe('TCK-2836 — impayés : le mode sélection est déclaré à la coque', () => {
  it('en mode sélection, la sélection est déclarée ; le mode quitté, elle tombe', () => {
    const { rerender } = render(monter(true));
    expect(screen.getByTestId('sonde')).toHaveTextContent('selection');
    rerender(monter(false));
    expect(screen.getByTestId('sonde')).toHaveTextContent('aucune');
  });
});
