/**
 * TCK-1733 (P167.04) — la page « Mes tâches » lit la portée `filter[assigned_to]=me` que porte le
 * lien de la tuile « Tâches du jour », et la passe à la liste. Toute autre valeur est ignorée.
 */
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
const myTasks = vi.fn();
vi.mock('@/components/crm/MyTasks', () => ({
  MyTasks: (props: unknown) => {
    myTasks(props);
    return null;
  },
}));

const { default: Page } = await import('../page');

describe('Mes tâches — la portée du lien (TCK-1733)', () => {
  beforeEach(() => myTasks.mockReset());

  it('passe « assignées à moi » quand l’URL le porte', async () => {
    render(await Page({ searchParams: Promise.resolve({ 'filter[due]': 'today', 'filter[assigned_to]': 'me' }) }));
    expect(myTasks).toHaveBeenCalledWith({ initialDue: 'today', initialAssignedToMe: true });
  });

  it('ignore une autre valeur', async () => {
    render(await Page({ searchParams: Promise.resolve({ 'filter[assigned_to]': '42' }) }));
    expect(myTasks).toHaveBeenCalledWith({ initialDue: null, initialAssignedToMe: false });
  });
});
