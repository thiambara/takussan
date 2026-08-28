import { useLocale, useTranslations } from 'next-intl';

import { DEFAULT_LOCALE, isLocale } from '@/i18n/config';
import { formatNumber } from '@/lib/format';
import { pastilleLegende, remplissageSerie } from './palette';
import type { ChartData } from './types';

const PADDING = { top: 16, right: 16, bottom: 28, left: 40 };
const VIEW_W = 640;
const VIEW_H = 260;

type Props = {
  data: ChartData;
  title?: string;
  unit?: string;
  className?: string;
};

/**
 * Simple vertical bar chart (server-rendered). Pairs with `LineChart`.
 */
export function BarChart({ data, title, unit, className }: Props) {
  // Le hook se place AVANT la sortie anticipée (React Compiler, ADR-0015).
  const t = useTranslations('charts');
  // L'axe suit la locale ACTIVE, jamais une locale écrite dans le code (TCK-374). Le repli couvre
  // l'appelant dont la locale vient d'ailleurs — cookie trafiqué, paramètre d'URL.
  const brute = useLocale();
  const locale = isLocale(brute) ? brute : DEFAULT_LOCALE;
  const { labels, series } = data;
  if (labels.length === 0 || series.length === 0) {
    return (
      <div className={className} data-testid="chart-empty">
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      </div>
    );
  }

  const allValues = series.flatMap((s) => s.values);
  const max = Math.max(...allValues, 0);
  /**
   * ⚠ **`min` VALAIT `0`, figé, et une valeur négative disparaissait sans bruit (TCK-405).**
   *
   * La hauteur se calculait `((v - 0) / range) * innerH`, donc négative pour `v < 0`, puis
   * `Math.max(0, h)` la ramenait à zéro. Rendu de `values: [-500, 1000]` : la première barre
   * sortait avec `height="0"`. **Aucune erreur, aucun avertissement, aucun test rouge** — et un
   * `y` calculé SOUS la ligne de base, donc une barre qui serait sortie du cadre utile si sa
   * hauteur n'avait pas été avalée.
   *
   * ⚠ **Le correctif n'est PAS de copier `LineChart`.** Ancrer une échelle de barres à zéro est
   * CORRECT : une barre qui ne part pas de zéro ment sur les rapports de longueur, et c'est
   * précisément ce qu'un graphique en barres promet de ne pas faire. Le défaut n'était pas
   * l'ancrage, c'était qu'une valeur HORS du domaine soit avalée au lieu d'être dessinée sous la
   * ligne de base.
   *
   * D'où la forme retenue : le domaine s'ouvre vers le bas quand la série le demande, et **zéro
   * reste la ligne de base** — les deux `Math.max`/`Math.min` bornés par `0` le garantissent, et
   * c'est ce qui rend le comportement d'une série entièrement positive rigoureusement inchangé
   * (`min` y vaut `0`, comme la constante qu'il remplace).
   */
  const min = Math.min(...allValues, 0);
  // L'échelle des HAUTEURS ne peut pas diviser par zéro. Le plancher à 1 est là pour ça, et
  // pour ça seulement — il ne doit PAS remonter jusqu'aux étiquettes, cf. `graduations`.
  const range = Math.max(max - min, 1);

  const innerW = VIEW_W - PADDING.left - PADDING.right;
  const innerH = VIEW_H - PADDING.top - PADDING.bottom;

  const groupW = innerW / labels.length;
  const seriesCount = series.length;
  const barW = Math.max(4, (groupW * 0.7) / seriesCount);

  /**
   * Les graduations de l'axe des ordonnées.
   *
   * ────────────────────────────────────────────────────────────────────────────────────────────
   * ⚠ POURQUOI L'ÉTIQUETTE NE SE CALCULE PAS SUR `range` (revue de TCK-374, défaut D5)
   * ────────────────────────────────────────────────────────────────────────────────────────────
   *
   * `range` vaut `Math.max(max - min, 1)` : quand la série est PLATE, ce plancher invente un
   * maximum de 1 que rien n'atteint. Le cas n'a rien d'une limite — c'est **un mois de revenus à
   * zéro, l'état ordinaire d'une agence neuve**. L'axe rendait alors :
   *
   *     ['0', '1', '1']   ← deux étiquettes IDENTIQUES, et une échelle qui prétend monter à 1
   *                          au-dessus d'un graphique entièrement plat
   *
   * Les étiquettes se calculent donc sur l'étendue RÉELLE (`max - min`), pas sur le plancher. Et
   * quand cette étendue est nulle, l'axe ne porte plus qu'UNE graduation, sur la ligne de base :
   * il n'y a qu'une valeur à nommer, en annoncer trois serait la répéter.
   *
   * Le repli sur `formatNumber` reste `maximumFractionDigits: 0` — d'où le second filet : deux
   * graduations qui, une fois ARRONDIES, portent le même texte sont réduites à une. Une étendue
   * fractionnaire (une série de taux entre 0 et 1) reproduisait exactement le même défaut avec des
   * valeurs non nulles ; c'est le même défaut, pas un cas voisin.
   */
  const etendue = max - min;
  /**
   * L'ordonnée de la LIGNE DE BASE — au bas du cadre utile tant que la série est positive,
   * remontée dedans dès qu'une valeur négative ouvre le domaine.
   *
   * ⚠ Écrite ainsi, et non factorisée dans une fonction `y(valeur)` dont on prendrait la
   * différence : la première version du correctif faisait exactement cela, et une série
   * entièrement positive rendait alors `height="57.599999999999994"` là où elle rendait `"57.6"`
   * avant. Sept millionièmes de milliardième de pixel — invisible à l'œil, VISIBLE dans la
   * comparaison de non-régression de l'AC3, et c'est cette comparaison qui l'a trouvé. *Deux
   * expressions algébriquement égales ne le sont pas en flottant, et l'AC demandait « exactement
   * les mêmes coordonnées », pas « à peu près les mêmes ».*
   */
  const yZero = PADDING.top + innerH * (1 - (0 - min) / range);

  const gridLines = (etendue > 0 ? [0, 0.5, 1] : [0]).reduce<{ y: number; label: string }[]>(
    (acc, p) => {
      const y = PADDING.top + innerH * (1 - p);
      const label = formatNumber(min + etendue * p, locale, { maximumFractionDigits: 0 });
      if (acc.some((g) => g.label === label)) return acc;
      return [...acc, { y, label }];
    },
    [],
  );

  return (
    <figure className={className} data-testid="bar-chart">
      {title && <figcaption className="mb-2 text-sm font-semibold text-foreground">{title}</figcaption>}
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="h-full w-full"
        role="img"
        aria-label={title ?? t('barAria')}
      >
        {gridLines.map((g, i) => (
          <g key={i}>
            <line
              x1={PADDING.left}
              x2={VIEW_W - PADDING.right}
              y1={g.y}
              y2={g.y}
              className="stroke-border"
              strokeDasharray="2 3"
            />
            <text
              x={PADDING.left - 6}
              y={g.y + 4}
              className="fill-muted-foreground text-[10px]"
              textAnchor="end"
            >
              {g.label}
              {unit ? ` ${unit}` : ''}
            </text>
          </g>
        ))}
        {/*
          La LIGNE DE BASE, rendue seulement quand le domaine descend sous zéro.

          Elle n'est pas redondante avec la grille : les graduations tombent sur `min`, le milieu
          et `max`, et zéro n'est aucun des trois dès que la série mélange les signes (domaine
          −500…1000 : graduations à −500, 250, 1000). Sans elle, les barres négatives pendraient
          depuis une ligne que rien ne dessine. Trait PLEIN, là où la grille est pointillée : ce
          n'est pas une graduation, c'est l'origine.
        */}
        {min < 0 && (
          <line
            data-testid="bar-zero-line"
            x1={PADDING.left}
            x2={VIEW_W - PADDING.right}
            y1={yZero}
            y2={yZero}
            className="stroke-muted-foreground/50"
          />
        )}
        {labels.map((label, groupIdx) => {
          const groupX = PADDING.left + groupW * groupIdx;
          return (
            <g key={label + groupIdx}>
              {series.map((s, seriesIdx) => {
                const v = s.values[groupIdx] ?? 0;
                const x = groupX + (groupW - barW * seriesCount) / 2 + barW * seriesIdx;
                // La barre va TOUJOURS de la ligne de base à la valeur : sa longueur ne dépend
                // donc que de `|v|`, jamais de `min`. C'est ce qui rend le cas positif identique
                // BIT À BIT à l'ancien calcul — pour `v >= 0`, `Math.abs(v)` et `v - 0` sont le
                // même flottant — et ce qui fait descendre la barre négative au lieu de l'avaler.
                // Le `Math.max(0, …)` qui bornait la hauteur ici n'était pas une garde : c'était
                // l'endroit exact où la donnée négative était perdue.
                const h = (Math.abs(v) / range) * innerH;
                const y = v >= 0 ? yZero - h : yZero;
                return (
                  <rect
                    key={s.name + groupIdx}
                    x={x}
                    y={y}
                    width={barW}
                    height={h}
                    className={s.color ?? remplissageSerie(seriesIdx)}
                    rx={2}
                  />
                );
              })}
              {labels.length <= 12 && (
                <text
                  x={groupX + groupW / 2}
                  y={VIEW_H - 8}
                  className="fill-muted-foreground text-[10px]"
                  textAnchor="middle"
                >
                  {label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <ul className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
        {series.map((s, idx) => (
          <li key={s.name} className="flex items-center gap-1.5">
            <span className={`inline-block h-2 w-2 rounded-full ${pastilleLegende(idx)}`} aria-hidden />
            <span>{s.name}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
