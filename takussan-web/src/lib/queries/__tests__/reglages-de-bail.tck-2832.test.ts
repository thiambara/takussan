/**
 * TCK-2832 — les lectures et écritures des réglages de bail de l'agence :
 *
 * - les défauts du nouveau bail se relisent au retour sur l'onglet (`staleTime: 0`) : « Modifier » ouvre
 *   les réglages dans un AUTRE onglet, et le défaut de 5 min les aurait gardés figés ;
 * - « Enregistrer » écrit une ligne d'agence (`POST /api/settings`, portée `agency`) ;
 * - « Revenir à la valeur de la plateforme » RETIRE la ligne (`DELETE`), jamais une écriture à 0 ;
 * - les deux écritures font relire l'écran et les défauts du bail (même onglet).
 */
import { describe, expect, it, vi } from 'vitest';

const useApiQuery = vi.fn();
const useApiMutation = vi.fn();
vi.mock('@/hooks/useApiQuery', () => ({
  useApiQuery: (...args: unknown[]) => useApiQuery(...args),
  useApiMutation: (...args: unknown[]) => useApiMutation(...args),
}));

import { useLeaseDefaults } from '../leases';
import { useEnregistrerReglageDeBail, useReglagesDeBail, useRevenirALaPlateforme } from '../reglages-de-bail';

type Forme = { path: string | ((v: unknown) => string); method: string; body?: (v: unknown) => unknown };

describe('réglages de bail (TCK-2832)', () => {
  it('les défauts du bail ne restent jamais frais : relus au retour sur l’onglet', () => {
    useLeaseDefaults(11);
    expect(useApiQuery.mock.calls.at(-1)?.[2]).toMatchObject({ staleTime: 0, enabled: true });
  });

  it('l’écran lit GET /api/settings/lease', () => {
    useReglagesDeBail();
    expect(useApiQuery.mock.calls.at(-1)?.[1]).toBe('/api/settings/lease');
  });

  it('« Enregistrer » écrit une ligne d’agence, et fait relire l’écran et les défauts', () => {
    useEnregistrerReglageDeBail();
    const [forme, options] = useApiMutation.mock.calls.at(-1) as [Forme, { invalidate: unknown[] }];
    expect(forme.path).toBe('/api/settings');
    expect(forme.method).toBe('POST');
    expect(forme.body?.({ key: 'lease.late_fee_percent', value: 5 })).toEqual({
      key: 'lease.late_fee_percent',
      value: { value: 5 },
      scope: 'agency',
    });
    expect(options.invalidate).toEqual([['settings', 'lease'], ['leases', 'defaults']]);
  });

  it('« Revenir à la plateforme » retire la ligne (DELETE), sans corps', () => {
    useRevenirALaPlateforme();
    const [forme, options] = useApiMutation.mock.calls.at(-1) as [Forme, { invalidate: unknown[] }];
    expect(typeof forme.path === 'function' ? forme.path({ settingId: 41 }) : forme.path).toBe('/api/settings/41');
    expect(forme.method).toBe('DELETE');
    expect(forme.body?.({ settingId: 41 })).toBeUndefined();
    expect(options.invalidate).toEqual([['settings', 'lease'], ['leases', 'defaults']]);
  });
});
