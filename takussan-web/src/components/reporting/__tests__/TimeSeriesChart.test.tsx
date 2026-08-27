import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import { TimeSeriesChart } from '../TimeSeriesChart';

function serie(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    bucket: `2026-${String(i + 1).padStart(2, '0')}`,
    value: (i + 1) * 10,
  }));
}

/** Bornes du cadre de tracé — `PADDING.top` et `PADDING.top + INNER_H` de `TimeSeriesChart`. */
const HAUT = 16;
const BAS = 246;

/** Les ordonnées d'un chemin `M…,… L…,…` — ce qu'un `clipPath` efface sans rien dire. */
function ordonnees(d: string): number[] {
  return [...d.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map((m) => Number(m[2]));
}

/** Un libellé d'axe en nombre, quelle que soit la locale (espace fine, virgule, signe moins Unicode). */
function nombreDeLEtiquette(texte: string): number {
  return Number(texte.replace(/\u2212/g, '-').replace(/[\s\u00a0\u202f]/g, '').replace(',', '.'));
}

function rendre(props: Partial<Parameters<typeof TimeSeriesChart>[0]> = {}) {
  return render(
    withIntl(
      <TimeSeriesChart
        points={serie(12)}
        seriesLabel="Agences"
        description="Évolution mensuelle des agences."
        {...props}
      />,
    ),
  );
}

describe('<TimeSeriesChart> (TCK-361)', () => {
  /**
   * AC3 — l'ancien rendu ne DISAIT pas qu'il n'avait rien : la zone se rendait vide, ce qui est
   * indistinguable d'un graphique qui n'a pas fini de charger.
   */
  it('rend un état vide EXPLICITE sur zéro point, et aucun graphique', () => {
    rendre({ points: [] });

    expect(screen.getByTestId('timeseries-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('timeseries-chart')).toBeNull();
  });

  /**
   * AC1 — vérifié à 3 points ET à 12 points, parce que c'est entre les deux que l'axe des
   * abscisses cassait : le rendu précédent écrivait une étiquette par barre, donc douze libellés
   * `2026-01` empilés sur la largeur d'une carte.
   */
  it.each([1, 3, 12])('gradue les deux axes à %i point(s)', (n) => {
    rendre({ points: serie(n) });

    const svg = screen.getByRole('img', { name: 'Évolution mensuelle des agences.' });

    // Axe des ordonnées : 5 graduations (0 → max), toutes porteuses d'une VALEUR.
    const graduations = Array.from(svg.querySelectorAll('text')).map((t) => t.textContent);
    expect(graduations).toContain('0');
    expect(graduations.filter((g) => /^[\d  ,.]+$/.test(g ?? '')).length).toBeGreaterThanOrEqual(5);

    // Axe des abscisses : au moins une étiquette, jamais plus de 7 — lisible dans les deux cas.
    const etiquettes = graduations.filter((g) => /^2026-\d{2}$/.test(g ?? ''));
    expect(etiquettes.length).toBeGreaterThanOrEqual(1);
    expect(etiquettes.length).toBeLessThanOrEqual(7);
  });

  /** Un point unique ne doit pas diviser par zéro — il se centre. */
  it('rend un point unique sans NaN dans la géométrie', () => {
    rendre({ points: serie(1) });

    const svg = screen.getByTestId('timeseries-chart').querySelector('svg')!;
    expect(svg.innerHTML).not.toContain('NaN');
  });

  /**
   * AC2 — l'infobulle est atteignable AU CLAVIER. L'attribut `title` qu'elle remplace ne l'était
   * pour aucun clavier, et ce test échouerait mot pour mot si on y revenait.
   */
  it("ouvre l'infobulle au FOCUS clavier, pas seulement au survol", async () => {
    const user = userEvent.setup();
    rendre({ points: serie(3) });

    expect(screen.queryByRole('tooltip')).toBeNull();

    await user.tab();

    const infobulle = screen.getByRole('tooltip');
    expect(infobulle).toBeInTheDocument();
    expect(within(infobulle).getByText('2026-01')).toBeInTheDocument();
  });

  it("ouvre l'infobulle au survol", async () => {
    const user = userEvent.setup();
    rendre({ points: serie(3) });

    await user.hover(screen.getAllByRole('button')[1]);

    expect(within(screen.getByRole('tooltip')).getByText('2026-02')).toBeInTheDocument();
  });

  /** Chaque point porte sa valeur en `aria-label` : un lecteur d'écran ne rencontre pas un bloc muet. */
  it('expose chaque point à la technologie d’assistance', () => {
    rendre({ points: serie(3) });

    const points = screen.getAllByRole('button');
    expect(points).toHaveLength(3);
    expect(points[0]).toHaveAttribute('aria-label', '2026-01 : 10');
    expect(points[0]).toHaveAttribute('tabindex', '0');
  });

  /**
   * AC4 — la comparaison existe ET se distingue : pointillé, trait plus fin, jeton NEUTRE
   * (`--chart-4`) contre la couleur d'accent de la série principale. Deux séries de même poids
   * visuel ne se comparent pas.
   */
  it('rend la comparaison en série SUBORDONNÉE, distincte de la principale', () => {
    rendre({
      points: serie(3),
      comparison: { label: 'Période précédente', points: serie(3) },
    });

    const principale = screen.getByTestId('serie-principale');
    const comparaison = screen.getByTestId('serie-comparaison');

    expect(comparaison).toBeInTheDocument();
    expect(comparaison).toHaveAttribute('stroke-dasharray');
    expect(principale).not.toHaveAttribute('stroke-dasharray');
    expect(principale.getAttribute('class')).toContain('stroke-chart-1');
    expect(comparaison.getAttribute('class')).toContain('stroke-chart-4');
    expect(Number(comparaison.getAttribute('stroke-width')))
      .toBeLessThan(Number(principale.getAttribute('stroke-width')));

    expect(screen.getByText('Période précédente')).toBeInTheDocument();
  });

  it("n'affiche aucune comparaison quand elle est absente", () => {
    rendre({ points: serie(3), comparison: null });

    expect(screen.queryByTestId('serie-comparaison')).toBeNull();
  });

  /**
   * D7 — **l'échelle a un domaine NÉGATIF.**
   *
   * `Math.max(0, ...valeurs)` faisait retomber une série entièrement négative sur un plafond de 1 :
   * l'axe se graduait 0 / 0,25 / … / 1 pendant que le tracé partait à `y = 7146` dans un cadre de
   * 280, où le `clipPath` l'effaçait. Aucun `NaN`, aucune erreur — un graphique vide sous un axe qui
   * ment, ce qu'aucune assertion « pas de NaN » n'attrape.
   *
   * Le contrôle porte donc sur la GÉOMÉTRIE, pas sur les libellés : un axe faux peut se graduer
   * proprement, un tracé hors cadre ne peut pas se cacher.
   */
  it.each([
    ['entièrement négative', [-30, -10]],
    ['mixte', [-30, 60]],
  ])('garde une série %s DANS le cadre', (_libelle, valeurs) => {
    rendre({ points: valeurs.map((value, i) => ({ bucket: `2026-0${i + 1}`, value })) });

    const y = ordonnees(screen.getByTestId('serie-principale').getAttribute('d')!);

    expect(y).toHaveLength(valeurs.length);
    for (const valeur of y) {
      expect(valeur).toBeGreaterThanOrEqual(HAUT);
      expect(valeur).toBeLessThanOrEqual(BAS);
    }
    // Les deux points restent DISTINCTS : un domaine effondré les empilerait sur la même ligne.
    expect(new Set(y).size).toBe(valeurs.length);

    // …et l'axe le DIT : au moins une graduation porte une valeur négative.
    const svg = screen.getByTestId('timeseries-chart').querySelector('svg')!;
    const nombres = Array.from(svg.querySelectorAll('text'))
      .map((t) => nombreDeLEtiquette(t.textContent ?? ''))
      .filter((n) => !Number.isNaN(n));
    expect(nombres.some((n) => n < 0)).toBe(true);
  });

  /**
   * D9 — une comparaison PLUS COURTE que la série principale n'est pas rendue du tout.
   *
   * Elle l'était : `chemin()` la tronquait à la longueur de la principale, ce qui donnait
   * `d="M56.0,223.0"` — un `MoveTo` seul, qui ne trace rien — pendant que le nœud
   * `serie-comparaison` restait présent. L'AC4 se cochait alors sur une comparaison INVISIBLE.
   */
  it('ne rend aucune comparaison plus courte que la série principale', () => {
    rendre({
      points: serie(3),
      comparison: { label: 'Période précédente', points: serie(1) },
    });

    expect(screen.queryByTestId('serie-comparaison')).toBeNull();
    // Et sa légende disparaît avec elle : une entrée de légende sans tracé est un mensonge.
    expect(screen.queryByText('Période précédente')).toBeNull();
  });

  /** À un point unique, la comparaison se rend en POINT — `M x,y` seul ne tracerait rien. */
  it('rend la comparaison d’un point unique comme un point visible', () => {
    rendre({
      points: serie(1),
      comparison: { label: 'Période précédente', points: [{ bucket: '2025-12', value: 4 }] },
    });

    const comparaison = screen.getByTestId('serie-comparaison');
    expect(comparaison.tagName.toLowerCase()).toBe('circle');
    expect(Number(comparaison.getAttribute('r'))).toBeGreaterThan(0);
  });

  /** Une série entièrement nulle ne doit pas rendre un axe de `NaN` (division par `max = 0`). */
  it('gradue une série entièrement nulle', () => {
    rendre({ points: [{ bucket: '2026-01', value: 0 }, { bucket: '2026-02', value: 0 }] });

    const svg = screen.getByTestId('timeseries-chart').querySelector('svg')!;
    expect(svg.innerHTML).not.toContain('NaN');
  });
});
