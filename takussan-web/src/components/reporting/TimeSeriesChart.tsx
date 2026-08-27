'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

/**
 * Graphique temporel commun de la console super-admin (TCK-361).
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * CE QU'IL REMPLACE — et pourquoi un `<div>` à hauteur en pourcentage n'était pas un graphique
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Le rendu précédent empilait des `<div>` dont la hauteur valait `count / max`. Trois choses en
 * découlaient, toutes invisibles depuis le code :
 *
 *   1. **Aucune échelle.** Sans axe des ordonnées, `max` est toujours en haut : une série plate à
 *      3 et une série plate à 30 000 se ressemblent au pixel près. On ne lisait pas une valeur,
 *      on lisait un rang.
 *   2. **L'infobulle était un attribut `title`.** Il n'est ni stylable, ni atteignable au clavier,
 *      ni affiché sur mobile — c'est-à-dire qu'il n'existait pour personne d'autre qu'une souris
 *      posée deux secondes. Ici l'infobulle suit le SURVOL **et le FOCUS**, et le point porte son
 *      propre `aria-label` : la valeur reste atteignable sans voir le graphique du tout.
 *   3. **Zéro point rendait une zone vide**, indistinguable d'un graphique qui n'a pas fini de
 *      charger. L'état vide est désormais explicite.
 *
 * Aucune dépendance de dataviz n'est ajoutée : SVG nu, dans la lignée de `components/charts/`
 * (TCK-032). La page est réservée au super-admin — y faire entrer une bibliothèque de 40 Ko
 * gzippés pour deux séries se paierait sur un chargement rare.
 *
 * ⚠ Les couleurs sortent des jetons `--chart-*` (`stroke-chart-1`, …) et de nulle part ailleurs.
 * La série de COMPARAISON est délibérément subordonnée — trait fin, pointillé, jeton neutre — car
 * deux séries de même poids visuel ne se comparent pas, elles se concurrencent.
 */

const VIEW_W = 720;
const VIEW_H = 280;
const PADDING = { top: 16, right: 16, bottom: 34, left: 56 };
const INNER_W = VIEW_W - PADDING.left - PADDING.right;
const INNER_H = VIEW_H - PADDING.top - PADDING.bottom;

/** Nombre maximal d'étiquettes d'abscisse. Au-delà, une sur N — lisible à 12 points comme à 3. */
const MAX_X_LABELS = 6;
const Y_TICKS = 4;

export type SeriePoint = { bucket: string; value: number };

type Props = {
  points: SeriePoint[];
  /** Série secondaire, alignée par INDEX sur la principale (les libellés diffèrent par nature). */
  comparison?: { label: string; points: SeriePoint[] } | null;
  seriesLabel: string;
  /** Description accessible du graphique — lue par `role="img"`. Jamais un bloc muet. */
  description: string;
  /** Légende visible sous le graphique. */
  caption?: string;
  formatValue?: (value: number) => string;
  className?: string;
};

export function TimeSeriesChart({
  points,
  comparison = null,
  seriesLabel,
  description,
  caption,
  formatValue,
  className,
}: Props) {
  // Les hooks se placent AVANT toute sortie anticipée (React Compiler, ADR-0015).
  const t = useTranslations('reporting.chart');
  const [actif, setActif] = useState<number | null>(null);
  const clipId = useId();

  const format = formatValue ?? ((value: number) => value.toLocaleString('fr-FR'));

  if (points.length === 0) {
    return (
      <div
        data-testid="timeseries-empty"
        role="status"
        className={cn(
          'flex h-72 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border/70 bg-muted/20 p-6 text-center',
          className,
        )}
      >
        <p className="text-sm font-medium text-foreground">{t('empty')}</p>
        <p className="text-xs text-muted-foreground">{t('emptyHint')}</p>
      </div>
    );
  }

  /**
   * D9 — une comparaison PLUS COURTE que la série principale est traitée comme ABSENTE.
   *
   * `chemin()` la tronque à la longueur de la principale : trois points contre un rendaient
   * `d="M56.0,223.0"`, un `MoveTo` seul, qui ne trace rien — pendant que le nœud
   * `data-testid="serie-comparaison"` restait présent. L'AC4 se cochait donc sur une comparaison
   * invisible. Et elle serait de toute façon désalignée : l'alignement des deux séries est
   * positionnel, deux longueurs différentes le décalent d'un cran, en silence.
   */
  const comparaison = comparison && comparison.points.length >= points.length ? comparison : null;
  const echelle = echelleDomaine([
    ...points.map((p) => p.value),
    ...(comparaison?.points.map((p) => p.value) ?? []),
  ]);
  const etendue = echelle.max - echelle.min;

  // Un point unique n'a pas d'intervalle : on le centre au lieu de diviser par zéro.
  const solo = points.length === 1;
  const xPour = (index: number) =>
    solo ? PADDING.left + INNER_W / 2 : PADDING.left + (INNER_W / (points.length - 1)) * index;
  const yPour = (value: number) =>
    PADDING.top + INNER_H - ((value - echelle.min) / etendue) * INNER_H;

  /**
   * Ligne de base de l'aire : le ZÉRO, ramené dans le domaine quand il en sort. Le bas du cadre
   * n'est le zéro que sur une série entièrement positive — sur une série qui descend sous zéro,
   * remplir jusqu'au bas du cadre remplirait la partie négative à l'envers.
   */
  const yBase = yPour(Math.min(Math.max(0, echelle.min), echelle.max));

  const chemin = (serie: SeriePoint[]) =>
    serie
      .slice(0, points.length)
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${xPour(i).toFixed(1)},${yPour(p.value).toFixed(1)}`)
      .join(' ');

  const aire = solo
    ? ''
    : `${chemin(points)} L${xPour(points.length - 1).toFixed(1)},${yBase.toFixed(1)} L${xPour(0).toFixed(1)},${yBase.toFixed(1)} Z`;

  const graduations = Array.from({ length: Y_TICKS + 1 }, (_, i) => {
    const valeur = echelle.min + (etendue / Y_TICKS) * i;
    return { valeur, y: yPour(valeur) };
  });

  const pasEtiquettes = Math.ceil(points.length / MAX_X_LABELS);
  const pointActif = actif === null ? null : points[actif];
  const comparaisonActive = actif === null ? null : comparaison?.points[actif] ?? null;

  return (
    <figure className={cn('space-y-2', className)} data-testid="timeseries-chart">
      <div className="relative">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="h-72 w-full"
          role="img"
          aria-label={description}
        >
          <defs>
            <clipPath id={clipId}>
              <rect x={PADDING.left} y={PADDING.top} width={INNER_W} height={INNER_H} />
            </clipPath>
          </defs>

          {/* Grille + AXE DES ORDONNÉES gradué — ce que le rendu en pourcentage n'avait pas. */}
          {graduations.map((g) => (
            <g key={g.valeur}>
              <line
                x1={PADDING.left}
                x2={VIEW_W - PADDING.right}
                y1={g.y}
                y2={g.y}
                className="stroke-border/70"
                strokeDasharray={g.valeur === 0 ? undefined : '2 4'}
              />
              <text
                x={PADDING.left - 8}
                y={g.y + 3.5}
                textAnchor="end"
                className="fill-muted-foreground text-[10px] tabular-nums"
              >
                {format(g.valeur)}
              </text>
            </g>
          ))}

          {/* Axe des abscisses */}
          <line
            x1={PADDING.left}
            x2={VIEW_W - PADDING.right}
            y1={PADDING.top + INNER_H}
            y2={PADDING.top + INNER_H}
            className="stroke-border"
          />
          {points.map((p, i) => {
            if (i % pasEtiquettes !== 0 && i !== points.length - 1) return null;
            return (
              <text
                key={`x-${p.bucket}-${i}`}
                x={xPour(i)}
                y={VIEW_H - 12}
                textAnchor="middle"
                className="fill-muted-foreground text-[10px] tabular-nums"
              >
                {p.bucket}
              </text>
            );
          })}

          <g clipPath={`url(#${clipId})`}>
            {/* Comparaison D'ABORD, donc sous la série principale : elle ne doit jamais dominer. */}
            {comparaison && (solo ? (
              // Un point unique n'a pas de chemin : `M x,y` seul ne trace rien. La comparaison se
              // rend alors par le seul objet qui ait un sens à un point — un point.
              <circle
                cx={xPour(0)}
                cy={yPour(comparaison.points[0].value)}
                r={3.5}
                className="fill-chart-4"
                data-testid="serie-comparaison"
              />
            ) : (
              <path
                d={chemin(comparaison.points)}
                fill="none"
                strokeWidth={1.5}
                strokeDasharray="5 4"
                className="stroke-chart-4"
                data-testid="serie-comparaison"
              />
            ))}
            {!solo && <path d={aire} className="fill-chart-1/10" stroke="none" />}
            <path
              d={chemin(points)}
              fill="none"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="stroke-chart-1"
              data-testid="serie-principale"
            />
            {points.map((p, i) => (
              <circle
                key={`pt-${p.bucket}-${i}`}
                cx={xPour(i)}
                cy={yPour(p.value)}
                r={actif === i ? 4.5 : solo ? 4 : 2.5}
                className="fill-chart-1"
              />
            ))}
          </g>

          {/*
            Zones de saisie du survol ET DU FOCUS. Ce sont elles qui remplacent l'attribut `title` :
            un `tabIndex` sur chacune rend chaque valeur atteignable à la tabulation, ce qu'un
            `title` ne permet à aucun clavier.
          */}
          {points.map((p, i) => {
            const largeur = solo ? INNER_W : INNER_W / points.length;
            return (
              <rect
                key={`hit-${p.bucket}-${i}`}
                x={solo ? PADDING.left : xPour(i) - largeur / 2}
                y={PADDING.top}
                width={largeur}
                height={INNER_H}
                fill="transparent"
                tabIndex={0}
                role="button"
                aria-label={t('pointAria', { bucket: p.bucket, value: format(p.value) })}
                onMouseEnter={() => setActif(i)}
                onMouseLeave={() => setActif((courant) => (courant === i ? null : courant))}
                onFocus={() => setActif(i)}
                onBlur={() => setActif((courant) => (courant === i ? null : courant))}
                className="cursor-pointer outline-none focus-visible:stroke-ring focus-visible:[stroke-width:2]"
              />
            );
          })}
        </svg>

        {pointActif && (
          <div
            role="tooltip"
            data-testid="timeseries-tooltip"
            className="pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md"
          >
            <p className="font-medium text-foreground tabular-nums">{pointActif.bucket}</p>
            <p className="mt-1 flex items-center gap-1.5 text-muted-foreground">
              <span className="inline-block size-2 rounded-full bg-chart-1" aria-hidden="true" />
              {seriesLabel}
              <span className="font-semibold text-foreground tabular-nums">{format(pointActif.value)}</span>
            </p>
            {comparaison && comparaisonActive && (
              <p className="mt-0.5 flex items-center gap-1.5 text-muted-foreground">
                <span className="inline-block size-2 rounded-full bg-chart-4" aria-hidden="true" />
                {comparaison.label}
                <span className="font-medium text-foreground tabular-nums">{format(comparaisonActive.value)}</span>
                <span className="tabular-nums">({comparaisonActive.bucket})</span>
              </p>
            )}
          </div>
        )}
      </div>

      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded-full bg-chart-1" aria-hidden="true" />
          {seriesLabel}
        </span>
        {comparaison && (
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-0 w-4 border-t-2 border-dashed border-chart-4"
              aria-hidden="true"
            />
            {comparaison.label}
          </span>
        )}
        {caption && <span className="ml-auto">{caption}</span>}
      </figcaption>
    </figure>
  );
}

/**
 * DOMAINE de l'axe des ordonnées — bornes « rondes » de part et d'autre de zéro.
 *
 * ⚠ Il remplace un `niceMax` qui pliait tout à `Math.max(0, ...valeurs)` : une série entièrement
 * NÉGATIVE y retombait sur un plafond de 1, et l'axe se graduait 0 / 0,25 / 0,5 / 0,75 / 1 pendant
 * que le tracé partait vingt-cinq fois sous le cadre, où le `clipPath` l'effaçait. Aucun `NaN`,
 * aucune erreur : un graphique vide sous un axe qui ment. Aucune donnée d'aujourd'hui n'y descend
 * (des comptes, un MRR en `COALESCE(SUM(…), 0)`) — mais une variation nette, une marge ou un solde
 * y descendraient, et rien n'aurait prévenu.
 *
 * Zéro reste TOUJOURS dans le domaine : une série positive se lit depuis zéro, sinon deux séries
 * plates à 3 et à 3000 se ressemblent encore.
 */
function echelleDomaine(valeurs: number[]): { min: number; max: number } {
  const finies = valeurs.filter((v) => Number.isFinite(v));
  const max = borneRonde(Math.max(0, ...finies));
  const min = -borneRonde(-Math.min(0, ...finies));

  // Série entièrement nulle : `min = max = 0` diviserait par zéro, donc un axe de `NaN`.
  return min === 0 && max === 0 ? { min: 0, max: 1 } : { min, max };
}

/**
 * Borne « ronde » — 1, 2 ou 5 × 10ⁿ au-dessus de la valeur. Sans elle, les graduations tombent sur
 * des valeurs comme `2 847,33`, qu'un axe ne sert à rien à porter.
 */
function borneRonde(valeur: number): number {
  if (valeur <= 0) return 0;

  const magnitude = 10 ** Math.floor(Math.log10(valeur));
  const normalise = valeur / magnitude;
  const pas = normalise <= 1 ? 1 : normalise <= 2 ? 2 : normalise <= 5 ? 5 : 10;

  return pas * magnitude;
}
