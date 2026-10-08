/**
 * TCK-600 (ADR-0055) — démarrer exige un motif ; la phrase de confirmation est TRADUITE (elle était
 * le littéral français `IMPERSONIFIER`, servi tel quel en anglais et en wolof).
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl, type LocaleDeTest } from '@/test/intl';
import { ImpersonationStartDialog } from '../ImpersonationStartDialog';

function rendre(locale: LocaleDeTest, onConfirm = vi.fn()) {
  render(withIntl(
    <ImpersonationStartDialog open onOpenChange={() => {}} targetName="Awa Diop" pending={false} error={null} onConfirm={onConfirm} />,
    locale,
  ));
  return onConfirm;
}

describe('<ImpersonationStartDialog>', () => {
  it('motif d\'au moins 10 caractères ET phrase traduite, puis transmet le motif', async () => {
    const onConfirm = rendre('fr');
    const u = userEvent.setup();
    const valider = screen.getByTestId('confirm-action-submit');

    expect(screen.getByText(/15 minutes/)).toBeInTheDocument();
    await u.type(screen.getByTestId('confirm-action-input'), 'CONSULTER');
    await u.type(screen.getByTestId('impersonate-reason'), 'court');
    expect(valider).toBeDisabled();

    await u.type(screen.getByTestId('impersonate-reason'), ' : ticket 4821');
    expect(valider).toBeEnabled();
    await u.click(valider);
    expect(onConfirm).toHaveBeenCalledWith('court : ticket 4821');
  });

  it('en anglais, la phrase française ne confirme pas', async () => {
    rendre('en');
    const u = userEvent.setup();
    await u.type(screen.getByTestId('impersonate-reason'), 'Support ticket 4821.');

    await u.type(screen.getByTestId('confirm-action-input'), 'IMPERSONIFIER');
    expect(screen.getByTestId('confirm-action-submit')).toBeDisabled();

    await u.clear(screen.getByTestId('confirm-action-input'));
    await u.type(screen.getByTestId('confirm-action-input'), 'VIEW');
    expect(screen.getByTestId('confirm-action-submit')).toBeEnabled();
  });
});
