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
export type IdDuGraphique = 'encaisse' | 'occupation' | 'commissions' | 'bauxSignes' | 'cashflow' | 'impayes';

export interface SerieDuRapport {
  readonly id: IdDuGraphique;
  readonly mois: readonly string[];
  readonly valeurs: readonly (number | null)[];
  /**
   * TCK-2867 — « Attendu » (bailleur, `timeseries.expected`) : un trait au-dessus de chaque barre, la légende
   * « Encaissé · Attendu », et la part de l'attendu encaissée à côté du total.
   */
  readonly attendu?: readonly (number | null)[];
  /** TCK-2867 — au téléphone seulement, dans le segment (« Impayés » de la maquette) ; le bureau ne le dessine pas. */
  readonly telephoneSeulement?: boolean;
}

const LECTURE: Readonly<Record<IdDuGraphique, { readonly unite: UniteDuGraphique; readonly forme: 'barres' | 'courbe' }>> = {
  encaisse: { unite: 'montant', forme: 'barres' },
  cashflow: { unite: 'montant', forme: 'barres' },
  commissions: { unite: 'montant', forme: 'barres' },
  bauxSignes: { unite: 'nombre', forme: 'barres' },
  occupation: { unite: 'pourcent', forme: 'courbe' },
  impayes: { unite: 'montant', forme: 'barres' },
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
 *
 * TCK-2867 — chaque graphique a « Voir le tableau » (maquette `LienTableau`) : les mêmes valeurs dans un `table`
 * visible, un mois par colonne, à la place du tracé ; « Voir le graphique » le referme. « Impayés » (l'impayé en
 * fin de mois, un SOLDE) dit son dernier point, jamais une somme, et sa hausse est en danger. « Attendu » se pose en
 * repères sur l'encaissé du bailleur, avec sa légende.
 */
export function GraphiquesDuRapport({ series, moisEnCours, className }: GraphiquesDuRapportProps) {
  const t = useTranslations('rapports.graphiques');
  const f = useFormatteurs();
  const [actif, setActif] = useState<IdDuGraphique | undefined>(series[0]?.id);
  const [enTableau, setEnTableau] = useState<ReadonlySet<IdDuGraphique>>(() => new Set());
  const basculerLeTableau = (id: IdDuGraphique) =>
    setEnTableau((avant) => {
      const apres = new Set(avant);
      if (apres.has(id)) apres.delete(id);
      else apres.add(id);
      return apres;
    });

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
    if (s.id === 'impayes') {
      // Un solde de fin de mois : le dernier point, et sa variation sur le mois clos — une hausse est un danger.
      const dernier = valeurs.at(-1);
      const v = variationDuMoisClos(s.mois, s.valeurs, moisEnCours);
      return {
        total: dernier === undefined ? '—' : valeurLue(dernier, unite),
        variation: v
          ? {
              texte: t('variationMois', { mois: moisLong(v.mois), pourcent: signe(v.pourcent, f.nombre), precedent: moisLong(v.precedent) }),
              ton: v.pourcent === 0 ? 'neutre' : v.pourcent > 0 ? 'danger' : 'succes',
              baisse: v.pourcent < 0,
            }
          : null,
      };
    }
    const total = valeurLue(valeurs.reduce((a, b) => a + b, 0), unite);
    if (s.attendu) {
      // L'encaissé face à l'attendu : la part encaissée sur les douze mois ; rien sans attendu (jamais ÷ 0).
      const attendu = mesurees(s.attendu).reduce((a, b) => a + b, 0);
      const encaisse = valeurs.reduce((a, b) => a + b, 0);
      return { total, variation: attendu > 0 ? { texte: t('partDeLAttendu', { pourcent: f.nombre(Math.round((encaisse / attendu) * 100)) }), ton: 'neutre' } : null };
    }
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
        const titre = s.attendu ? t('titres.encaisseEtAttendu') : t(`titres.${s.id}`);
        const tableau = enTableau.has(s.id);
        return (
          <BlocGraphique
            key={s.id}
            titre={titre}
            total={total}
            variation={variation}
            className={cn(s.id !== actif && 'max-md:hidden', s.telephoneSeulement && 'md:hidden')}
            action={
              <button
                type="button"
                data-slot="voir-le-tableau"
                aria-pressed={tableau}
                onClick={() => basculerLeTableau(s.id)}
                className="inline-flex min-h-11 flex-none items-center rounded-sm text-ui font-medium text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring md:min-h-0"
              >
                {tableau ? t('voirLeGraphique') : t('voirLeTableau')}
              </button>
            }
          >
            {tableau ? (
              <TableauDuGraphique serie={s} titre={titre} unite={unite} />
            ) : (
              <>
                <GraphiqueDuMois
                  mois={s.mois}
                  valeurs={s.valeurs}
                  unite={unite}
                  forme={forme}
                  libelle={titre}
                  {...(s.attendu ? { reperes: { libelle: t('attendu'), valeurs: s.attendu } } : {})}
                />
                {s.attendu ? <LegendeAttendu /> : null}
              </>
            )}
          </BlocGraphique>
        );
      })}
    </div>
  );
}

/**
 * TCK-2867 — « Voir le tableau » : les valeurs du graphique dans un `table` visible, un mois par colonne (en-têtes
 * `scope="col"`), une ligne par série (l'encaissé, et l'attendu quand il est là). Il défile dans sa carte.
 */
function TableauDuGraphique({ serie, titre, unite }: { readonly serie: SerieDuRapport; readonly titre: string; readonly unite: UniteDuGraphique }) {
  const t = useTranslations('rapports.graphiques');
  const f = useFormatteurs();
  const lue = (v: number | null | undefined) =>
    typeof v !== 'number' ? '—' : unite === 'montant' ? f.montantAbrege(v, 'XOF') : unite === 'pourcent' ? pourcentMesure(f, v) : f.nombre(v);
  const moisCourt = (m: string) => f.date(`${m}-15T12:00:00Z`, { month: 'short', year: '2-digit' });
  const lignes: { readonly cle: string; readonly libelle: string; readonly valeurs: readonly (number | null)[] }[] = [
    { cle: 'serie', libelle: t(`courts.${serie.id}`), valeurs: serie.valeurs },
    ...(serie.attendu ? [{ cle: 'attendu', libelle: t('attendu'), valeurs: serie.attendu }] : []),
  ];
  return (
    <div className="overflow-x-auto" data-slot="tableau-du-graphique">
      <table className="w-full text-ui tabular-nums">
        <caption className="sr-only">{titre}</caption>
        <thead className="text-muted-foreground">
          <tr>
            <th scope="col" className="sticky left-0 bg-card py-2 pr-3 text-left font-medium">
              <span className="sr-only">{t('serie')}</span>
            </th>
            {serie.mois.map((m) => (
              <th key={m} scope="col" className="whitespace-nowrap px-2 py-2 text-right font-medium">
                {moisCourt(m)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {lignes.map((l) => (
            <tr key={l.cle}>
              <th scope="row" className="sticky left-0 bg-card py-2 pr-3 text-left font-medium whitespace-nowrap">
                {l.libelle}
              </th>
              {serie.mois.map((m, i) => (
                <td key={m} className="whitespace-nowrap px-2 py-2 text-right">
                  {lue(l.valeurs[i])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** TCK-2867 — la légende de l'encaissé face à l'attendu (maquette `LegendeAttendu`). */
function LegendeAttendu() {
  const t = useTranslations('rapports.graphiques');
  return (
    <p data-slot="legende-attendu" className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm bg-chart-1" aria-hidden="true" />
        {t('courts.cashflow')}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-0.5 w-3.5 rounded-full bg-foreground" aria-hidden="true" />
        {t('attendu')}
      </span>
    </p>
  );
}

/** « +8 », « −3 », « 0 » : le signe moins typographique, la valeur absolue formatée. */
function signe(n: number, nombre: (v: number) => string): string {
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${nombre(Math.abs(n))}`;
}
