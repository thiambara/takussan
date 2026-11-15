'use client';

import { useState, type KeyboardEvent } from 'react';

import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { pourcentMesure } from '@/lib/rapports/pourcentages';
import { formatDate, formatNumber } from '@/lib/format';
import { graduationsRondes } from '@/lib/rapports/graduations';
import { cn } from '@/lib/utils';

export type UniteDuGraphique = 'montant' | 'pourcent' | 'nombre';

export interface GraphiqueDuMoisProps {
  /** Les mois de l'API, `AAAA-MM`, du plus ancien au plus récent. */
  readonly mois: readonly string[];
  /** Une valeur par mois ; `null` : rien à mesurer ce mois-là (aucun bien éligible), le tracé s'y coupe. */
  readonly valeurs: readonly (number | null)[];
  readonly unite: UniteDuGraphique;
  /** Barres pour un flux (encaissé, commissions), courbe pour un taux qui évolue (occupation). */
  readonly forme?: 'barres' | 'courbe';
  /** Le nom de la figure, lu par un lecteur d'écran (le titre du bloc). */
  readonly libelle: string;
  /** La hauteur du tracé ; 168 px par défaut, comme la maquette. */
  readonly className?: string;
}

const MOIS_ISO = /^(\d{4})-(\d{2})$/;

function dateDuMois(valeur: string): Date | null {
  const m = MOIS_ISO.exec(valeur);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 15, 12));
}

/**
 * TCK-2628 — un graphique de « Rapports » : douze mois, UNE série (jamais deux unités sur un axe — le défaut
 * des vues agent et bailleur), graduations rondes (`graduationsRondes`, AC5), texte en encre, jamais dans
 * la couleur de la série (maquette `GraphiqueMois`, compétence dataviz).
 *
 * Le mois actif porte sa bulle : le dernier mois mesuré par défaut (la maquette le dessine figé), le mois
 * survolé ou choisi au clavier (← →) sinon. Le tableau des valeurs est toujours dans le document pour un
 * lecteur d'écran ; la vue en tableau visible est le lien « Voir le tableau » du bloc.
 */
export function GraphiqueDuMois({ mois, valeurs, unite, forme = 'barres', libelle, className }: GraphiqueDuMoisProps) {
  const f = useFormatteurs();
  const n = valeurs.length;
  const dernierMesure = (() => {
    for (let i = n - 1; i >= 0; i -= 1) if (typeof valeurs[i] === 'number') return i;
    return n - 1;
  })();
  const [actif, setActif] = useState<number>(dernierMesure);

  const graduations = unite === 'pourcent' ? [0, 50, 100] : graduationsRondes(valeurs);
  const haut = graduations[graduations.length - 1] || 1;
  const pct = (v: number) => `${Math.min(100, Math.max(0, (v / haut) * 100))}%`;

  const etiquette = (v: number): string =>
    unite === 'pourcent'
      ? `${formatNumber(v, f.locale, { maximumFractionDigits: 0 })} %`
      : unite === 'montant'
        ? formatNumber(v, f.locale, { notation: 'compact', maximumFractionDigits: 1 })
        : formatNumber(v, f.locale, { maximumFractionDigits: 0 });
  const valeurLue = (v: number | null): string =>
    v === null ? '—' : unite === 'montant' ? f.montantAbrege(v, 'XOF') : unite === 'pourcent' ? pourcentMesure(f, v) : f.nombre(v);
  const moisCourt = (m: string) => {
    const d = dateDuMois(m);
    return d ? formatDate(d, f.locale, { dateStyle: undefined, month: 'short' }) : m;
  };
  const moisLong = (m: string) => {
    const d = dateDuMois(m);
    if (!d) return m;
    const s = formatDate(d, f.locale, { dateStyle: undefined, month: 'short', year: 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  const auClavier = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight') setActif((i) => Math.min(n - 1, i + 1));
    else if (e.key === 'ArrowLeft') setActif((i) => Math.max(0, i - 1));
    else return;
    e.preventDefault();
  };

  const valeurActive = valeurs[actif] ?? null;
  const bulle = `${moisLong(mois[actif] ?? '')} · ${valeurLue(valeurActive)}`;
  const aDroite = actif > n - 4;

  // La courbe se coupe sur un mois sans mesure : un segment par suite de mois mesurés.
  const segments: string[] = [];
  if (forme === 'courbe') {
    let courant: string[] = [];
    valeurs.forEach((v, i) => {
      if (typeof v === 'number') courant.push(`${((i + 0.5) / n) * 100},${100 - Math.min(100, (v / haut) * 100)}`);
      else if (courant.length) {
        segments.push(courant.join(' '));
        courant = [];
      }
    });
    if (courant.length) segments.push(courant.join(' '));
  }

  return (
    <figure data-slot="graphique-du-mois" data-forme={forme} className="m-0">
      <figcaption className="sr-only">{libelle}</figcaption>
      <div className="flex gap-2">
        <div className={cn('relative w-9 flex-none h-42', className)} aria-hidden="true">
          {graduations.map((g) => (
            <span
              key={g}
              data-graduation={g}
              className="absolute right-0 translate-y-1/2 text-legende leading-none text-muted-foreground tabular-nums"
              style={{ bottom: pct(g) }}
            >
              {etiquette(g)}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div
            // Un curseur sur les mois : ← → déplacent la bulle, et le lecteur d'écran lit le mois choisi.
            role="slider"
            aria-label={libelle}
            aria-valuemin={0}
            aria-valuemax={Math.max(0, n - 1)}
            aria-valuenow={actif}
            aria-valuetext={bulle}
            tabIndex={0}
            onKeyDown={auClavier}
            className={cn('relative h-42 rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring', className)}
          >
            {graduations.map((g) => (
              <span
                key={g}
                aria-hidden="true"
                className={cn('absolute inset-x-0 border-t', g === 0 ? 'border-foreground/30' : 'border-dashed border-border')}
                style={{ bottom: pct(g) }}
              />
            ))}
            {forme === 'barres' ? (
              <div className="absolute inset-0 flex items-end gap-0.5 px-1" aria-hidden="true">
                {valeurs.map((v, i) => (
                  <div
                    key={mois[i] ?? i}
                    data-mois={mois[i]}
                    onMouseEnter={() => setActif(i)}
                    className="relative flex h-full min-w-0 flex-1 items-end justify-center"
                  >
                    <span
                      className={cn('w-full max-w-7 rounded-t-[0.25rem]', i === actif ? 'bg-primary-deep' : 'bg-chart-1')}
                      style={{ height: pct(v ?? 0) }}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="absolute inset-x-1 inset-y-0" aria-hidden="true">
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
                  {segments.map((points) => (
                    <polyline
                      key={points}
                      fill="none"
                      strokeWidth="2"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                      className="stroke-chart-2"
                      points={points}
                    />
                  ))}
                </svg>
                <div className="absolute inset-0 flex">
                  {valeurs.map((_, i) => (
                    <span key={mois[i] ?? i} className="h-full min-w-0 flex-1" onMouseEnter={() => setActif(i)} />
                  ))}
                </div>
                {typeof valeurActive === 'number' ? (
                  <span
                    className="absolute size-2.5 -translate-x-1/2 translate-y-1/2 rounded-full bg-chart-2 ring-2 ring-card"
                    style={{ left: `${((actif + 0.5) / n) * 100}%`, bottom: pct(valeurActive) }}
                  />
                ) : null}
              </div>
            )}
            {/* La bulle du mois actif, en encre inversée (jamais la couleur de la série). */}
            <span
              data-slot="bulle"
              aria-live="polite"
              className={cn(
                'pointer-events-none absolute z-10 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-legende font-medium text-background tabular-nums',
                aDroite ? 'right-0' : '-translate-x-1/2',
              )}
              style={{
                bottom: `calc(${pct(valeurActive ?? 0)} + ${forme === 'courbe' ? '0.75rem' : '0.5rem'})`,
                ...(aDroite ? {} : { left: `${((actif + 0.5) / n) * 100}%` }),
              }}
            >
              {bulle}
            </span>
          </div>
          <div className="mt-1.5 flex gap-0.5 px-1" aria-hidden="true">
            {mois.map((m) => (
              <span key={m} className="min-w-0 flex-1 text-center text-legende text-muted-foreground">
                <span className="md:hidden">{moisCourt(m).charAt(0).toUpperCase()}</span>
                <span className="max-md:hidden">{moisCourt(m)}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
      <table className="sr-only">
        <caption>{libelle}</caption>
        <tbody>
          {mois.map((m, i) => (
            <tr key={m}>
              <th scope="row">{moisLong(m)}</th>
              <td>{valeurLue(valeurs[i] ?? null)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
