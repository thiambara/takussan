/**
 * TCK-2831 — **l'onglet d'une fiche absente de `/app` dit « Page introuvable » jusqu'au bout.**
 *
 * Mesuré le 2026-11-14 (serveur de dev, persona agent, `/app/<segment>/99999999`, les neuf segments) :
 * le `<title>` du HTML 404 disait « Page introuvable — Takussan » (métadonnées du document d'erreur,
 * résolues avec la convention `not-found`, TCK-2740), puis **l'hydratation réécrivait l'onglet** avec
 * les métadonnées de la PAGE demandée — « Fiche bien », « Bail #99999999 »… — parce que son
 * `generateMetadata` ignorait que la ressource manque.
 *
 * Le correctif : le `generateMetadata` de chaque page de détail appelle `exigerRessource(<segment>, id)`
 * avant de rendre son titre. Son `notFound()` fait résoudre les métadonnées par la convention
 * `not-found`, donc le titre de `../not-found.tsx` ; `cache()` partage la sonde avec le layout (aucune
 * lecture de plus, compté au journal de l'API).
 *
 * Deux gardes, dérivées de l'arbre (aucune liste de segments écrite ici, comme `introuvable-de-detail`) :
 *  · AC4, sur la SOURCE : toute page dont le layout décide son introuvable par `exigerRessource('<s>'`
 *    a un `generateMetadata` qui appelle `exigerRessource('<s>'` ;
 *  · AC1, au MONTAGE : ce `generateMetadata` lève l'introuvable quand la sonde le lève, avec le
 *    segment et l'identifiant de l'URL, et rend son titre sinon.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Metadata } from 'next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import fr from '@/messages/fr.json';

const exigerRessourceMock = vi.fn();

vi.mock('@/lib/detail/ressource-de-detail', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/detail/ressource-de-detail')>()),
  exigerRessource: (...args: unknown[]) => exigerRessourceMock(...args),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: async (espace: string) => (cle: string, valeurs?: Record<string, unknown>) => {
    const brut = espace
      .split('.')
      .concat(cle)
      .reduce<unknown>((n, k) => (n as Record<string, unknown>)?.[k], fr);
    return typeof brut === 'string'
      ? brut.replace(/\{(\w+)\}/g, (_, k: string) => String(valeurs?.[k] ?? `{${k}}`))
      : `${espace}.${cle}`;
  },
}));

// Le titre du bail lit sa référence au serveur : sans jeton, il rend « Bail #<id> » sans requête.
vi.mock('@/lib/session', () => ({ getToken: async () => null, getActiveProfileId: async () => null }));

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Les segments `<s>/[id]` dont le layout décide l'introuvable par `exigerRessource('<s>'`. */
function segmentsDecidesParLeLayout(): string[] {
  return readdirSync(APP, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== '__tests__')
    .map((e) => e.name)
    .filter((s) => {
      const layout = join(APP, s, '[id]', 'layout.tsx');
      return existsSync(layout) && readFileSync(layout, 'utf8').includes(`exigerRessource('${s}'`);
    })
    .sort();
}

/** Le corps de `generateMetadata` (les deux formes légales, comme `titres-onglets.test.ts`). */
function corpsDeMetadata(source: string): string | null {
  const debut = source.search(/export\s+(async\s+)?(function\s+generateMetadata|const\s+generateMetadata\s*=)/);
  if (debut < 0) return null;
  const bloc = source.slice(debut);
  const fin = bloc.search(/\n\}[;\n]/);
  return fin > 0 ? bloc.slice(0, fin) : bloc;
}

const SEGMENTS = segmentsDecidesParLeLayout();

type GenerateMetadata = (props: { params: Promise<{ id: string }> }) => Promise<Metadata>;
const PAGES = import.meta.glob('../*/*/page.tsx') as unknown as Record<
  string,
  () => Promise<{ generateMetadata?: GenerateMetadata }>
>;
const chargerPage = (segment: string) => PAGES[`../${segment}/[id]/page.tsx`]!;

beforeEach(() => {
  exigerRessourceMock.mockReset();
});

describe('TCK-2831 AC4 — garde de la source', () => {
  it('trouve les neuf pages de détail (non-vacuité)', () => {
    expect(SEGMENTS).toEqual([
      'bookings',
      'customers',
      'documents',
      'inventories',
      'leases',
      'maintenance',
      'owners',
      'properties',
      'visits',
    ]);
  });

  it.each(SEGMENTS)('%s/[id] : generateMetadata appelle exigerRessource du même segment', (segment) => {
    const page = join(APP, segment, '[id]', 'page.tsx');
    const corps = corpsDeMetadata(readFileSync(page, 'utf8'));
    expect(corps, `${segment}/[id]/page.tsx n'exporte aucun generateMetadata`).not.toBeNull();
    expect(
      corps,
      `${segment}/[id]/page.tsx : generateMetadata doit appeler exigerRessource('${segment}', …) avant son titre — sinon l'onglet d'une fiche absente redevient le titre de la fiche après l'hydratation`,
    ).toContain(`exigerRessource('${segment}'`);
  });
});

describe('TCK-2831 AC1 — au montage', () => {
  it.each(SEGMENTS)('%s/[id] : une fiche absente lève l’introuvable depuis generateMetadata', async (segment) => {
    exigerRessourceMock.mockRejectedValue(new Error('NEXT_NOT_FOUND'));
    const { generateMetadata } = await chargerPage(segment)();
    await expect(generateMetadata!({ params: Promise.resolve({ id: '99999999' }) })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    );
    expect(exigerRessourceMock).toHaveBeenCalledWith(segment, '99999999');
  });

  it.each(SEGMENTS)('%s/[id] : une fiche présente garde son titre', async (segment) => {
    exigerRessourceMock.mockResolvedValue(12);
    const { generateMetadata } = await chargerPage(segment)();
    const { title } = await generateMetadata!({ params: Promise.resolve({ id: '12' }) });
    expect(typeof title).toBe('string');
    expect(title).not.toBe(fr.dashboard.notFound.heading);
    expect(String(title)).not.toMatch(/^dashboard\./);
  });
});
