import type { CSSProperties } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { DEFAULT_LOCALE, isLocale, type Locale } from '@/i18n/config';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { pastilleSerie, remplissageSerie } from './palette';
import { pourcent } from './repere';
import type { ChartData } from './types';

const PADDING = { top: 16, right: 16, bottom: 28, left: 40 };
const VIEW_W = 640;
const VIEW_H = 260;
/**
 * Le REPÈRE DE TRACÉ — le cadre utile de l'ancien `viewBox` 640 × 260, et lui seul.
 *
 * ⚠ **Les étiquettes ne vivent plus dans le SVG (TCK-532).** Le SVG est mis à l'échelle de son
 * conteneur : une étiquette de 12 unités de `viewBox` rendait **5,7 px à 390 px** et **8,8 px à
 * 1366 px** (revue design 2026-09-16), sous le plancher de 12 px de la charte — et l'agrandir en
 * unités ne corrige rien, la taille reste proportionnelle à l'échelle. Les étiquettes sont donc du
 * HTML en `text-xs` autour du tracé, placées en POURCENTAGES du cadre ; seul le tracé reste en SVG,
 * étiré (`preserveAspectRatio="none"`) sur la cellule que la grille lui donne.
 *
 * Pourquoi cette forme et pas un SVG dimensionné en pixels mesurés (`ResizeObserver`) : ce
 * composant est rendu CÔTÉ SERVEUR. Une mesure n'existe qu'après hydratation — il faudrait
 * `'use client'`, et le premier rendu serait soit faux (étiquettes à l'échelle d'avant la mesure),
 * soit vide. Des pourcentages sont justes dès le HTML du serveur, sans JavaScript.
 *
 * Le `viewBox` recadre sur `(PADDING.left, PADDING.top, innerW, innerH)` plutôt que de repartir de
 * 0 : les barres gardent EXACTEMENT les coordonnées du relevé de l'AC3 de TCK-405, qui reste donc
 * une non-régression au chiffre près. La marge gauche n'est plus une estimation en « largeur de
 * caractère » (elle rognait « 1 030 342 F ») : c'est la vraie largeur de la colonne d'étiquettes,
 * que la grille CSS calcule sur le texte rendu.
 */
const TRACE = {
  x: PADDING.left,
  y: PADDING.top,
  largeur: VIEW_W - PADDING.left - PADDING.right,
  hauteur: VIEW_H - PADDING.top - PADDING.bottom,
};

/**
 * La hauteur de la figure quand l'appelant n'en donne pas. Le SVG suivait le ratio 640/260 de sa
 * largeur ; étiré sur sa cellule (TCK-532), il n'a plus de hauteur propre, et le plancher
 * `min-h-40` seul rendait un tracé de 132 px sur 939 de large à 1366 px (mesuré 2026-09-16).
 */
const HAUTEUR_PAR_DEFAUT = 'h-64 lg:h-80';

type Props = {
  data: ChartData;
  title?: string;
  unit?: string;
  className?: string;
  /**
   * `'horizontal'` : une ligne par étiquette, le libellé EN ENTIER à gauche, la barre à droite.
   * Pour des catégories à libellés longs (étapes du pipeline) — cf. `BarresHorizontales`.
   */
  orientation?: 'vertical' | 'horizontal';
};

/**
 * Simple vertical bar chart (server-rendered). Pairs with `LineChart`.
 */
export function BarChart({ data, title, unit, className, orientation = 'vertical' }: Props) {
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

  const innerH = TRACE.hauteur;

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

  if (orientation === 'horizontal') {
    return (
      <BarresHorizontales
        data={data}
        title={title}
        unit={unit}
        className={className}
        aria={title ?? t('barAria')}
        graduations={graduations(min, etendue, locale)}
        min={min}
        range={range}
      />
    );
  }

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

  const gridLines = graduations(min, etendue, locale).map((g) => ({
    y: PADDING.top + innerH * (1 - g.p),
    label: g.label,
  }));

  const left = TRACE.x;
  const innerW = TRACE.largeur;
  const groupW = innerW / labels.length;
  const seriesCount = series.length;
  const barW = Math.max(4, (groupW * 0.7) / seriesCount);
  // Au-delà de six mois, un cadre étroit (< 36rem) n'affiche qu'une abscisse sur deux : douze
  // « sept. » en `text-xs` ne tiennent pas dans les ~200 px d'un téléphone à 360 px.
  const eclaircir = labels.length > 6;

  return (
    <figure className={cn('flex flex-col', className ?? HAUTEUR_PAR_DEFAUT)} data-testid="bar-chart">
      {title && <figcaption className="mb-2 text-sm font-semibold text-foreground">{title}</figcaption>}
      <div className="grid min-h-40 flex-1 grid-cols-[auto_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_auto] gap-x-2 gap-y-1 pt-2">
        {/*
          L'axe des ordonnées : toutes les étiquettes dans la MÊME cellule, empilées. La colonne
          prend donc la largeur de la plus longue, et `top` en pourcentage se résout sur la
          hauteur de la cellule — celle du tracé, puisque les deux partagent la ligne.
        */}
        <div className="col-start-1 row-start-1 grid" aria-hidden>
          {gridLines.map((g, i) => (
            <span
              key={i}
              data-chart-axis="y"
              className="relative col-start-1 row-start-1 -translate-y-1/2 self-start justify-self-end whitespace-nowrap text-xs leading-4 tabular-nums text-muted-foreground"
              style={{ top: pourcent((g.y - TRACE.y) / TRACE.hauteur) }}
            >
              {g.label}
              {unit ? ` ${unit}` : ''}
            </span>
          ))}
        </div>
        <div className="relative col-start-2 row-start-1">
          {gridLines.map((g, i) => (
            <div
              key={i}
              aria-hidden
              className="absolute inset-x-0 border-t border-dashed border-border"
              style={{ top: pourcent((g.y - TRACE.y) / TRACE.hauteur) }}
            />
          ))}
          <svg
            viewBox={`${TRACE.x} ${TRACE.y} ${TRACE.largeur} ${TRACE.hauteur}`}
            preserveAspectRatio="none"
            className="absolute inset-0 size-full overflow-visible"
            role="img"
            aria-label={title ?? t('barAria')}
          >
            {/*
              La LIGNE DE BASE, rendue seulement quand le domaine descend sous zéro.

              Elle n'est pas redondante avec la grille : les graduations tombent sur `min`, le milieu
              et `max`, et zéro n'est aucun des trois dès que la série mélange les signes (domaine
              −500…1000 : graduations à −500, 250, 1000). Sans elle, les barres négatives pendraient
              depuis une ligne que rien ne dessine. Trait PLEIN, là où la grille est pointillée : ce
              n'est pas une graduation, c'est l'origine. `non-scaling-stroke` : le SVG est étiré, le
              trait ne doit pas l'être.
            */}
            {min < 0 && (
              <line
                data-testid="bar-zero-line"
                x1={left}
                x2={VIEW_W - PADDING.right}
                y1={yZero}
                y2={yZero}
                className="stroke-muted-foreground/50"
                vectorEffect="non-scaling-stroke"
              />
            )}
            {labels.map((label, groupIdx) => {
              const groupX = left + groupW * groupIdx;
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
                </g>
              );
            })}
          </svg>
        </div>
        {labels.length <= 12 && (
          <div className="@container relative col-start-2 row-start-2 h-4" aria-hidden>
            {labels.map((label, groupIdx) => (
              <span
                key={label + groupIdx}
                data-chart-axis="x"
                className={cn(
                  'absolute top-0 max-w-(--pas) -translate-x-1/2 truncate text-center text-xs leading-4 text-muted-foreground',
                  eclaircir && groupIdx % 2 === 1 && '@max-[36rem]:hidden',
                  eclaircir && '@max-[36rem]:max-w-[calc(var(--pas)*2)]',
                )}
                style={
                  {
                    left: pourcent((groupIdx + 0.5) / labels.length),
                    '--pas': pourcent(1 / labels.length),
                  } as CSSProperties
                }
                title={label}
              >
                {label}
              </span>
            ))}
          </div>
        )}
      </div>
      <ul className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
        {series.map((s, idx) => (
          <li key={s.name} className="flex items-center gap-1.5">
            <span className={`inline-block h-2 w-2 rounded-full ${pastilleSerie(s.color, idx)}`} aria-hidden />
            <span>{s.name}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

/**
 * Les graduations de l'axe des valeurs, en fraction `p` du domaine (0 = `min`, 1 = `max`) — le
 * raisonnement (étendue réelle, doublons après arrondi) est dans le corps de `BarChart`.
 */
function graduations(min: number, etendue: number, locale: Locale): { p: number; label: string }[] {
  return (etendue > 0 ? [0, 0.5, 1] : [0]).reduce<{ p: number; label: string }[]>((acc, p) => {
    const label = formatNumber(min + etendue * p, locale, { maximumFractionDigits: 0 });
    if (acc.some((g) => g.label === label)) return acc;
    return [...acc, { p, label }];
  }, []);
}

type PropsHorizontales = Omit<Props, 'orientation'> & {
  aria: string;
  graduations: { p: number; label: string }[];
  min: number;
  range: number;
};

/**
 * Les barres HORIZONTALES — la réponse à la troncature des libellés (vérification adverse de
 * TCK-532, 2026-09-16).
 *
 * En colonnes, un libellé n'a que la largeur d'un groupe : ~36 px par étape à 320 px. Les étapes du
 * pipeline de `/app/overview/agent` y sortaient tronquées — en wolof, les 6 à 320 px, 5 sur 6
 * jusqu'à 414 px, 2 encore à 768 px (`Yu ñu jëfandikoo`) — et le libellé complet ne vivait que
 * dans un `title`, invisible au toucher. Un retour à la ligne n'y suffit pas : le mot
 * `jëfandikoo` seul (~62 px) est plus large que la colonne.
 *
 * Couchées, les barres donnent au libellé une LIGNE entière. La colonne des libellés est en
 * `fit-content(40%)` : sa largeur est celle du plus long libellé tant qu'il tient dans 40 % de la
 * figure, sinon 40 %, et jamais moins que son plus long MOT (`min-content`) — un libellé revient
 * donc à la ligne entre deux mots, jamais au milieu d'un mot. `break-words` ne sert qu'au cas
 * pathologique d'un mot plus large que la figure.
 *
 * Tout est en HTML, sans SVG : les longueurs sont des pourcentages de la piste, donc justes dès le
 * HTML du serveur, et aucun trait ni arrondi ne s'étire.
 */
function BarresHorizontales({ data, title, unit, className, aria, graduations: graduationsValeur, min, range }: PropsHorizontales) {
  const { labels, series } = data;
  // Les lignes explicites : la grille et la ligne de base couvrent toutes les catégories.
  const lignes = { gridTemplateRows: `repeat(${labels.length}, auto) auto` };
  const toutesLesLignes = { gridRow: `1 / ${labels.length + 1}` };
  const position = (p: number) => pourcent(p);
  const zero = (0 - min) / range;

  return (
    <figure className={cn('flex flex-col', className)} data-testid="bar-chart" data-orientation="horizontal">
      {title && <figcaption className="mb-2 text-sm font-semibold text-foreground">{title}</figcaption>}
      <div
        role="img"
        aria-label={aria}
        className="grid grid-cols-[fit-content(40%)_minmax(0,1fr)] gap-x-3 gap-y-2 pt-2"
        style={lignes}
      >
        <div className="relative col-start-2 row-start-1" style={toutesLesLignes} aria-hidden>
          {graduationsValeur.map((g) => (
            <div
              key={g.p}
              className="absolute inset-y-0 border-l border-dashed border-border"
              style={{ left: position(g.p) }}
            />
          ))}
          {min < 0 && (
            <div
              data-testid="bar-zero-line"
              className="absolute inset-y-0 border-l border-muted-foreground/50"
              style={{ left: position(zero) }}
            />
          )}
        </div>
        {labels.map((label, groupIdx) => (
          <div key={label + groupIdx} className="contents" aria-hidden>
            <span
              data-chart-axis="y"
              className="col-start-1 self-center text-right text-xs leading-4 break-words text-muted-foreground"
              style={{ gridRow: groupIdx + 1 }}
            >
              {label}
            </span>
            <div className="relative col-start-2 flex flex-col justify-center gap-0.5 py-0.5" style={{ gridRow: groupIdx + 1 }}>
              {series.map((s, seriesIdx) => {
                const v = s.values[groupIdx] ?? 0;
                return (
                  <div key={s.name + groupIdx} className="relative h-3">
                    <div
                      data-chart-bar
                      className={cn('absolute inset-y-0 rounded-sm', pastilleSerie(s.color, seriesIdx))}
                      style={{
                        left: position((Math.min(v, 0) - min) / range),
                        width: position(Math.abs(v) / range),
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <div className="@container relative col-start-2 h-4" style={{ gridRow: labels.length + 1 }} aria-hidden>
          {graduationsValeur.map((g, rang) => (
            <span
              key={g.p}
              data-chart-axis="x"
              className={cn(
                'absolute top-0 whitespace-nowrap text-xs leading-4 tabular-nums text-muted-foreground',
                g.p === 0 ? '' : g.p === 1 ? '-translate-x-full' : '-translate-x-1/2',
                rang > 0 && g.p < 1 && '@max-[12rem]:hidden',
              )}
              style={{ left: position(g.p) }}
            >
              {g.label}
              {unit ? ` ${unit}` : ''}
            </span>
          ))}
        </div>
      </div>
      <ul className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
        {series.map((s, idx) => (
          <li key={s.name} className="flex items-center gap-1.5">
            <span className={`inline-block h-2 w-2 rounded-full ${pastilleSerie(s.color, idx)}`} aria-hidden />
            <span>{s.name}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
