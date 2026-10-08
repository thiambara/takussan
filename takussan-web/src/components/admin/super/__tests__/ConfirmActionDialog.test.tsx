import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { withIntl } from '@/test/intl';
import { ApiError } from '@/lib/api';
import { ConfirmActionDialog } from '../ConfirmActionDialog';

describe('<ConfirmActionDialog>', () => {
  it('disables the confirm button until the phrase is typed exactly', async () => {
    const onConfirm = vi.fn();
    render(withIntl(
      <ConfirmActionDialog
        open
        onOpenChange={() => {}}
        title="Suspendre"
        description="confirm"
        confirmPhrase="SUSPENDRE"
        confirmLabel="Suspendre"
        destructive
        onConfirm={onConfirm}
      />,
    ));

    const submit = screen.getByTestId('confirm-action-submit');
    expect(submit).toBeDisabled();

    const u = userEvent.setup();
    await u.type(screen.getByTestId('confirm-action-input'), 'wrong');
    expect(submit).toBeDisabled();

    await u.clear(screen.getByTestId('confirm-action-input'));
    await u.type(screen.getByTestId('confirm-action-input'), 'SUSPENDRE');
    expect(submit).not.toBeDisabled();

    await u.click(submit);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  // TCK-600 — un geste lourd sans motif ne part pas, même la phrase tapée.
  it('keeps the confirm button disabled until a reason is given, then passes it trimmed', async () => {
    const onConfirm = vi.fn();
    render(withIntl(
      <ConfirmActionDialog
        open
        onOpenChange={() => {}}
        title="Suspendre"
        description="confirm"
        confirmPhrase="SUSPENDRE"
        confirmLabel="Suspendre"
        reason={{ label: 'Motif' }}
        onConfirm={onConfirm}
      />,
    ));

    const u = userEvent.setup();
    const submit = screen.getByTestId('confirm-action-submit');
    await u.type(screen.getByTestId('confirm-action-input'), 'SUSPENDRE');
    expect(submit).toBeDisabled();

    await u.type(screen.getByLabelText('Motif'), '   ');
    expect(submit).toBeDisabled();

    await u.type(screen.getByLabelText('Motif'), 'Plaintes répétées  ');
    expect(submit).not.toBeDisabled();
    await u.click(submit);
    expect(onConfirm).toHaveBeenCalledWith('Plaintes répétées');
  });

  it('shows the API refusal inside the dialog', () => {
    render(withIntl(
      <ConfirmActionDialog
        open
        onOpenChange={() => {}}
        title="Suspendre"
        description="confirm"
        confirmPhrase="SUSPENDRE"
        confirmLabel="Suspendre"
        error={new ApiError(422, { code: 'agency.reinstate_first', message: 'Levez d’abord la suspension.' })}
        onConfirm={() => {}}
      />,
    ));

    expect(screen.getByRole('alert')).toHaveTextContent('Levez d’abord la suspension.');
  });
});
