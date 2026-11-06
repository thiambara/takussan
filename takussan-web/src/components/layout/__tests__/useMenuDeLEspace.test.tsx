/**
 * TCK-2481 (ADR-0089 §3, arbitrage 6) — le menu de l'espace rend DEUX rangements des mêmes
 * destinations : celui du menu rendu (préférences du compte comprises, TCK-2480) et celui de la
 * disposition seule, dont la barre d'onglets mobile tire ses remplaçants. Une épingle ne doit jamais
 * devenir « la destination suivante de sa disposition ».
 */
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { User, UserRole } from '@/types/user';
import { NAVIGATION_VIDE, type PreferencesDeNavigation } from '@/lib/navigation/preferences';
import { useMenuDeLEspace } from '../useMenuDeLEspace';

vi.mock('@/hooks/useCan', () => ({
  useMyCapabilities: () => ({ data: { data: { agency_id: 1, capabilities: [] } } }),
}));
const navigation = vi.hoisted(() => ({ courante: null as PreferencesDeNavigation | null }));
vi.mock('../PreferencesDuMenu', () => ({
  usePreferencesDuMenu: () => ({ navigation: navigation.courante ?? { v: 1, personas: {} } }),
}));

function utilisateur(roles: UserRole[], agencyId: number | null = null): User {
  return {
    id: 1,
    first_name: 'Awa',
    last_name: 'Diop',
    full_name: 'Awa Diop',
    email: 'awa@example.sn',
    roles,
    agency_id: agencyId,
  } as unknown as User;
}

const hrefs = (groupes: readonly { readonly entrees: readonly { readonly href: string }[] }[]) =>
  groupes.flatMap((g) => g.entrees.map((e) => e.href)).sort();

describe('TCK-2481 — useMenuDeLEspace', () => {
  it('sans préférence, la disposition et le menu rendu se rangent de même', () => {
    navigation.courante = NAVIGATION_VIDE;
    const { result } = renderHook(() => useMenuDeLEspace({ user: utilisateur(['customer']) }));
    expect(result.current.persona).toBe('client');
    expect(result.current.groupesDeLaDisposition).toEqual(result.current.groupes);
    expect(result.current.entrees).toEqual(result.current.groupes.flatMap((g) => g.entrees));
  });

  it('une épingle range le menu rendu, jamais les groupes de la disposition (arbitrage 6)', () => {
    navigation.courante = { v: 1, personas: { client: { epingles: ['documents'] } } };
    const { result } = renderHook(() => useMenuDeLEspace({ user: utilisateur(['customer']) }));
    const { groupes, groupesDeLaDisposition } = result.current;

    expect(groupes[0]?.id).toBe('epingles');
    expect(groupes[0]?.entrees.map((e) => e.id)).toEqual(['documents']);
    expect(groupesDeLaDisposition.map((g) => g.id)).not.toContain('epingles');
    const plus = groupesDeLaDisposition.find((g) => g.id === 'plus');
    expect(plus?.entrees.map((e) => e.id)).toContain('documents');
    // Les mêmes destinations, autrement rangées : rien n'est ajouté ni perdu.
    expect(hrefs(groupesDeLaDisposition)).toEqual(hrefs(groupes));

    // Épingler ne change RIEN aux groupes de la disposition : les onglets ne bougent pas.
    navigation.courante = NAVIGATION_VIDE;
    const sansEpingle = renderHook(() => useMenuDeLEspace({ user: utilisateur(['customer']) }));
    expect(groupesDeLaDisposition).toEqual(sansEpingle.result.current.groupesDeLaDisposition);
    expect(groupes).not.toEqual(sansEpingle.result.current.groupes);
  });

  it('les groupes de la disposition portent le cadenas de l’agence `individual`, comme le menu rendu', () => {
    navigation.courante = NAVIGATION_VIDE;
    const { result } = renderHook(() =>
      useMenuDeLEspace({ user: utilisateur(['customer', 'agency_admin'], 7), agencyIsStandard: false }),
    );
    const verrous = (gs: typeof result.current.groupes) =>
      gs.flatMap((g) => g.entrees.filter((e) => e.locked).map((e) => e.href)).sort();
    expect(verrous(result.current.groupes).length).toBeGreaterThan(0);
    expect(verrous(result.current.groupesDeLaDisposition)).toEqual(verrous(result.current.groupes));
  });
});

describe('TCK-2483 — useMenuDeLEspace pose les modules masqués par l’agence', () => {
  const MASQUES = ['/app/calendar', '/app/commissions'];

  it('l’agent les perd dans le menu rendu ET dans les groupes de la disposition (onglets)', () => {
    navigation.courante = NAVIGATION_VIDE;
    const agent = utilisateur(['customer', 'agent'], 7);
    const temoin = renderHook(() => useMenuDeLEspace({ user: agent })).result.current;
    for (const href of MASQUES) expect(hrefs(temoin.groupes), `témoin : ${href}`).toContain(href);

    const { result } = renderHook(() => useMenuDeLEspace({ user: agent, modulesMasques: ['calendar', 'commissions'] }));
    for (const href of MASQUES) {
      expect(hrefs(result.current.groupes), href).not.toContain(href);
      expect(hrefs(result.current.groupesDeLaDisposition), href).not.toContain(href);
    }
  });

  it('le bailleur garde ses états des lieux', () => {
    navigation.courante = NAVIGATION_VIDE;
    const { result } = renderHook(() =>
      useMenuDeLEspace({ user: utilisateur(['customer', 'owner'], 7), modulesMasques: ['inventories'] }),
    );
    expect(result.current.persona).toBe('bailleur');
    expect(hrefs(result.current.groupes)).toContain('/app/inventories');
  });
});
