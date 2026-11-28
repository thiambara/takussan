import { describe, expect, it, vi } from 'vitest';

import { avecGardeDoubleFacteurAction } from '../double-facteur';

/**
 * TCK-3008 — une server action rend désormais le code métier de TOUT refus (`refusDAction`), pas seulement celui du
 * second facteur. La garde ne doit donc s'ouvrir que sur les deux codes du second facteur : un autre code revient tel
 * quel, sans dialogue ni rejeu.
 */
describe('avecGardeDoubleFacteurAction — un autre code métier n’ouvre pas la garde (TCK-3008)', () => {
  it('un refus `agency.phone_unverified` revient tel quel', async () => {
    const autre = { ok: false as const, message: 'Numéro non vérifié.', code: 'agency.phone_unverified' };
    const action = vi.fn().mockResolvedValue(autre);
    const garde = vi.fn().mockResolvedValue(true);
    await expect(avecGardeDoubleFacteurAction(action, garde)).resolves.toBe(autre);
    expect(garde).not.toHaveBeenCalled();
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('un code du second facteur l’ouvre toujours', async () => {
    const refus = { ok: false as const, message: 'refus', code: 'two_factor_step_up_required' };
    const action = vi.fn().mockResolvedValueOnce(refus).mockResolvedValueOnce({ ok: true as const });
    const garde = vi.fn().mockResolvedValue(true);
    await avecGardeDoubleFacteurAction(action, garde);
    expect(garde).toHaveBeenCalledWith('two_factor_step_up_required');
  });
});
