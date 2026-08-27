import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';
import { SEUIL_NON_TEXTUEL, contraste, fmt } from '@/test/contraste-wcag';
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

  it("porte les CINQ jetons de la charte depuis que TCK-404 a corrigé `--chart-3`", () => {
    // ⚠ Ce cas affirmait l'INVERSE jusqu'au 2026-08-27 : `--chart-3` était écarté pour son
    // 2,57:1 sur `--card` clair. TCK-404 a corrigé la valeur (`#c89a4a` → `#ad8034`, 3,55:1) et
    // l'ordre est redevenu celui de la charte. L'assertion porte toujours sur les NUMÉROS, pas
    // sur la longueur de la table : une table de cinq entrées dont deux seraient `chart-1`
    // passerait un contrôle de taille.
    const numeros = [...REMPLISSAGES_SERIE, ...TRAITS_SERIE, ...PASTILLES_LEGENDE].map(
      (c) => c.slice(-1),
    );
    expect(new Set(numeros)).toEqual(new Set(['1', '2', '3', '4', '5']));
  });

  it('⚠ `--chart-3` atteint 3:1 sur `--card` dans LES DEUX thèmes — lu dans `globals.css`', () => {
    // ────────────────────────────────────────────────────────────────────────────────────────
    // Ce cas lit la FEUILLE, pas une copie. C'est ce qui le distingue du harnais
    // `src/test/contraste-wcag.ts`, qui recopie les jetons à dessein : ici la question porte sur
    // la VALEUR du jeton elle-même, et une valeur recopiée ne peut pas dire qu'elle a changé.
    //
    // Il double `scripts/check-chart-contrast.mjs` volontairement. La garde tourne en CI ; ce
    // cas-ci rougit dans la boucle de `npm run test`, là où le jeton se modifie.
    // ────────────────────────────────────────────────────────────────────────────────────────
    const css = readFileSync(join(__dirname, '..', '..', '..', 'app', 'globals.css'), 'utf8');
    const bloc = (selecteur: string) => {
      const i = css.indexOf(`${selecteur} {`);
      expect(i, `bloc ${selecteur} introuvable dans globals.css`).toBeGreaterThan(-1);
      return css.slice(i, css.indexOf('\n}', i));
    };
    const jeton = (source: string, nom: string) => {
      const m = source.match(new RegExp(`--${nom}\\s*:\\s*(#[0-9a-fA-F]{6})\\s*;`));
      expect(m, `--${nom} introuvable`).not.toBeNull();
      return (m as RegExpMatchArray)[1];
    };

    for (const [theme, selecteur] of [['clair', ':root'], ['sombre', '.dark']] as const) {
      const source = bloc(selecteur);
      const ratio = contraste(jeton(source, 'chart-3'), jeton(source, 'card'));
      expect(ratio, `--chart-3 en ${theme} : ${fmt(ratio)}`).toBeGreaterThanOrEqual(
        SEUIL_NON_TEXTUEL,
      );
    }
  });

  it('cycle sur un indice hors bornes au lieu de rendre une classe absente', () => {
    // `(-1) % 5 === -1` en JavaScript : sans le repli, la pastille n'aurait AUCUNE classe — donc
    // aucune couleur, sans que rien ne casse.
    for (const attribuer of [remplissageSerie, traitSerie, pastilleLegende]) {
      for (const idx of [-1, 0, 5, 9, Number.NaN]) {
        expect(attribuer(idx)).toMatch(/^(fill|stroke|bg)-chart-[1-5]$/);
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
    // ⚠ La TROISIÈME valait `fill-chart-4` jusqu'au 2026-08-27 : `--chart-3` était écarté de la
    // table. TCK-404 l'a corrigé et l'ordre de la charte (`1,2,3,4,5`) est restauré — ce cas est
    // l'endroit où ce changement se voit, et c'est pourquoi il porte les classes en toutes lettres.
    expect(classes).toEqual(['fill-chart-1', 'fill-chart-2', 'fill-chart-3']);
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

  it('⚠ rend les tuiles KPI en `wo` avec UNE seule convention de nombre (D1)', () => {
    // ────────────────────────────────────────────────────────────────────────────────────────
    // LA RÉGRESSION QUE CE TICKET A RENDUE ATTEIGNABLE, et qu'aucun des 14 cas d'origine ne
    // voyait — ils ne rendaient que `fr` et `en`, ce que l'AC4 demandait littéralement.
    //
    // `AgencyKpis` passait `'fr'` EN DUR sur ses dix sites ; TCK-374 les a portés sur la locale
    // ACTIVE. En `wo`, `formatNumber` partait alors dans les données CLDR de `wo` (groupement par
    // POINT) tandis que `formatCurrency`, lui, atteignait bien `fr-SN` (espace) :
    //
    //     « Kër yi 12.345 … Njariñu weer wi 1 234 000 F CFA »   ← DEUX conventions, MÊME carte
    //
    // L'assertion porte donc sur les deux valeurs ENSEMBLE, dans un seul rendu. Un correctif qui
    // n'alignerait qu'une des deux tables de `@/lib/format` la laisserait rouge — c'est ce qui la
    // distingue d'un simple `getByText('12 345')`.
    // ────────────────────────────────────────────────────────────────────────────────────────
    render(withIntl(<AgencyKpis summary={SOMME_AGENCE} />, 'wo'));

    const espaces = (s: string) => s.replace(/\p{White_Space}/gu, '');
    const nombre = screen.getByText((_, n) => espaces(n?.textContent ?? '') === '12345');
    const montant = screen.getByText((_, n) => espaces(n?.textContent ?? '') === '1234000FCFA');

    expect(nombre.textContent).not.toContain('.');
    expect(montant.textContent).not.toContain('.');
    // …et le groupement est le MÊME des deux côtés, ce qu'un point contre une espace violait.
    expect(screen.queryByText(/12\.345/)).toBeNull();
  });

  it('rend le même total à la française sous la locale `fr`', () => {
    render(withIntl(<AgencyRevenueSnapshot timeseries={timeseries} />, 'fr'));
    expect(screen.getByText(/3\s?000\s?000/)).toBeInTheDocument();
    expect(screen.queryByText(/3,000,000/)).toBeNull();
  });
});

describe("axe de `BarChart` — l'échelle ne s'invente pas de maximum (D5)", () => {
  /**
   * ⚠ Ces trois cas viennent de la revue adverse de TCK-374, et ils portent un défaut ORDINAIRE.
   *
   * `range = Math.max(max - min, 1)` protège la division par zéro. Ce plancher remontait jusqu'aux
   * étiquettes : une agence sans revenu du mois — pas un cas limite, l'état d'une agence neuve —
   * lisait `['0', '1', '1']` au-dessus d'un graphique plat. Deux étiquettes identiques, et une
   * échelle qui annonce un maximum que rien n'atteint.
   */
  it('ne rend QU’UNE graduation quand toutes les valeurs sont à zéro', () => {
    const { container } = render(withIntl(<BarChart
        data={{ labels: ['Jan', 'Fév'], series: [{ name: 'Revenus', values: [0, 0] }] }}
      />));

    // Avant le correctif : ['0', '1', '1'].
    expect(etiquettesAxe(container)).toEqual(['0']);
  });

  it('ne rend pas deux fois la même étiquette sur une étendue FRACTIONNAIRE', () => {
    // Même défaut, valeurs non nulles : une étendue de 0,6 passait sous le plancher de 1, et
    // l'arrondi à l'entier rendait ['0', '1', '1']. Ce n'est pas un cas voisin, c'est le même.
    const { container } = render(withIntl(<BarChart
        data={{ labels: ['A', 'B'], series: [{ name: 'Taux', values: [0.2, 0.6] }] }}
      />));
    const etiquettes = etiquettesAxe(container);

    expect(new Set(etiquettes).size).toBe(etiquettes.length);
  });

  it('⚠ `LineChart` portait le MÊME défaut, en pire — quatre étiquettes en double', () => {
    // Mesuré avant correctif : ['0', '0', '1', '1', '1'] sur cinq graduations.
    const { container } = render(withIntl(<LineChart
        data={{ labels: ['Jan', 'Fév'], series: [{ name: 'Revenus', values: [0, 0] }] }}
      />));

    expect(etiquettesAxe(container)).toEqual(['0']);
  });

  it('`LineChart` garde ses cinq graduations dès qu’il y a une étendue', () => {
    const { container } = render(withIntl(<LineChart
        data={{ labels: ['A', 'B'], series: [{ name: 'Revenus', values: [0, 2_000_000] }] }}
      />, 'en'));

    expect(etiquettesAxe(container))
      .toEqual(['0', '500,000', '1,000,000', '1,500,000', '2,000,000']);
  });

  it('garde ses trois graduations, et les BONNES, dès qu’il y a une étendue', () => {
    // Le filet ne doit pas manger l'axe du cas nominal — c'est le risque exact d'une déduplication.
    const { container } = render(withIntl(<BarChart
        data={{ labels: ['A', 'B'], series: [{ name: 'Revenus', values: [0, 2_000_000] }] }}
      />, 'en'));

    expect(etiquettesAxe(container)).toEqual(['0', '1,000,000', '2,000,000']);
  });
});

/**
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * TCK-405 — `BarChart` ouvre son domaine vers le bas, et zéro reste la ligne de base
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * ⚠ **Ce bloc s'appelait `sondes de domaine (constats, hors AC)` et affirmait l'INVERSE.** Ses
 * deux premiers cas DOCUMENTAIENT le défaut — `expect(hauteurs[0]).toBe(0)`, c'est-à-dire « la
 * barre négative est invisible, et c'est ce qu'on attend ». C'était juste : une sonde fige un
 * comportement mesuré pour qu'un correctif futur ait un point de départ. TCK-405 est ce
 * correctif, et les sondes deviennent donc des assertions du comportement CORRIGÉ.
 *
 * *Une sonde qui survit à son correctif est un test qui défend le défaut.*
 */

/**
 * Le cadre utile du SVG — les bornes hors desquelles rien ne doit être tracé.
 *
 * ⚠ `EPS` n'est pas une tolérance de confort : mesuré, la barre `-500` du domaine −500…1000 rend
 * `y + hauteur = 232.00000000000003`. Trois cent-billionièmes de pixel au-delà du cadre, produits
 * par `216 * (1 - 500/1500)` — un tiers n'est pas représentable en binaire. Écrire l'assertion à
 * l'exact ferait rougir un correctif JUSTE sur une propriété de l'arithmétique flottante ; l'écrire
 * sans borne du tout ne dirait plus rien. La borne est donc explicite, et 10⁻⁹ px la place onze
 * ordres de grandeur sous le pixel — un débordement RÉEL en vaut des dizaines.
 */
const CADRE = { haut: 16, bas: 232 };
const EPS = 1e-9;

/** Les quatre coordonnées de chaque `<rect>`, telles que le DOM les porte. */
function barres(conteneur: HTMLElement) {
  return [...conteneur.querySelectorAll('rect')].map((r) => ({
    x: Number(r.getAttribute('x')),
    y: Number(r.getAttribute('y')),
    largeur: Number(r.getAttribute('width')),
    hauteur: Number(r.getAttribute('height')),
  }));
}

describe('domaine de `BarChart` — les valeurs négatives (TCK-405)', () => {
  it('AC1 — `[-500, 1000]` rend DEUX barres de hauteur > 0', () => {
    const { container } = render(withIntl(<BarChart
        data={{ labels: ['A', 'B'], series: [{ name: 'Solde', values: [-500, 1000] }] }}
      />));
    const rendues = barres(container);

    expect(rendues).toHaveLength(2);
    // Avant TCK-405 : `hauteur` valait 0 sur la première, sans erreur ni avertissement.
    for (const b of rendues) expect(b.hauteur).toBeGreaterThan(0);
  });

  it('AC2 — aucun `y` ni `y + hauteur` hors du cadre utile, sur quatre domaines', () => {
    // ⚠ L'assertion porte sur les COORDONNÉES, jamais sur la présence du nœud : c'est ce qui la
    // distingue du test que le défaut d'origine passait au vert. Une barre tracée sous la ligne
    // de base avec sa vraie hauteur sortirait du cadre — c'est exactement ce que le
    // `Math.max(0, h)` masquait en avalant la donnée.
    for (const values of [[-500, 1000], [-500, -300], [0, 2_000_000], [-1, 0, 1]]) {
      const { container } = render(withIntl(<BarChart
          data={{ labels: values.map((_, i) => String(i)), series: [{ name: 'S', values }] }}
        />));
      for (const b of barres(container)) {
        expect(b.y, `y hors cadre pour ${JSON.stringify(values)}`)
          .toBeGreaterThanOrEqual(CADRE.haut - EPS);
        expect(b.y + b.hauteur, `y+h hors cadre pour ${JSON.stringify(values)}`)
          .toBeLessThanOrEqual(CADRE.bas + EPS);
      }
    }
  });

  it('AC3 — une série ENTIÈREMENT POSITIVE rend les coordonnées d’AVANT, au chiffre près', () => {
    // ────────────────────────────────────────────────────────────────────────────────────────
    // Les valeurs ci-dessous sont un RELEVÉ, pris sur `BarChart` AVANT le correctif (2026-08-27)
    // et recopié ici. C'est ce qui rend la non-régression VÉRIFIÉE plutôt que relue : une formule
    // algébriquement équivalente peut différer au dernier bit flottant, et seule une comparaison
    // le dit. Les quatre cas couvrent les quatre chemins que le correctif traverse : série
    // ordinaire, deux séries, série entièrement PLATE (où le plancher de `range` joue), et
    // étendue FRACTIONNAIRE (où l'arrondi des étiquettes joue).
    // ────────────────────────────────────────────────────────────────────────────────────────
    const releve = [
      {
        data: { labels: ['A', 'B', 'C'], series: [{ name: 'R', values: [0, 1500, 400] }] },
        rects: [
          '69.2,232,136.26666666666665,0',
          '263.8666666666667,16,136.26666666666665,216',
          '458.5333333333333,174.4,136.26666666666665,57.6',
        ],
        axe: ['0', '750', '1 500'],
      },
      {
        data: {
          labels: ['A', 'B'],
          series: [{ name: 'X', values: [3, 7] }, { name: 'Y', values: [5, 1] }],
        },
        rects: [
          '83.80000000000001,139.42857142857144,102.19999999999999,92.57142857142857',
          '186,77.71428571428572,102.19999999999999,154.28571428571428',
          '375.8,16,102.19999999999999,216',
          '478,201.14285714285714,102.19999999999999,30.857142857142854',
        ],
        axe: ['0', '4', '7'],
      },
      {
        data: { labels: ['A', 'B'], series: [{ name: 'Z', values: [0, 0] }] },
        rects: ['83.80000000000001,232,204.39999999999998,0', '375.8,232,204.39999999999998,0'],
        axe: ['0'],
      },
      {
        data: { labels: ['A', 'B'], series: [{ name: 'F', values: [0.2, 0.6] }] },
        rects: [
          '83.80000000000001,188.8,204.39999999999998,43.2',
          '375.8,102.4,204.39999999999998,129.6',
        ],
        axe: ['0', '1'],
      },
    ];

    for (const cas of releve) {
      const { container } = render(withIntl(<BarChart data={cas.data} />));
      const rendus = [...container.querySelectorAll('rect')].map((r) =>
        ['x', 'y', 'width', 'height'].map((a) => r.getAttribute(a)).join(','));
      expect(rendus, JSON.stringify(cas.data.series)).toEqual(cas.rects);
      // …et l'axe avec, parce que le correctif touche `min`, dont les étiquettes dépendent.
      expect(etiquettesAxe(container).map((e) => e.replace(/\p{White_Space}/gu, ' ')))
        .toEqual(cas.axe);
    }
  });

  it('rend la LIGNE DE BASE dès que le domaine descend sous zéro, et jamais sinon', () => {
    const avecNegatif = render(withIntl(<BarChart
        data={{ labels: ['A', 'B'], series: [{ name: 'Solde', values: [-500, 1000] }] }}
      />));
    const ligne = avecNegatif.container.querySelector('[data-testid="bar-zero-line"]');
    expect(ligne).not.toBeNull();
    // Domaine −500…1000 sur un cadre de 216 px : zéro est au tiers du bas, soit 232 − 72 = 160.
    // L'assertion porte sur la POSITION — une ligne présente mais posée au mauvais endroit est
    // pire qu'absente, elle affirme une origine fausse.
    expect(Number(ligne?.getAttribute('y1'))).toBeCloseTo(160, 6);
    expect(Number(ligne?.getAttribute('y2'))).toBeCloseTo(160, 6);

    const toutPositif = render(withIntl(<BarChart
        data={{ labels: ['A', 'B'], series: [{ name: 'Revenus', values: [0, 1000] }] }}
      />));
    expect(toutPositif.container.querySelector('[data-testid="bar-zero-line"]')).toBeNull();
  });

  it('gradue l’axe sur le domaine RÉELLEMENT tracé, bornes négatives comprises', () => {
    const { container } = render(withIntl(<BarChart
        data={{ labels: ['A', 'B'], series: [{ name: 'Solde', values: [-500, 1000] }] }}
      />, 'en'));
    // Avant TCK-405, `min` était figé à 0 : l'axe rendait ['0', '500', '1,000'] au-dessus d'une
    // barre négative invisible — il décrivait un domaine que le graphique ne traçait pas.
    expect(etiquettesAxe(container)).toEqual(['-500', '250', '1,000']);
  });

  it('⚠ série ENTIÈREMENT négative : elle se trace, et l’axe la nomme', () => {
    const { container } = render(withIntl(<BarChart
        data={{ labels: ['A', 'B'], series: [{ name: 'Solde', values: [-500, -300] }] }}
      />, 'en'));

    // Avant : ['0'] pour tout axe, et deux barres à hauteur zéro.
    expect(etiquettesAxe(container)).toEqual(['-500', '-250', '0']);
    for (const b of barres(container)) expect(b.hauteur).toBeGreaterThan(0);
    // Zéro reste la ligne de base : elle est ici en HAUT du cadre, le domaine ne montant pas
    // au-dessus. C'est la contrainte « zéro reste la ligne de base » rendue visible.
    const ligne = container.querySelector('[data-testid="bar-zero-line"]');
    expect(Number(ligne?.getAttribute('y1'))).toBeCloseTo(CADRE.haut, 6);
  });

  it('`LineChart`, lui, ouvrait DÉJÀ son domaine aux négatifs — il n’a pas été touché', () => {
    const { container } = render(withIntl(<LineChart
        data={{ labels: ['A', 'B'], series: [{ name: 'Solde', values: [-500, 1000] }] }}
      />));
    const d = container.querySelector('path')?.getAttribute('d') ?? '';
    const y = [...d.matchAll(/[ML][\d.]+,([\d.]+)/g)].map((m) => Number(m[1]));
    expect(y).toHaveLength(2);
    for (const v of y) {
      expect(v).toBeGreaterThanOrEqual(CADRE.haut);
      expect(v).toBeLessThanOrEqual(CADRE.bas);
    }
  });
});
