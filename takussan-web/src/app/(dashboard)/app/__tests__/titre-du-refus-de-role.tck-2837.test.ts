/**
 * TCK-2837 — **l'onglet d'un refus de RÔLE en 404 dit « Page introuvable » jusqu'au bout.**
 *
 * Mesuré le 2026-11-14 (serveur de dev, persona agent, `/app/owners/30`, fiche existante) : la réponse
 * est un 404 et le `<title>` du HTML dit « Page introuvable — Takussan », puis l'hydratation réécrit
 * l'onglet en « Fiche du bailleur — Takussan ». Le layout refuse par `assertCanReachOwnerAccount`
 * (`notFound()`, décision 3a de TCK-2641), mais le `generateMetadata` de la page l'ignorait. C'est le
 * mécanisme de TCK-2831 (`titre-de-la-fiche-absente.tck-2831.test.ts`), avec le rôle pour cause.
 *
 * Le correctif : le `generateMetadata` rappelle le refus du layout AVANT la sonde d'existence.
 * `getMeAction` est mémoïsé par `cache()` : aucune lecture de `/api/auth/me` de plus (journal de l'API).
 *
 * Deux gardes, dérivées de l'arbre (aucune liste de segments écrite ici) :
 *  · AC3, sur la SOURCE : toute page dont le layout refuse par une garde `assertCanReach*` qui rend
 *    `notFound()` (lue dans `@/lib/auth/guards`) rappelle la même garde dans son `generateMetadata` ;
 *  · au MONTAGE : ce `generateMetadata` lève l'introuvable pour l'agent SANS sonder l'API, et rend
 *    le titre de la fiche pour l'admin.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Metadata } from 'next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import fr from '@/messages/fr.json';

const NOT_FOUND = new Error('NEXT_NOT_FOUND');
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw NOT_FOUND;
  }),
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));

const getMeActionMock = vi.fn();
vi.mock('@/app/actions/auth', () => ({ getMeAction: () => getMeActionMock() }));

const exigerRessourceMock = vi.fn();
vi.mock('@/lib/detail/ressource-de-detail', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/detail/ressource-de-detail')>()),
  exigerRessource: (...args: unknown[]) => exigerRessourceMock(...args),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: async (espace: string) => (cle: string) => {
    const brut = espace
      .split('.')
      .concat(cle)
      .reduce<unknown>((n, k) => (n as Record<string, unknown>)?.[k], fr);
    return typeof brut === 'string' ? brut : `${espace}.${cle}`;
  },
}));

vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton', getActiveProfileId: async () => null }));

// Le rendu de la page : la lecture de la fiche et ses voisines, doublées pour les compter.
const lireBailleurDuRenduMock = vi.fn();
vi.mock('@/lib/owners/fiche-du-rendu', () => ({ lireBailleurDuRendu: (...a: unknown[]) => lireBailleurDuRenduMock(...a) }));
const fetchDashboardPropertiesMock = vi.fn(async () => ({ data: [] }));
vi.mock('@/lib/queries/properties-server', () => ({
  fetchDashboardProperties: (...a: unknown[]) => fetchDashboardPropertiesMock(...(a as [])),
}));
const capacitesDuProfilActifMock = vi.fn(async () => [] as string[]);
vi.mock('@/lib/access/pages-admin-server', () => ({ capacitesDuProfilActif: () => capacitesDuProfilActifMock() }));
vi.mock('@/components/owners/fiche/FicheDuBailleur', () => ({ FicheDuBailleur: () => null }));

const ICI = dirname(fileURLToPath(import.meta.url));
const APP = join(ICI, '..');
const GARDES = join(ICI, '../../../../lib/auth/guards.ts');

/** Les gardes `assertCanReach*` de `guards.ts` dont le refus est un `notFound()` (et non un renvoi). */
function gardesQuiRendent404(): string[] {
  const source = readFileSync(GARDES, 'utf8');
  const noms: string[] = [];
  for (const m of source.matchAll(/export function (assertCanReach\w+)\s*\([^)]*\)[^{]*\{([\s\S]*?)\n\}/g)) {
    if (/\bnotFound\s*\(/.test(m[2])) noms.push(m[1]);
  }
  return noms;
}

/** Le corps de `generateMetadata` (les deux formes légales, comme `titres-onglets.test.ts`). */
function corpsDeMetadata(source: string): string | null {
  const debut = source.search(/export\s+(async\s+)?(function\s+generateMetadata|const\s+generateMetadata\s*=)/);
  if (debut < 0) return null;
  const bloc = source.slice(debut);
  const fin = bloc.search(/\n\}[;\n]/);
  return fin > 0 ? bloc.slice(0, fin) : bloc;
}

/** Chaque layout de `/app` qui appelle une garde à 404, avec les gardes qu'il appelle. */
function layoutsQuiRefusentEn404(): { dossier: string; gardes: string[] }[] {
  const gardes = gardesQuiRendent404();
  const trouves: { dossier: string; gardes: string[] }[] = [];
  const parcours = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const chemin = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== '__tests__') parcours(chemin);
        continue;
      }
      if (e.name !== 'layout.tsx') continue;
      const source = readFileSync(chemin, 'utf8');
      const appelees = gardes.filter((g) => source.includes(`${g}(`));
      if (appelees.length) trouves.push({ dossier: relative(APP, dir), gardes: appelees });
    }
  };
  parcours(APP);
  return trouves.sort((a, b) => a.dossier.localeCompare(b.dossier));
}

const LAYOUTS = layoutsQuiRefusentEn404();

type GenerateMetadata = (props: { params: Promise<{ id: string }> }) => Promise<Metadata>;
type Rendu = (props: { params: Promise<{ id: string }>; searchParams?: Promise<Record<string, string>> }) => Promise<unknown>;
const chargerPageDuBailleur = () =>
  import('../owners/[id]/page') as unknown as Promise<{ generateMetadata: GenerateMetadata; default: Rendu }>;

beforeEach(() => {
  getMeActionMock.mockReset();
  exigerRessourceMock.mockReset();
  lireBailleurDuRenduMock.mockReset();
  fetchDashboardPropertiesMock.mockClear();
  capacitesDuProfilActifMock.mockClear();
});

describe('TCK-2837 AC3 — garde de la source', () => {
  it('lit les gardes à 404 de guards.ts et les layouts qui les appellent (non-vacuité)', () => {
    expect(gardesQuiRendent404()).toEqual(['assertCanReachOwnerAccount']);
    expect(LAYOUTS).toEqual([{ dossier: 'owners/[id]', gardes: ['assertCanReachOwnerAccount'] }]);
  });

  it.each(LAYOUTS.map((l) => [l.dossier, l.gardes] as const))(
    '%s : generateMetadata rappelle le refus de rôle de son layout',
    (dossier, gardes) => {
      const page = join(APP, dossier, 'page.tsx');
      expect(existsSync(page), `${dossier}/page.tsx manque`).toBe(true);
      const corps = corpsDeMetadata(readFileSync(page, 'utf8'));
      expect(corps, `${dossier}/page.tsx n'exporte aucun generateMetadata`).not.toBeNull();
      for (const garde of gardes) {
        expect(
          corps,
          `${dossier}/page.tsx : generateMetadata doit appeler ${garde}(…) comme son layout — sinon l'onglet du refus redevient le titre de la page après l'hydratation`,
        ).toContain(`${garde}(`);
      }
    },
  );
});

describe('TCK-2837 AC1/AC2 — au montage, owners/[id]', () => {
  it('un agent : generateMetadata lève l’introuvable, sans sonder l’API', async () => {
    getMeActionMock.mockResolvedValue({ id: 3, agency_id: 7, roles: ['agent', 'customer'] });
    const { generateMetadata } = await chargerPageDuBailleur();
    await expect(generateMetadata({ params: Promise.resolve({ id: '30' }) })).rejects.toBe(NOT_FOUND);
    expect(exigerRessourceMock).not.toHaveBeenCalled();
  });

  it('l’admin d’agence : le titre de la fiche, après la sonde du segment', async () => {
    getMeActionMock.mockResolvedValue({ id: 2, agency_id: 7, roles: ['agency_admin', 'customer'] });
    exigerRessourceMock.mockResolvedValue(30);
    const { generateMetadata } = await chargerPageDuBailleur();
    const { title } = await generateMetadata({ params: Promise.resolve({ id: '30' }) });
    expect(title).toBe(fr.dashboard.pages.ownerDetail.metaTitle);
    expect(exigerRessourceMock).toHaveBeenCalledWith('owners', '30');
    expect(getMeActionMock).toHaveBeenCalledTimes(1);
  });
});

/**
 * TCK-2837 (décision 1 du porteur) — Next lance le rendu de la page EN PARALLÈLE du layout qui refuse :
 * sans narrowing, l'agent refusé déclenchait encore `GET /api/owners/<id>` (403, « ⨯ Error » au journal).
 * Le rendu rend `null` hors de `ouvreLaFicheDuBailleur`, AVANT toute lecture : ce n'est pas un refus (le
 * 404 reste celui du layout, `etats-de-route.test.ts`), c'est une lecture qui n'a plus lieu.
 */
describe('TCK-2837 — le rendu de owners/[id] ne lit rien pour l’agent refusé', () => {
  it('un agent : rien n’est lu, ni la fiche, ni ses biens, ni les capacités', async () => {
    getMeActionMock.mockResolvedValue({ id: 3, agency_id: 7, roles: ['agent', 'customer'] });
    const { default: Page } = await chargerPageDuBailleur();
    expect(await Page({ params: Promise.resolve({ id: '30' }), searchParams: Promise.resolve({}) })).toBeNull();
    expect(lireBailleurDuRenduMock).not.toHaveBeenCalled();
    expect(fetchDashboardPropertiesMock).not.toHaveBeenCalled();
    expect(capacitesDuProfilActifMock).not.toHaveBeenCalled();
  });

  it('l’admin d’agence : la fiche est lue une fois, comme avant', async () => {
    getMeActionMock.mockResolvedValue({ id: 2, agency_id: 7, roles: ['agency_admin', 'customer'] });
    lireBailleurDuRenduMock.mockResolvedValue({ data: { id: 30, user_id: 9, agency_id: 7, status: 'active' } });
    const { default: Page } = await chargerPageDuBailleur();
    expect(await Page({ params: Promise.resolve({ id: '30' }), searchParams: Promise.resolve({}) })).not.toBeNull();
    expect(lireBailleurDuRenduMock).toHaveBeenCalledTimes(1);
    expect(lireBailleurDuRenduMock).toHaveBeenCalledWith('jeton', 30);
  });
});

