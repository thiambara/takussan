/**
 * TCK-442 — **les huit layouts de détail, éprouvés un par un et dérivés de l'arbre.**
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUE `etats-de-route.test.ts` NE PEUT PAS DIRE
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Il lit des fichiers ; il ne monte rien. Il garde la FORME de l'arbre — un `notFound()` au-dessus
 * de toute frontière — et c'est la bonne garde pour le statut HTTP, qui est une propriété de
 * l'arbre. Il ne peut pas voir qu'un layout **appelle réellement** la sonde, ni qu'il traduit un
 * 404 d'API plutôt qu'une panne.
 *
 * Ce fichier monte les huit layouts. Son inventaire est dérivé par `import.meta.glob` — aucune
 * liste de segments n'y est écrite, et un neuvième segment de détail entre dans le périmètre sans
 * qu'on y pense (c'est le mode de défaillance que TCK-461 décrit ailleurs, et il vaut ici).
 *
 * ⚠ **Le glob s'écrit `../<star>/<star>/layout.tsx` et non `../<star>/[id]/layout.tsx`** : dans un
 * motif de glob, `[id]` est une CLASSE DE CARACTÈRES — elle apparie `i`, `d` ou `/`, jamais la
 * chaîne littérale. Le filtre sur le nom de segment se fait donc après, sur les clés.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequestMock = vi.fn();

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
}));

vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

const { ApiError } = await import('@/lib/api');

type Layout = (props: {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}) => Promise<React.ReactElement>;

// ⚠ Le `as unknown as …` n'est pas de la paresse : `vite/client` n'est pas dans les `types` du
// `tsconfig.json` de ce dépôt, donc `import.meta.glob` y est typé sans paramètre générique. Ajouter
// ces types à la configuration partagée pour un seul test coûterait plus qu'il ne rapporte.
const MODULES = import.meta.glob('../*/*/layout.tsx') as unknown as Record<
  string,
  () => Promise<{ default: Layout }>
>;

/** Segment → module de layout, pour les seuls segments dynamiques `[id]`. */
const LAYOUTS = Object.entries(MODULES)
  .map(([chemin, charger]) => ({ chemin, charger, segment: chemin.split('/')[1]! }))
  .filter(({ chemin }) => chemin.includes('/[id]/'))
  .sort((a, b) => a.segment.localeCompare(b.segment));

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');

beforeEach(() => {
  apiRequestMock.mockReset();
});

describe('TCK-442 — inventaire', () => {
  it('trouve les layouts de détail (non-vacuité de tout ce fichier)', () => {
    expect(LAYOUTS.map((l) => l.segment)).toEqual([
      'bookings',
      'customers',
      'documents',
      'inventories',
      'leases',
      'maintenance',
      'properties',
      'visits',
    ]);
  });
});

describe('TCK-442 / AC4 — chaque layout de détail traduit un 404 de l’API en introuvable', () => {
  it.each(LAYOUTS.map((l) => [l.segment, l] as const))(
    '%s : un 404 de l’API lève l’introuvable',
    async (_segment, entree) => {
      apiRequestMock.mockRejectedValue(new ApiError(404, { message: 'Not Found' }));
      const { default: Layout } = await entree.charger();

      await expect(
        Layout({ params: Promise.resolve({ id: '999999' }), children: null }),
      ).rejects.toThrow('NEXT_NOT_FOUND');
      // Et la question a bien été POSÉE à l'API : sans cette assertion, un layout qui lèverait
      // sur l'identifiant seul cocherait le test sans avoir remonté la moindre requête.
      expect(apiRequestMock).toHaveBeenCalledTimes(1);
    },
  );

  it.each(LAYOUTS.map((l) => [l.segment, l] as const))(
    '%s : un identifiant illisible lève l’introuvable sans interroger l’API',
    async (_segment, entree) => {
      const { default: Layout } = await entree.charger();
      await expect(
        Layout({ params: Promise.resolve({ id: 'pas-un-nombre' }), children: null }),
      ).rejects.toThrow('NEXT_NOT_FOUND');
      expect(apiRequestMock).not.toHaveBeenCalled();
    },
  );

  it.each(LAYOUTS.map((l) => [l.segment, l] as const))(
    '%s : une PANNE de l’API ne devient pas un introuvable, et la page est rendue',
    async (_segment, entree) => {
      // Le test qui refuse le mauvais correctif : un `catch { notFound() }` cocherait celui
      // d'au-dessus et transformerait toute panne en « cette ressource n'existe pas ».
      apiRequestMock.mockRejectedValue(new ApiError(500, { message: 'Server error' }));
      const { default: Layout } = await entree.charger();

      const arbre = await Layout({
        params: Promise.resolve({ id: '12' }),
        children: <p>contenu</p>,
      });
      expect(renderToStaticMarkup(arbre)).toContain('contenu');
    },
  );

  it.each(LAYOUTS.map((l) => [l.segment, l] as const))(
    '%s : une ressource qui existe passe, et le layout rend ses enfants',
    async (_segment, entree) => {
      apiRequestMock.mockResolvedValue({ data: { id: 12 } });
      const { default: Layout } = await entree.charger();

      const arbre = await Layout({
        params: Promise.resolve({ id: '12' }),
        children: <p>contenu</p>,
      });
      expect(renderToStaticMarkup(arbre)).toContain('contenu');
    },
  );
});

describe('TCK-442 / AC2 — le squelette d’attente n’a pas été payé pour ce statut', () => {
  it.each(LAYOUTS.map((l) => [l.segment, l] as const))(
    '%s garde le loading.tsx de son segment, et il rend route-skeleton',
    (segment) => {
      // Le patron (b) — supprimer le `loading.tsx` — aurait rendu le statut en perdant le
      // squelette que TCK-382 a acheté. Le patron (a) ne le touche pas : cette assertion est ce
      // qui distingue les deux dans l'arbre. La preuve de bout en bout (le squelette dans le HTML
      // servi) est le relevé `curl` de l'AC2, qui vit dans le ticket.
      const loading = join(APP, segment, '[id]', 'loading.tsx');
      expect(existsSync(loading), `${segment}/[id]/loading.tsx a disparu`).toBe(true);
      expect(readFileSync(loading, 'utf8')).toMatch(/RouteSkeleton/);
    },
  );

  it('et RouteSkeleton porte bien data-testid="route-skeleton"', () => {
    // Le maillon central : les huit `loading.tsx` montent `RouteSkeleton`, et c'est LUI qui porte
    // le testid que l'AC2 mesure. Sans cette assertion, les huit ci-dessus pointeraient un
    // composant qui pourrait avoir cessé de l'émettre.
    const source = readFileSync(
      join(APP, '..', '..', '..', 'components', 'console', 'RouteSkeleton.tsx'),
      'utf8',
    );
    expect(source).toContain('data-testid="route-skeleton"');
  });
});
