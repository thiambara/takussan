/**
 * TCK-2857 — « Nouvelle tâche » depuis une fiche : `?nouvelle=1&pour=customer:12` ouvre le formulaire,
 * « Rattachée à » prérempli du libellé relu côté serveur (colonnes du libellé seules) ; une lecture
 * refusée ouvre le formulaire sans préremplissage.
 */
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const etat = vi.hoisted(() => ({ chemins: [] as string[], refus: false }));

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/app/actions/auth', () => ({ getMeAction: async () => ({ id: 7, roles: ['agent'] }) }));
vi.mock('@/lib/access/pages-admin-server', () => ({ capacitesDuProfilActif: async () => [] }));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));
vi.mock('@/lib/api', async (original) => {
  const vrai = await original<typeof import('@/lib/api')>();
  return {
    ...vrai,
    apiRequest: vi.fn(async (chemin: string) => {
      etat.chemins.push(chemin);
      if (etat.refus) throw new vrai.ApiError(403, { message: 'non' });
      if (chemin.startsWith('/api/customers/12')) return { data: { id: 12, first_name: 'Mariama', last_name: 'Fall' } };
      if (chemin.startsWith('/api/properties/8')) return { data: { id: 8, title: 'F2 Grand Yoff' } };
      throw new vrai.ApiError(404, { message: 'x' });
    }),
  };
});
const page = vi.fn();
vi.mock('@/components/taches/PageDesTaches', () => ({
  PageDesTaches: (props: unknown) => {
    page(props);
    return null;
  },
}));

const { default: Page } = await import('../page');

describe('Tâches — « Nouvelle tâche » préremplie depuis une fiche (TCK-2857)', () => {
  beforeEach(() => {
    page.mockReset();
    Object.assign(etat, { chemins: [], refus: false });
  });

  it('relit le nom du client (colonnes du libellé) et le passe en rattachement', async () => {
    render(await Page({ searchParams: Promise.resolve({ nouvelle: '1', pour: 'customer:12' }) }));
    expect(page).toHaveBeenCalledWith(expect.objectContaining({ ouvrirNouvelle: true, rattachement: { type: 'customer', id: 12, label: 'Mariama Fall' } }));
    const qs = new URLSearchParams(etat.chemins[0]!.split('?')[1]);
    expect(qs.get('fields[customers]')).toBe('id,first_name,last_name,email,phone');
  });

  it('un bien : son titre', async () => {
    render(await Page({ searchParams: Promise.resolve({ nouvelle: '1', pour: 'property:8' }) }));
    expect(page).toHaveBeenCalledWith(expect.objectContaining({ rattachement: { type: 'property', id: 8, label: 'F2 Grand Yoff' } }));
  });

  it('une lecture refusée, un `pour` invalide ou sans `nouvelle=1` : aucun préremplissage', async () => {
    etat.refus = true;
    render(await Page({ searchParams: Promise.resolve({ nouvelle: '1', pour: 'customer:12' }) }));
    expect(page).toHaveBeenLastCalledWith(expect.objectContaining({ ouvrirNouvelle: true, rattachement: null }));
    etat.refus = false;
    etat.chemins = [];
    render(await Page({ searchParams: Promise.resolve({ nouvelle: '1', pour: 'booking:3' }) }));
    render(await Page({ searchParams: Promise.resolve({ pour: 'customer:12' }) }));
    expect(etat.chemins).toEqual([]);
    expect(page).toHaveBeenLastCalledWith(expect.objectContaining({ ouvrirNouvelle: false, rattachement: null }));
  });
});
