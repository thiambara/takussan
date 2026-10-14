import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import type { Setting } from '@/types/setting';
import { SettingsManager } from '../SettingsManager';

const updateConsoleSettingAction = vi.fn();

vi.mock('@/app/actions/console', () => ({
  updateConsoleSettingAction: (id: number, payload: unknown) => updateConsoleSettingAction(id, payload),
  upsertConsoleSettingAction: vi.fn(),
  deleteConsoleSettingAction: vi.fn(),
}));

const GLOBALE = {
  id: 7,
  key: 'support_email',
  scope: 'global',
  scope_id: null,
  value: { value: 'aide@takussan.com' },
} as unknown as Setting;

/**
 * TCK-648 (AC1) — depuis `/super-admin/settings/global`, le super-admin MODIFIE une clé globale :
 * l'éditeur envoie la valeur saisie à `updateConsoleSettingAction` et affiche la ligne à jour.
 */
describe('<SettingsManager> — modification d’une clé globale', () => {
  it('un super-admin modifie une clé globale', async () => {
    updateConsoleSettingAction.mockResolvedValue({ ok: true, data: { ...GLOBALE, value: { value: 42 } } });
    const user = userEvent.setup();
    render(withIntl(<SettingsManager initialSettings={[GLOBALE]} canManageGlobal />));

    await user.click(screen.getByRole('button', { name: 'Modifier support_email' }));
    const saisie = screen.getByRole('textbox');
    await user.clear(saisie);
    await user.type(saisie, '42');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(updateConsoleSettingAction).toHaveBeenCalledWith(7, { value: 42 });
    expect(await screen.findByText('Paramètre « support_email » mis à jour.')).toBeInTheDocument();
  });

  it('sans le droit global, la clé globale ne s’ouvre pas à l’édition', () => {
    render(withIntl(<SettingsManager initialSettings={[GLOBALE]} canManageGlobal={false} />));

    expect(screen.getByRole('button', { name: 'Modifier support_email' })).toBeDisabled();
  });
});
