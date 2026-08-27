import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';
import type {
  DashboardAgencySummary,
  DashboardAgencyTimeseries,
} from '@/lib/queries/dashboard-agency';
import { AgencyKpis } from '@/components/dashboard/admin/AgencyKpis';
import { AgencyRevenueSnapshot } from '@/components/dashboard/admin/AgencyRevenueSnapshot';
import { BarChart } from '../BarChart';
import { LineChart } from '../LineChart';
import {
  PASTILLES_LEGENDE,
  REMPLISSAGES_SERIE,
  TRAITS_SERIE,
  pastilleLegende,
  remplissageSerie,
  traitSerie,
} from '../palette';

/**
 * TCK-374 — palette `--chart-*` et locale active.
 *
 * ⚠ **Ce que ces tests évitent, et pourquoi c'est écrit ici.** Un test de graphique se coche trop
 * facilement : « le `<figure>` est présent » reste vert quand la série est tracée hors cadre, quand
 * la classe de couleur n'existe pas, et quand l'axe est en français à un utilisateur anglophone.
 * Chaque cas ci-dessous nomme donc la valeur ATTENDUE, jamais la présence d'un nœud — et chacun a
 * été vérifié par ABLATION (rétablir le défaut, voir rougir), le compte figure dans le rapport.
 */

const SERIE_LONGUE = { labels: ['A', 'B'], series: [{ name: 'Revenus', values: [0, 2_000_000] }] };

/** Les étiquettes de l'axe des ordonnées — les `<text>` ancrés à droite de la grille. */
function etiquettesAxe(conteneur: HTMLElement): string[] {
  return [...conteneur.querySelectorAll('text[text-anchor="end"]')].map(
    (n) => n.textContent?.trim() ?? '',
  );
}

describe('palette de séries (AC2 / AC3)', () => {
  it("n'attribue que des jetons `--chart-*`, jamais une couleur de palette brute", () => {
    for (const table of [REMPLISSAGES_SERIE, TRAITS_SERIE, PASTILLES_LEGENDE]) {
      for (const classe of table) {
        expect(classe).toMatch(/^(fill|stroke|bg)-chart-[0-9]$/);
      }
    }
  });

  it("écarte `--chart-3`, mesuré à 2,57:1 sur `--card` clair (seuil WCAG 1.4.11 : 3:1)", () => {
    // ⚠ L'assertion porte sur le NUMÉRO écarté, pas sur la longueur de la table : une table de
    // quatre entrées dont l'une serait `chart-3` passerait un contrôle de taille.
    const numeros = [...REMPLISSAGES_SERIE, ...TRAITS_SERIE, ...PASTILLES_LEGENDE].map(
      (c) => c.slice(-1),
    );
    expect(numeros).not.toContain('3');
    expect(new Set(numeros)).toEqual(new Set(['1', '2', '4', '5']));
  });

  it('cycle sur un indice hors bornes au lieu de rendre une classe absente', () => {
    // `(-1) % 4 === -1` en JavaScript : sans le repli, la pastille n'aurait AUCUNE classe — donc
    // aucune couleur, sans que rien ne casse.
    for (const attribuer of [remplissageSerie, traitSerie, pastilleLegende]) {
      for (const idx of [-1, 0, 4, 7, Number.NaN]) {
        expect(attribuer(idx)).toMatch(/^(fill|stroke|bg)-chart-[1245]$/);
      }
    }
  });

  it('pose la classe de jeton sur les barres, les traits et les pastilles rendus', () => {
    const { container: barres } = render(withIntl(<BarChart data={SERIE_LONGUE} />));
    expect(barres.querySelector('rect')?.getAttribute('class')).toBe('fill-chart-1');
    expect(barres.querySelector('li span[aria-hidden]')?.className).toContain('bg-chart-1');

    const { container: traits } = render(withIntl(<LineChart data={SERIE_LONGUE} />));
    expect(traits.querySelector('path')?.getAttribute('class')).toBe('stroke-chart-1');
  });

  it('donne une couleur DISTINCTE à chaque série de la même figure', () => {
    // Une palette qui rend la même classe deux fois rend la légende inutile — et c'est le genre de
    // défaut qu'un `toContain('chart-')` par série laisserait passer.
    const { container } = render(withIntl(<BarChart
        data={{
          labels: ['A'],
          series: [
            { name: 'Un', values: [1] },
            { name: 'Deux', values: [2] },
            { name: 'Trois', values: [3] },
          ],
        }}
      />));
    const classes = [...container.querySelectorAll('rect')].map((r) => r.getAttribute('class'));
    expect(classes).toEqual(['fill-chart-1', 'fill-chart-2', 'fill-chart-4']);
    expect(new Set(classes).size).toBe(3);
  });

  it('accorde la PASTILLE de légende à la barre qu\'elle désigne, série par série', () => {
    // ⚠ Ce cas a été ajouté après une ablation qui ne rougissait PAS : mettre `bg-chart-1` sur les
    // quatre pastilles laissait tous les tests verts. Une légende qui donne la même couleur à
    // trois séries est pire qu'absente — elle affirme quelque chose de faux, et l'assertion
    // « la pastille porte un jeton » ne le voit pas. Ce sont les jetons APPARIÉS qui comptent.
    const { container } = render(withIntl(<BarChart
        data={{
          labels: ['A'],
          series: [
            { name: 'Un', values: [1] },
            { name: 'Deux', values: [2] },
            { name: 'Trois', values: [3] },
          ],
        }}
      />));
    const numero = (n: Element | null, prefixe: string) =>
      (n?.getAttribute('class') ?? n?.className ?? '').match(
        new RegExp(`${prefixe}-chart-([0-9])`),
      )?.[1];

    const barres = [...container.querySelectorAll('rect')].map((r) => numero(r, 'fill'));
    const pastilles = [...container.querySelectorAll('li span[aria-hidden]')].map((sp) =>
      numero(sp, 'bg'),
    );
    expect(pastilles).toHaveLength(3);
    expect(pastilles).toEqual(barres);
  });
});

describe("axe des graphiques — locale active (AC1 / AC4)", () => {
  it("formate l'axe de `BarChart` à l'anglaise sous la locale `en`", () => {
    const { container } = render(withIntl(<BarChart data={SERIE_LONGUE} />, 'en'));
    // en-GB groupe par virgule ; fr-SN par une espace insécable. L'assertion porte sur la CHAÎNE
    // rendue : elle rougit si `'fr'` revient, et pas seulement si l'axe disparaît.
    // L'ordre est celui des lignes de grille : 0, la moitié, le maximum.
    expect(etiquettesAxe(container)).toEqual(['0', '1,000,000', '2,000,000']);
  });

  it("formate le même axe à la française sous la locale `fr`", () => {
    const { container } = render(withIntl(<BarChart data={SERIE_LONGUE} />, 'fr'));
    const etiquettes = etiquettesAxe(container);
    expect(etiquettes).toHaveLength(3);
    // fr-SN sépare par une espace (insécable, fine ou non selon l'ICU du runtime) — jamais par une
    // virgule. Écrire l'espace attendue en dur ferait rougir ce test au prochain bump d'ICU.
    expect(etiquettes[2]).not.toContain(',');
    expect(etiquettes[2].replace(/\p{White_Space}/gu, '')).toBe('2000000');
  });

  it("formate l'axe de `LineChart` à l'anglaise sous la locale `en`", () => {
    const { container } = render(withIntl(<LineChart data={SERIE_LONGUE} />, 'en'));
    expect(etiquettesAxe(container)).toContain('2,000,000');
  });
});

const SOMME_AGENCE: DashboardAgencySummary = {
  agency_id: 1,
  period: { start: '2026-01-01T00:00:00+00:00', end: '2026-01-31T23:59:59+00:00' },
  properties: { total: 12_345, published: 100, rented: 60, available: 40 },
  leases: { active: 60 },
  customers_count: 500,
  members_count: 9,
  bookings: { pending: 2 },
  maintenance: { open: 1 },
  finance: {
    revenue_month: 1_234_000,
    commission_month: 123_400,
    overdue_count: 0,
    overdue_amount: 0,
    unpaid_rate_percent: 0,
  },
  occupancy: { rate_percent: 60 },
};

describe("tableau de bord agence rendu en `en` (AC4)", () => {
  const timeseries: DashboardAgencyTimeseries = {
    months: ['2026-01', '2026-02'],
    revenue: [1_000_000, 2_000_000],
    occupancy: [55, 60],
  };

  it("rend le TOTAL et l'AXE à l'anglaise, tous deux sur la locale active", () => {
    const { container } = render(
      withIntl(<AgencyRevenueSnapshot timeseries={timeseries} />, 'en'),
    );

    // Le total — c'est le site que la correction TCK-292 avait laissé derrière elle.
    expect(screen.getByText(/3,000,000/)).toBeInTheDocument();
    // …et l'axe, dans le même rendu : les deux moitiés doivent tenir ensemble. Le sommet de l'axe
    // est le MAXIMUM de la série (2 M), pas le total (3 M) — deux formatages, un seul rendu.
    expect(etiquettesAxe(container).some((e) => e.includes('2,000,000'))).toBe(true);
    expect(etiquettesAxe(container).some((e) => e.includes('2 000 000'))).toBe(false);
  });

  it('rend les six tuiles KPI à l\'anglaise sous la locale `en`', () => {
    // `AgencyKpis` portait dix des douze locales écrites en dur du ticket. Sans ce cas, les
    // rétablir toutes laisserait la suite verte : aucun test n'y rendait autre chose que `fr`.
    render(withIntl(<AgencyKpis summary={SOMME_AGENCE} />, 'en'));
    expect(screen.getByText('1,234,000 F CFA')).toBeInTheDocument();
    expect(screen.getByText('12,345')).toBeInTheDocument();
    expect(screen.queryByText(/1 234 000/)).toBeNull();
  });

  it('rend le même total à la française sous la locale `fr`', () => {
    render(withIntl(<AgencyRevenueSnapshot timeseries={timeseries} />, 'fr'));
    expect(screen.getByText(/3\s?000\s?000/)).toBeInTheDocument();
    expect(screen.queryByText(/3,000,000/)).toBeNull();
  });
});

/**
 * Les deux sondes que la revue adverse du jumeau super-admin (TCK-361) a trouvées, éprouvées ici.
 *
 * Elles ne cochent aucun AC : elles DOCUMENTENT le comportement mesuré, pour qu'un correctif futur
 * ait un point de départ plutôt qu'une découverte. Les deux constats sont reportés dans le ticket.
 */
describe('sondes de domaine (constats, hors AC)', () => {
  it('⚠ `BarChart` ancre son échelle à zéro : une valeur NÉGATIVE ne trace rien (TCK-405)', () => {
    const { container } = render(withIntl(<BarChart
        data={{ labels: ['A', 'B'], series: [{ name: 'Solde', values: [-500, 1000] }] }}
      />));
    const hauteurs = [...container.querySelectorAll('rect')].map((r) =>
      Number(r.getAttribute('height')),
    );
    // La barre négative est rendue à hauteur ZÉRO — invisible, sans erreur ni avertissement.
    expect(hauteurs[0]).toBe(0);
    expect(hauteurs[1]).toBeGreaterThan(0);
  });

  it('`LineChart`, lui, ouvre son domaine aux négatifs et trace DANS le cadre', () => {
    const { container } = render(withIntl(<LineChart
        data={{ labels: ['A', 'B'], series: [{ name: 'Solde', values: [-500, 1000] }] }}
      />));
    const d = container.querySelector('path')?.getAttribute('d') ?? '';
    const y = [...d.matchAll(/[ML][\d.]+,([\d.]+)/g)].map((m) => Number(m[1]));
    expect(y).toHaveLength(2);
    // Cadre utile : PADDING.top (16) → VIEW_H − PADDING.bottom (232). Aucun point hors bornes.
    for (const v of y) {
      expect(v).toBeGreaterThanOrEqual(16);
      expect(v).toBeLessThanOrEqual(232);
    }
  });
});
