/**
 * D2 de TCK-461 — **la destination de chaque tuile, par sa CLÉ et non par son rang.**
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUE `SystemMetricsGrid.test.tsx` NE GARDAIT PAS
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Son test « donne une destination à chacune des huit tuiles » compte huit ancres et n'assert
 * **nommément que deux `href`** — `?status=suspended` et `?filter[status]=pending_review`. Le
 * défaut d'origine de TCK-390 était que la tuile « Vérifiées » pointait vers
 * `/super-admin/agencies`, **au caractère près le même `href`** que « Agences (total) » juste
 * au-dessus : on lisait un sous-ensemble et on atterrissait sur le tout. Un retour à ce `href`
 * laissait la suite verte.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUI EST DÉRIVÉ, ET CE QUI EST AFFIRMÉ — la distinction porte tout le fichier
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * **L'INVENTAIRE est dérivé, deux fois plutôt qu'une :** les tuiles viennent du DOM rendu (une
 * ancre par tuile), et leur CLÉ vient du dictionnaire `superAdmin.metrics` de `fr.json`, par
 * lecture inverse du libellé. Rien ici ne sait combien il y a de tuiles ni comment elles
 * s'appellent : une neuvième tuile entre dans l'inventaire toute seule — et fait rougir la
 * complétude ci-dessous, ce qui est le comportement voulu (*une destination qu'on n'a pas
 * relue n'est pas une destination gardée*).
 *
 * **Deux propriétés sont dérivées, et la première suffit à attraper le défaut de TCK-390 :**
 *
 *  1. **Deux tuiles ne partagent jamais un `href`.** C'est la forme exacte du défaut : une tuile
 *     de sous-ensemble qui retombe sur la liste non filtrée devient l'homonyme de la tuile du
 *     tout. Aucune liste n'est écrite pour la tenir.
 *  2. **Tout `href` est non vide et vit sous `/super-admin/`.** Une tuile de console qui pointe
 *     hors console est un défaut sans qu'on ait besoin de savoir laquelle.
 *
 * **Une seule chose est AFFIRMÉE : la valeur attendue par clé.** Elle ne peut pas l'être
 * autrement — une destination juste n'est pas une propriété du code, c'est un choix produit. Ce
 * qu'on peut garder, en revanche, c'est qu'elle ne soit jamais AFFIRMÉE À MOITIÉ : la table est
 * confrontée à l'inventaire **dans les deux sens**, donc elle ne peut ni ignorer une tuile
 * rendue, ni décrire une tuile disparue.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import fr from '@/messages/fr.json';
import { fetchSystemMetrics } from '@/lib/queries/super-admin';
import type { SystemMetrics } from '@/types/super-admin';
import { withIntl } from '@/test/intl';
import { SystemMetricsGrid } from '../SystemMetricsGrid';

vi.mock('@/lib/queries/super-admin', () => ({ fetchSystemMetrics: vi.fn() }));

const BASE: SystemMetrics = {
  agencies: { total: 120, verified: 60, active: 100, suspended: 4, verification_rate: 0.5 },
  users: { total: 400, active: 380 },
  properties: { published: 900, pending_review: 12 },
  leases: { active: 300 },
  revenue: { platform_total_paid: 5_000_000, currency: 'XOF' },
  generated_at: '2026-08-27T10:00:00+00:00',
};

/**
 * Libellé rendu → clé de tuile, **lu à l'envers dans le dictionnaire** que le composant consomme.
 *
 * Les entrées à paramètre (`{rate}`, `{active}`, `{value}`) sont écartées : ce sont des précisions
 * et des deltas, jamais des libellés de tuile, et elles ne se rendent pas telles quelles.
 */
const CLE_DU_LIBELLE = new Map<string, string>(
  Object.entries(fr.superAdmin.metrics as Record<string, string>)
    .filter(([, libelle]) => !libelle.includes('{'))
    .map(([cle, libelle]) => [libelle, cle]),
);

/**
 * La table des destinations — **la seule chose écrite à la main de ce fichier**, et elle est
 * confrontée à l'inventaire dérivé dans les deux sens.
 *
 * ⚠ `verified` porte `?is_verified=1` et NON `?filter[is_verified]=1` : c'est la forme que
 * `SystemMetricsGrid.tsx` émet réellement depuis TCK-390 (la page de liste la traduit en filtre
 * spatie). *Ce test relève ce que le composant fait, pas ce qu'un ticket a écrit qu'il ferait.*
 */
const DESTINATIONS: Readonly<Record<string, string>> = {
  agenciesTotal: '/super-admin/agencies',
  verified: '/super-admin/agencies?is_verified=1',
  agenciesActive: '/super-admin/agencies?status=active',
  agenciesSuspended: '/super-admin/agencies?status=suspended',
  usersTotal: '/super-admin/users',
  publishedProperties: '/super-admin/properties?filter[status]=published',
  pendingReview: '/super-admin/properties?filter[status]=pending_review',
  platformRevenue: '/super-admin/reports',
};

/** Une tuile telle que le DOM la rend : sa clé (déduite du libellé) et sa destination. */
interface TuileRendue {
  readonly cle: string;
  readonly libelle: string;
  readonly href: string;
}

async function tuiles(): Promise<TuileRendue[]> {
  vi.mocked(fetchSystemMetrics).mockResolvedValue({ data: BASE });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    withIntl(
      <QueryClientProvider client={queryClient}>
        <SystemMetricsGrid />
      </QueryClientProvider>,
    ),
  );

  const grille = await screen.findByTestId('system-metrics-grid');
  return [...grille.querySelectorAll('a[href]')].map((ancre) => {
    // `StatCard` rend le libellé en premier `<p>` de la tuile — c'est l'eyebrow.
    const libelle = ancre.querySelector('p')?.textContent?.trim() ?? '';
    return {
      libelle,
      cle: CLE_DU_LIBELLE.get(libelle) ?? `(libellé inconnu du dictionnaire : « ${libelle} »)`,
      href: ancre.getAttribute('href') ?? '',
    };
  });
}

describe('TCK-461 / D2 — les destinations de SystemMetricsGrid', () => {
  it('la lecture inverse du dictionnaire n’est pas vide (la garde de la garde)', () => {
    expect(CLE_DU_LIBELLE.size).toBeGreaterThanOrEqual(8);
  });

  it('deux tuiles ne partagent JAMAIS une destination — le défaut de TCK-390', async () => {
    const rendues = await tuiles();

    const parHref = new Map<string, string[]>();
    for (const tuile of rendues) {
      parHref.set(tuile.href, [...(parHref.get(tuile.href) ?? []), tuile.cle]);
    }
    const doublons = [...parHref.entries()]
      .filter(([, cles]) => cles.length > 1)
      .map(([href, cles]) => `${cles.join(' = ')} → ${href}`);

    expect(
      doublons,
      'ces tuiles atterrissent au même endroit : on lit un sous-ensemble et on arrive sur le ' +
        `tout. ${doublons.join(' ; ')}`,
    ).toEqual([]);

    // Le plancher, joué APRÈS la règle : sans lui, un sélecteur cassé rendrait zéro tuile et
    // « aucun doublon » serait vrai sans rien avoir mesuré.
    expect(rendues.length).toBeGreaterThanOrEqual(8);
  });

  it('toute destination est non vide et reste dans la console super-admin', async () => {
    const rendues = await tuiles();

    const hors = rendues
      .filter((t) => !t.href.startsWith('/super-admin/'))
      .map((t) => `${t.cle} → « ${t.href} »`);
    expect(hors, `destinations hors console : ${hors.join(', ')}`).toEqual([]);
    expect(rendues.length).toBeGreaterThanOrEqual(8);
  });

  it('chaque tuile porte la destination attendue POUR SA CLÉ, et la table couvre l’inventaire', async () => {
    const rendues = await tuiles();

    // Complétude dans les DEUX sens : une tuile rendue que la table ignore, et une entrée de
    // table qui ne correspond à aucune tuile, sont toutes deux des trous de garde.
    expect(rendues.map((t) => t.cle).sort()).toEqual(Object.keys(DESTINATIONS).sort());

    for (const tuile of rendues) {
      expect(
        tuile.href,
        `la tuile « ${tuile.libelle} » (clé ${tuile.cle}) ne mène pas où elle le dit`,
      ).toBe(DESTINATIONS[tuile.cle]);
    }
  });
});
