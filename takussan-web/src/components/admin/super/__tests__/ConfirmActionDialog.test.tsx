import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmActionDialog } from '../ConfirmActionDialog';

describe('<ConfirmActionDialog>', () => {
  it('disables the confirm button until the phrase is typed exactly', async () => {
    const onConfirm = vi.fn();
    render(
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
    );

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
});
