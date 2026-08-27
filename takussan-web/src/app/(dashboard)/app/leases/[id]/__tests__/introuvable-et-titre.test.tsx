import { describe, expect, it, vi, beforeEach } from 'vitest';
import fr from '@/messages/fr.json';
import en from '@/messages/en.json';

/**
 * TCK-382 — la fiche de bail : l'introuvable (AC3, deuxième page) et le titre d'onglet (AC5).
 *
 * Le mock d'intl est LOCAL et INTERPOLE, contrairement à `mockTraductionsServeur` qui rend le
 * gabarit brut. La raison est décisive ici : le défaut corrigé était un gabarit interpolé écrit
 * en français dans le code. Un mock qui n'interpole pas rendrait `{id}` littéral des deux côtés,
 * et le test serait vert avec ou sans le correctif. Il est aussi PARAMÉTRÉ PAR LANGUE : l'ancien
 * code rendait le même français quelle que soit la locale, donc seule une assertion anglaise le
 * distingue.
 */
let LOCALE: 'fr' | 'en' = 'fr';

vi.mock('next-intl/server', () => {
  const dictionnaires: Record<string, unknown> = { fr, en };
  const resous = (chemin: string): string => {
    const valeur = chemin.split('.').reduce<unknown>(
      (n, c) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[c] : undefined),
      dictionnaires[LOCALE],
    );
    return typeof valeur === 'string' ? valeur : chemin;
  };
  return {
    getLocale: async () => LOCALE,
    getTranslations: async (espace?: string) =>
      (cle: string, params?: Record<string, string | number>) => {
        const gabarit = resous(espace ? `${espace}.${cle}` : cle);
        if (!params) return gabarit;
        return gabarit.replace(/\{(\w+)\}/g, (_, nom: string) =>
          nom in params ? String(params[nom]) : `{${nom}}`);
      },
  };
});

const notFoundMock = vi.fn(() => { throw new Error('NEXT_NOT_FOUND'); });
vi.mock('next/navigation', () => ({ notFound: () => notFoundMock() }));
vi.mock('@/app/actions/auth', () => ({ getMeAction: async () => ({ id: 1, roles: ['agent'] }) }));

const getTokenMock = vi.fn(async () => 'jeton' as string | null);
vi.mock('@/lib/session', () => ({ getToken: () => getTokenMock() }));

const apiRequestMock = vi.fn();
vi.mock('@/lib/api', () => ({ apiRequest: (...a: unknown[]) => apiRequestMock(...a) }));

vi.mock('@/components/leases/LeaseDetail', () => ({
  LeaseDetail: ({ leaseId }: { leaseId: number }) => `LeaseDetail(${leaseId})`,
}));

const { default: Page, generateMetadata } = await import('../page');

const rendu = (id: string) => Page({ params: Promise.resolve({ id }) });
const titre = (id: string) => generateMetadata({ params: Promise.resolve({ id }) });

beforeEach(() => {
  LOCALE = 'fr';
  notFoundMock.mockClear();
  getTokenMock.mockResolvedValue('jeton');
  apiRequestMock.mockReset();
});

describe('TCK-382 / AC3 — fiche de bail', () => {
  it('identifiant illisible → introuvable', async () => {
    await expect(rendu('abc')).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  it('identifiant négatif ou nul → introuvable', async () => {
    await expect(rendu('0')).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(rendu('-3')).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('identifiant valide → la fiche, et PAS l’introuvable', async () => {
    // Non-vacuité des trois précédents : une page qui `notFound()` sur tout les passerait aussi.
    const arbre = await rendu('7');
    expect(notFoundMock).not.toHaveBeenCalled();
    expect(JSON.stringify(arbre)).toContain('7');
  });
});

describe('TCK-382 / AC5 — le titre de la fiche de bail passe par le dictionnaire', () => {
  it('rend la référence quand l’API la donne', async () => {
    apiRequestMock.mockResolvedValue({ data: { reference_number: 'BAI-2026-014' } });
    expect(await titre('7')).toEqual({ title: 'Bail BAI-2026-014' });
  });

  it('… et la rend EN ANGLAIS pour un lecteur anglophone', async () => {
    // L'assertion qui fait toute la différence : l'ancien code rendait « Bail … » ici aussi.
    LOCALE = 'en';
    apiRequestMock.mockResolvedValue({ data: { reference_number: 'BAI-2026-014' } });
    expect(await titre('7')).toEqual({ title: 'Lease BAI-2026-014' });
  });

  it('replie sur le numéro quand l’API ne rend pas de référence, dans la langue active', async () => {
    apiRequestMock.mockResolvedValue({ data: {} });
    expect(await titre('7')).toEqual({ title: 'Bail #7' });
    LOCALE = 'en';
    expect(await titre('7')).toEqual({ title: 'Lease #7' });
  });

  it('replie sur le numéro sans jeton et quand l’API échoue', async () => {
    LOCALE = 'en';
    getTokenMock.mockResolvedValue(null);
    expect(await titre('12')).toEqual({ title: 'Lease #12' });
    getTokenMock.mockResolvedValue('jeton');
    apiRequestMock.mockRejectedValue(new Error('réseau'));
    expect(await titre('12')).toEqual({ title: 'Lease #12' });
  });

  it('identifiant illisible → titre « introuvable », dans la langue active', async () => {
    LOCALE = 'en';
    expect(await titre('abc')).toEqual({ title: 'Lease not found' });
    expect(apiRequestMock).not.toHaveBeenCalled();
  });
});
