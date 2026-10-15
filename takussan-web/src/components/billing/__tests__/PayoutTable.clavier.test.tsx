/**
 * TCK-661 (P07.05) — le détail d'un reversement s'ouvre au clavier.
 *
 * La ligne portait seule le `onClick` : ni rôle, ni `tabIndex`, ni élément focusable. Le panneau
 * de détail de `/super-admin/payouts` était inatteignable sans souris (WCAG 2.2 §2.1.1). La
 * période devient un `<button>` quand `onSelect` est fourni, sur le patron d'`InvoicesTable`.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { PlatformPayout } from '@/types/super-admin';

import { PayoutTable } from '../PayoutTable';

const payout: PlatformPayout = {
  id: 7,
  agency_id: 3,
  period_start: '2026-09-01',
  period_end: '2026-09-30',
  gross_amount: 500000,
  platform_fee_amount: 50000,
  net_amount: 450000,
  currency: 'XOF',
  status: 'pending',
  closed_by_id: 1,
  approved_by: null,
  processed_at: null,
  failure_reason: null,
  metadata: null,
  created_at: null,
  updated_at: null,
};

describe('PayoutTable — sélection au clavier', () => {
  it('atteint la ligne par Tab et ouvre le détail par Entrée, une seule fois', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(withIntl(<PayoutTable payouts={[payout]} onSelect={onSelect} />));

    await user.tab();
    const focus = document.activeElement as HTMLElement;
    expect(focus.tagName).toBe('BUTTON');
    expect(focus.closest('tr')).not.toBeNull();

    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(payout);
  });

  it('ouvre par Espace, et le clic sur la ligne ne double pas la sélection', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(withIntl(<PayoutTable payouts={[payout]} onSelect={onSelect} />));

    await user.tab();
    await user.keyboard(' ');
    expect(onSelect).toHaveBeenCalledTimes(1);

    await user.click(document.activeElement as HTMLElement);
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it('sans onSelect, la ligne ne porte aucun bouton', () => {
    render(withIntl(<PayoutTable payouts={[payout]} />));
    expect(screen.queryByRole('button')).toBeNull();
  });
});
