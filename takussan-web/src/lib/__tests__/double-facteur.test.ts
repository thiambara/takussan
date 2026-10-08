import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';
import {
  ENROLEMENT_DOUBLE_FACTEUR,
  ENROLEMENT_SUPER_ADMIN_COOPTE,
  avecGardeDoubleFacteur,
  avecGardeDoubleFacteurAction,
  codeDoubleFacteur,
  configurationDoubleFacteurExigee,
} from '../double-facteur';
import type { UserRole } from '@/types/user';

const compte = (roles: UserRole[], champs: Partial<{
  two_factor_enabled: boolean;
  force_2fa_at_first_login: boolean;
  force_2fa_reconfigure: boolean;
}> = {}) => ({ roles, two_factor_enabled: true, ...champs });

describe('configurationDoubleFacteurExigee (TCK-589, AC7)', () => {
  it.each([
    ['super-admin sans second facteur', compte(['super_admin'], { two_factor_enabled: false }), ENROLEMENT_DOUBLE_FACTEUR],
    ['super-admin réinitialisé par le support', compte(['super_admin'], { force_2fa_reconfigure: true }), ENROLEMENT_DOUBLE_FACTEUR],
    ['super-admin coopté pas encore enrôlé', compte([], { two_factor_enabled: false, force_2fa_at_first_login: true }), ENROLEMENT_SUPER_ADMIN_COOPTE],
    ['agent réinitialisé par le support', compte(['agent'], { two_factor_enabled: false, force_2fa_reconfigure: true }), ENROLEMENT_DOUBLE_FACTEUR],
    ['super-admin en règle', compte(['super_admin']), null],
    ['agent sans second facteur (non exigé hors console plateforme)', compte(['agent'], { two_factor_enabled: false }), null],
  ])('%s → %s', (_nom, user, attendu) => {
    expect(configurationDoubleFacteurExigee(user)).toBe(attendu);
  });
});

describe('codeDoubleFacteur', () => {
  it.each([
    [new ApiError(403, { code: 'two_factor_required' }), 'two_factor_required'],
    [new ApiError(403, { code: 'two_factor_step_up_required' }), 'two_factor_step_up_required'],
    [new ApiError(403, { code: 'account_blocked' }), null],
    [new ApiError(422, { code: 'two_factor_required' }), null],
    [new Error('réseau'), null],
  ])('%#', (err, attendu) => {
    expect(codeDoubleFacteur(err)).toBe(attendu);
  });
});

describe('avecGardeDoubleFacteur', () => {
  const refus = new ApiError(403, { code: 'two_factor_step_up_required' });

  it('confie le refus à la garde, puis rejoue', async () => {
    const appel = vi.fn().mockRejectedValueOnce(refus).mockResolvedValueOnce('fait');
    const garde = vi.fn().mockResolvedValue(true);
    await expect(avecGardeDoubleFacteur(appel, garde)).resolves.toBe('fait');
    expect(garde).toHaveBeenCalledWith('two_factor_step_up_required');
    expect(appel).toHaveBeenCalledTimes(2);
  });

  it('garde refusée : l’erreur d’origine remonte, sans rejeu', async () => {
    const appel = vi.fn().mockRejectedValue(refus);
    await expect(avecGardeDoubleFacteur(appel, vi.fn().mockResolvedValue(false))).rejects.toBe(refus);
    expect(appel).toHaveBeenCalledTimes(1);
  });

  it('sans garde, ou pour un autre refus : rien ne change', async () => {
    const appel = vi.fn().mockRejectedValue(refus);
    await expect(avecGardeDoubleFacteur(appel, null)).rejects.toBe(refus);
    const autre = new ApiError(403, { message: 'non' });
    const garde = vi.fn();
    await expect(avecGardeDoubleFacteur(vi.fn().mockRejectedValue(autre), garde)).rejects.toBe(autre);
    expect(garde).not.toHaveBeenCalled();
  });

  it('deux passages au plus : une garde qui dit toujours oui ne boucle pas', async () => {
    const appel = vi.fn().mockRejectedValue(refus);
    await expect(avecGardeDoubleFacteur(appel, vi.fn().mockResolvedValue(true))).rejects.toBe(refus);
    expect(appel).toHaveBeenCalledTimes(3);
  });
});

describe('avecGardeDoubleFacteurAction (TCK-293)', () => {
  const refus = { ok: false as const, message: 'refus', code: 'two_factor_required' as const };
  const fait = { ok: true as const };

  it('confie le refus à la garde, puis rejoue l’action', async () => {
    const action = vi.fn().mockResolvedValueOnce(refus).mockResolvedValueOnce(fait);
    const garde = vi.fn().mockResolvedValue(true);
    await expect(avecGardeDoubleFacteurAction(action, garde)).resolves.toBe(fait);
    expect(garde).toHaveBeenCalledWith('two_factor_required');
    expect(action).toHaveBeenCalledTimes(2);
  });

  it('garde refusée, sans garde, ou refus sans code : le résultat revient tel quel', async () => {
    const action = vi.fn().mockResolvedValue(refus);
    await expect(avecGardeDoubleFacteurAction(action, vi.fn().mockResolvedValue(false))).resolves.toBe(refus);
    await expect(avecGardeDoubleFacteurAction(action, null)).resolves.toBe(refus);
    expect(action).toHaveBeenCalledTimes(2);

    const autre = { ok: false as const, message: 'non' };
    const garde = vi.fn();
    await expect(avecGardeDoubleFacteurAction(vi.fn().mockResolvedValue(autre), garde)).resolves.toBe(autre);
    expect(garde).not.toHaveBeenCalled();
  });

  it('deux passages au plus : une garde qui dit toujours oui ne boucle pas', async () => {
    const action = vi.fn().mockResolvedValue(refus);
    await expect(avecGardeDoubleFacteurAction(action, vi.fn().mockResolvedValue(true))).resolves.toBe(refus);
    expect(action).toHaveBeenCalledTimes(3);
  });
});
