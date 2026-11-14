'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { BlocGraphique, type VariationDuBloc } from '@/components/rapports/graphiques/BlocGraphique';
import { GraphiqueDuMois, type UniteDuGraphique } from '@/components/rapports/graphiques/GraphiqueDuMois';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { pourcentMesure } from '@/lib/rapports/pourcentages';
import { variationDuMoisClos } from '@/lib/rapports/chiffres';
import { cn } from '@/lib/utils';

/** Ce que mesure un graphique : la clé de son titre (`rapports.graphiques.titres.<id>`) et sa lecture. */
export type IdDuGraphique = 'encaisse' | 'occupation' | 'commissions' | 'bauxSignes' | 'cashflow';

export interface SerieDuRapport {
  readonly id: IdDuGraphique;
  readonly mois: readonly string[];
  readonly valeurs: readonly (number | null)[];
}

const LECTURE: Readonly<Record<IdDuGraphique, { readonly unite: UniteDuGraphique; readonly forme: 'barres' | 'courbe' }>> = {
  encaisse: { unite: 'montant', forme: 'barres' },
  cashflow: { unite: 'montant', forme: 'barres' },
  commissions: { unite: 'montant', forme: 'barres' },
  bauxSignes: { unite: 'nombre', forme: 'barres' },
  occupation: { unite: 'pourcent', forme: 'courbe' },
};

const mesurees = (valeurs: readonly (number | null)[]): number[] => valeurs.filter((v): v is number => typeof v === 'number');

interface GraphiquesDuRapportProps {
  readonly series: readonly SerieDuRapport[];
  /** `AAAA-MM` du mois que la période lue couvre : il est en cours, la variation ne le compare pas. */
  readonly moisEnCours: string | null;
  readonly className?: string;
}

/**
 * TCK-2628 — les graphiques d'une vue d'ensemble : UNE série chacun (AC5), le total et la variation au-dessus
 * du tracé. Au bureau côte à côte (deux colonnes dès `xl`, maquette `DeuxGraphiques`) ; au téléphone, un à la
 * fois, choisi par les segments posés au-dessus (maquette `GraphiqueTel`).
 *
 * La variation compare le dernier mois CLOS au précédent (`variationDuMoisClos`) : le mois en cours n'a que
 * ses premiers jours. Un taux dit son écart en points sur la série ; les commissions, leur part depuis janvier.
 */
export function GraphiquesDuRapport({ series, moisEnCours, className }: GraphiquesDuRapportProps) {
  const t = useTranslations('rapports.graphiques');
  const f = useFormatteurs();
  const [actif, setActif] = useState<IdDuGraphique | undefined>(series[0]?.id);

  const valeurLue = (v: number, unite: UniteDuGraphique) =>
    unite === 'montant' ? f.montantAbrege(v, 'XOF') : unite === 'pourcent' ? pourcentMesure(f, v) : f.nombre(v);
  const moisLong = (m: string) => f.date(`${m}-15T12:00:00Z`, { month: 'long' });

  const lire = (s: SerieDuRapport): { readonly total: string; readonly variation: VariationDuBloc | null } => {
    const { unite } = LECTURE[s.id];
    const valeurs = mesurees(s.valeurs);
    if (unite === 'pourcent') {
      const dernier = valeurs.at(-1);
      const ecart = valeurs.length > 1 && dernier !== undefined ? Math.round(dernier - valeurs[0]) : null;
      return {
        total: dernier === undefined ? '—' : valeurLue(dernier, unite),
        variation:
          ecart === null
            ? null
            : { texte: t('variationPoints', { ecart: signe(ecart, f.nombre) }), ton: ecart === 0 ? 'neutre' : ecart > 0 ? 'succes' : 'danger', baisse: ecart < 0 },
      };
    }
    const total = valeurLue(valeurs.reduce((a, b) => a + b, 0), unite);
    if (s.id === 'commissions') {
      const annee = s.mois.at(-1)?.slice(0, 4);
      const depuisJanvier = s.mois.reduce((a, m, i) => (m.slice(0, 4) === annee ? a + (s.valeurs[i] ?? 0) : a), 0);
      return { total, variation: { texte: t('depuisJanvier', { montant: valeurLue(depuisJanvier, unite) }), ton: 'neutre' } };
    }
    const v = variationDuMoisClos(s.mois, s.valeurs, moisEnCours);
    return {
      total,
      variation: v
        ? {
            texte: t('variationMois', { mois: moisLong(v.mois), pourcent: signe(v.pourcent, f.nombre), precedent: moisLong(v.precedent) }),
            ton: v.pourcent === 0 ? 'neutre' : v.pourcent > 0 ? 'succes' : 'danger',
            baisse: v.pourcent < 0,
          }
        : null,
    };
  };

  if (series.length === 0) return null;
  return (
    <div className={cn('grid grid-cols-1 gap-5 xl:grid-cols-2', className)}>
      {series.length > 1 ? (
        <div role="group" aria-label={t('choix')} className="flex gap-1 rounded-xl bg-muted p-1 md:hidden">
          {series.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={s.id === actif}
              onClick={() => setActif(s.id)}
              className={cn(
                'inline-flex min-h-11 flex-1 items-center justify-center rounded-lg px-3 text-sm font-semibold outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring',
                s.id === actif ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground',
              )}
            >
              {t(`courts.${s.id}`)}
            </button>
          ))}
        </div>
      ) : null}
      {series.map((s) => {
        const { unite, forme } = LECTURE[s.id];
        const { total, variation } = lire(s);
        const titre = t(`titres.${s.id}`);
        return (
          <BlocGraphique key={s.id} titre={titre} total={total} variation={variation} className={cn(s.id !== actif && 'max-md:hidden')}>
            <GraphiqueDuMois mois={s.mois} valeurs={s.valeurs} unite={unite} forme={forme} libelle={titre} />
          </BlocGraphique>
        );
      })}
    </div>
  );
}

/** « +8 », « −3 », « 0 » : le signe moins typographique, la valeur absolue formatée. */
function signe(n: number, nombre: (v: number) => string): string {
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${nombre(Math.abs(n))}`;
}
