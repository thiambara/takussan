/**
 * TCK-2598 (r2) — `onEtape` est FACULTATIF : les deux autres montages de `TotpEnrollment`
 * (`EnrolementDoubleFacteurExige`, `GardeDoubleFacteur`) ne le passent pas, et l'enrôlement entier
 * doit leur rester identique. Monté par l'assistant de l'admin d'agence, il rend chaque étape.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import frMessages from '@/messages/fr.json';
import { withIntl } from '@/test/intl';

import { TotpEnrollment } from '../TotpEnrollment';

vi.mock('@/app/actions/security', () => ({
  twoFactorEnableAction: vi.fn(async () => ({ ok: true, data: { secret: 'SECRETDETEST', qr_svg: null, qr_url: 'otpauth://totp/test' } })),
  twoFactorConfirmAction: vi.fn(async () => ({ ok: true, data: { recovery_codes: ['aaaa-bbbb', 'cccc-dddd'] } })),
}));

const T = frMessages.auth.twoFactor;

async function enroler(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: T.intro.cta }));
  await user.type(await screen.findByLabelText(T.scan.codeLabel), '123456');
  await user.click(screen.getByRole('button', { name: T.scan.cta }));
  await screen.findByText('aaaa-bbbb');
}

describe('TotpEnrollment — le rappel d’étape (TCK-2598)', () => {
  it('sans `onEtape` (les deux autres montages) : l’enrôlement va jusqu’aux codes de secours, sans erreur', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(withIntl(<TotpEnrollment mode="forced" onComplete={onComplete} />));
    await enroler(user);
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: T.success.cta }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('avec `onEtape` : intro, puis scan, puis codes de secours', async () => {
    const user = userEvent.setup();
    const onEtape = vi.fn();
    render(withIntl(<TotpEnrollment mode="forced" onComplete={vi.fn()} onEtape={onEtape} />));
    expect(onEtape).toHaveBeenLastCalledWith('intro');
    await enroler(user);
    expect(onEtape.mock.calls.map(([etape]) => etape)).toEqual(['intro', 'scanning', 'success']);
  });
});
