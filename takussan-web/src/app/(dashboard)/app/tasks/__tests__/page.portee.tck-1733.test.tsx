/**
 * TCK-1733 (P167.04) — la page « Tâches » lit la portée `filter[assigned_to]=me` que porte le lien de
 * la tuile « Tâches du jour », et la passe à la liste. Toute autre valeur est ignorée.
 *
 * TCK-2596 (lot 2) — sans échéance, la page s'ouvre sur En retard + Aujourd'hui ; `?nouvelle=1` ouvre
 * « Nouvelle tâche » ; le filtre d'équipe n'est offert qu'avec `crm.view_all`.
 */
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const etat = vi.hoisted(() => ({ roles: ['agent'] as string[], capacites: [] as string[] }));

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/app/actions/auth', () => ({ getMeAction: async () => ({ id: 7, roles: etat.roles }) }));
vi.mock('@/lib/access/pages-admin-server', () => ({ capacitesDuProfilActif: async () => etat.capacites }));
const page = vi.fn();
vi.mock('@/components/taches/PageDesTaches', () => ({
  PageDesTaches: (props: unknown) => {
    page(props);
    return null;
  },
}));

const { default: Page } = await import('../page');

describe('Tâches — la portée du lien (TCK-1733, TCK-2596)', () => {
  beforeEach(() => {
    page.mockReset();
    Object.assign(etat, { roles: ['agent'], capacites: [] });
  });

  it('passe « assignées à moi » et l’échéance quand l’URL les porte', async () => {
    render(await Page({ searchParams: Promise.resolve({ 'filter[due]': 'today', 'filter[assigned_to]': 'me' }) }));
    expect(page).toHaveBeenCalledWith(
      expect.objectContaining({
        etatInitial: { selection: { mode: 'periodes', periodes: ['today'] }, aMoi: true, equipe: false, agent: null },
        ouvrirNouvelle: false,
        equipeVisible: false,
      }),
    );
  });

  it('ignore une autre portée ; sans échéance, En retard + Aujourd’hui', async () => {
    render(await Page({ searchParams: Promise.resolve({ 'filter[assigned_to]': '42' }) }));
    expect(page).toHaveBeenCalledWith(expect.objectContaining({ etatInitial: { selection: { mode: 'periodes', periodes: ['overdue', 'today'] }, aMoi: false, equipe: false, agent: null } }));
  });

  it('`?nouvelle=1` ouvre la création ; l’admin qui tient `crm.view_all` a le filtre d’équipe', async () => {
    Object.assign(etat, { roles: ['agency_admin'], capacites: ['crm.view_all'] });
    render(await Page({ searchParams: Promise.resolve({ nouvelle: '1' }) }));
    expect(page).toHaveBeenCalledWith(expect.objectContaining({ ouvrirNouvelle: true, equipeVisible: true }));
  });

  it('l’agent, qui tient aussi `crm.view_all`, n’a pas le filtre d’équipe', async () => {
    Object.assign(etat, { roles: ['agent'], capacites: ['crm.view_all'] });
    render(await Page({ searchParams: Promise.resolve({}) }));
    expect(page).toHaveBeenCalledWith(expect.objectContaining({ equipeVisible: false }));
  });
});
