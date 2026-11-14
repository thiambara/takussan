'use client';

import { useState } from 'react';
import { ChevronRight, Download, Loader2, RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { StatusBadge } from '@/components/console/StatusBadge';
import { Button } from '@/components/ui/button';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { Skeleton } from '@/components/ui/skeleton';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { PLAFOND_LIGNES_EXPORT, PLAFOND_LIGNES_EXPORT_PDF, type ExportEntity, type ExportFormat } from '@/lib/queries/exports';
import { bornesDuPrereglage, cartesPermises, estUnExport, estUnFormat, type CartePrete } from '@/lib/rapports/exports';
import { cn } from '@/lib/utils';

import { ExportForm } from './ExportForm';
import { useDerniersExports, useExportsPermis, useTelechargement, type ExportJournalise, type Telechargement } from './useExports';

const COURT: Record<ExportFormat, string> = { csv: 'CSV', xlsx: 'Excel', pdf: 'PDF' };

/**
 * TCK-2629 — l'onglet « Exports » de Rapports (maquette `app-rapports`, écrans « Exports » et « Export
 * personnalisé ») : les cartes prêtes, l'export personnalisé (colonne droite au bureau, feuille du bas au
 * téléphone) et « Derniers exports » avec « Refaire ».
 *
 * Une carte prête est un export comme un autre : elle n'est rendue que si son type est permis aujourd'hui
 * (`cartesPermises` sur `useExportsPermis`, la liste que le formulaire lit), et part par le même relais.
 * « Refaire » rejoue type, format et période journalisés (`GET /api/me/exports`), sous les capacités
 * d'AUJOURD'HUI : un type qui ne l'est plus, ou que ce formulaire ne connaît pas, n'a pas de « Refaire ».
 * Aucun fichier n'est gardé ni promis.
 */
export function ExportsDuRapport({ staff }: { readonly staff: boolean }) {
  const t = useTranslations('rapports.exports');
  const tE = useTranslations('dashboard.exports');
  const permis = useExportsPermis(staff);
  const telechargement = useTelechargement();
  const [feuille, setFeuille] = useState(false);
  const cartes = cartesPermises(permis);

  if (permis.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-card p-4 text-sm text-pretty text-muted-foreground" data-testid="exports-none">
        {tE('noneAllowed')}
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 items-start gap-7 xl:grid-cols-[minmax(0,1fr)_min(25rem,37%)] xl:gap-8" data-slot="exports-du-rapport">
      <div className="min-w-0 space-y-7">
        <section aria-labelledby="exports-prets">
          <h2 id="exports-prets" className="mb-2.5 text-corps font-semibold">
            {t('prets')}
          </h2>
          <ul className="space-y-2 lg:grid lg:grid-cols-[repeat(auto-fill,minmax(12.5rem,1fr))] lg:gap-3 lg:space-y-0">
            {cartes.map((c, i) => (
              <li key={c.id} className={cn(i >= 3 && 'max-lg:hidden')}>
                <CarteDExport carte={c} telechargement={telechargement} />
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setFeuille(true)}
            className="mt-2 flex min-h-14 w-full items-center gap-3 rounded-xl border border-border bg-card px-4 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring lg:hidden"
          >
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block text-corps font-medium">{t('personnalise')}</span>
              <span className="mt-0.5 block truncate text-ui text-muted-foreground">{t('personnaliseDetail', { n: permis.length })}</span>
            </span>
            <ChevronRight className="size-4 flex-none text-muted-foreground" aria-hidden="true" />
          </button>
        </section>
        <DerniersExports permis={permis} telechargement={telechargement} />
      </div>

      <section aria-labelledby="exports-personnalise" className="rounded-xl border border-border bg-card max-lg:hidden">
        <h2 id="exports-personnalise" className="border-b border-border px-4 py-3 text-corps font-semibold">
          {t('personnalise')}
        </h2>
        <ExportForm staff={staff} className="p-4" />
      </section>

      <FeuilleDuBas open={feuille} onOpenChange={setFeuille} titre={t('personnalise')}>
        <ExportForm staff={staff} telephone />
      </FeuilleDuBas>
    </div>
  );
}

/** Ce que dit une carte prête sous son titre : sa période, ou l'instant de la photographie. */
function useDetailDeLaCarte() {
  const t = useTranslations('rapports.exports');
  const f = useFormatteurs();
  return (c: CartePrete) => {
    if (!c.periode) return t(`details.${c.id}`, { jour: f.jourMois(new Date()) });
    const { from } = bornesDuPrereglage(c.periode);
    return c.periode === 'annee'
      ? t('details.annee', { annee: from.slice(0, 4) })
      : f.date(`${from.slice(0, 7)}-15T12:00:00Z`, { month: 'long', year: 'numeric' });
  };
}

function CarteDExport({ carte, telechargement }: { readonly carte: CartePrete; readonly telechargement: Telechargement }) {
  const t = useTranslations('rapports.exports');
  const tE = useTranslations('dashboard.exports');
  const detail = useDetailDeLaCarte();
  const id = `carte:${carte.id}`;
  const enCours = telechargement.enCours === id;
  const titre = t(`cartes.${carte.id}`);
  return (
    <div className="rounded-xl border border-border bg-card py-3 pr-3 pl-4 lg:p-4" data-carte={carte.id}>
      <div className="flex items-center gap-3 lg:block">
      <div className="min-w-0 flex-1 leading-tight">
        <p className="flex items-center gap-2 lg:justify-between">
          <span className="truncate text-corps font-medium">{titre}</span>
          <StatusBadge label={COURT[carte.format]} />
        </p>
        <p className="mt-1 truncate text-ui tabular-nums text-muted-foreground">{detail(carte)}</p>
      </div>
      <Button
        type="button"
        variant="secondary"
        className="h-11 flex-none lg:mt-3 lg:h-9 lg:w-full"
        disabled={telechargement.enCours !== null}
        aria-label={t('telechargerAria', { titre, format: COURT[carte.format] })}
        onClick={() => {
          const periode = carte.periode ? bornesDuPrereglage(carte.periode) : undefined;
          void telechargement.telecharger(id, { entity: carte.entity, format: carte.format, from: periode?.from, to: periode?.to });
        }}
      >
        {enCours ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Download className="max-lg:hidden" aria-hidden="true" />}
        {tE('download')}
      </Button>
      </div>
      <Issue id={id} telechargement={telechargement} />
    </div>
  );
}

/** La coupure au plafond ou l'échec, sous ce qui vient de télécharger. */
function Issue({ id, telechargement }: { readonly id: string; readonly telechargement: Telechargement }) {
  const tE = useTranslations('dashboard.exports');
  const f = useFormatteurs();
  if (telechargement.dernier !== id) return null;
  if (telechargement.coupe !== null) {
    return (
      <p className="mt-2 text-ui text-pretty text-foreground" role="status" data-testid="exports-truncated">
        {tE('truncated', { count: f.nombre(telechargement.coupe) })}
      </p>
    );
  }
  if (telechargement.echec) {
    return (
      <p className="mt-2 text-ui text-pretty text-destructive" role="alert">
        {tE('failed')}
      </p>
    );
  }
  return null;
}

function DerniersExports({ permis, telechargement }: { readonly permis: readonly ExportEntity[]; readonly telechargement: Telechargement }) {
  const t = useTranslations('rapports.exports');
  const tE = useTranslations('dashboard.exports');
  const f = useFormatteurs();
  const derniers = useDerniersExports();
  const lignes = derniers.data?.data ?? [];

  const type = (x: ExportJournalise) => (estUnExport(x.entity) ? tE(`entities.${x.entity}`) : t('typeInconnu'));
  const periode = (x: ExportJournalise) =>
    x.filters.from && x.filters.to
      ? t('periodeDuAu', { du: f.jourMois(x.filters.from), au: f.jourMois(x.filters.to) })
      : x.filters.from
        ? t('periodeDepuis', { du: f.jourMois(x.filters.from) })
        : x.filters.to
          ? t('periodeJusquAu', { au: f.jourMois(x.filters.to) })
          : t('periodeToute');
  const format = (x: ExportJournalise) => (estUnFormat(x.format) ? COURT[x.format] : (x.format ?? '—'));
  /** « Refaire » : le type ET le format sont connus, et le type est permis AUJOURD'HUI. */
  const refaisable = (x: ExportJournalise): x is ExportJournalise & { entity: ExportEntity; format: ExportFormat } =>
    estUnExport(x.entity) && estUnFormat(x.format) && permis.includes(x.entity);
  const refaire = (x: ExportJournalise, i: number) => {
    if (!refaisable(x)) return null;
    const id = `refaire:${i}`;
    return (
      <Button
        type="button"
        variant="ghost"
        className="h-11 flex-none px-2 text-ui font-medium text-primary lg:h-8"
        disabled={telechargement.enCours !== null}
        aria-label={t('refaireAria', { type: type(x), periode: periode(x) })}
        onClick={() =>
          void telechargement.telecharger(id, {
            entity: x.entity,
            format: x.format,
            from: x.filters.from ?? undefined,
            to: x.filters.to ?? undefined,
          })
        }
      >
        {telechargement.enCours === id ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RotateCcw className="max-lg:hidden" aria-hidden="true" />}
        {t('refaire')}
      </Button>
    );
  };

  return (
    <section aria-labelledby="exports-derniers">
      <h2 id="exports-derniers" className="mb-2.5 text-corps font-semibold">
        {t('derniers')}
      </h2>
      {derniers.isPending ? (
        <Skeleton className="h-40 rounded-xl" aria-hidden="true" />
      ) : derniers.isError ? (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">{t('derniersErreur')}</p>
      ) : lignes.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground" data-testid="exports-derniers-vide">
          {t('derniersVide')}
        </p>
      ) : (
        <>
          <ul className="divide-y divide-border rounded-xl border border-border bg-card lg:hidden" data-slot="derniers-exports">
            {lignes.slice(0, 3).map((x, i) => (
              <li key={`${x.at}-${i}`} className="flex min-h-14 items-center gap-3 py-2 pr-3 pl-4">
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="truncate text-corps font-medium">{t('typeEtPeriode', { type: type(x), periode: periode(x) })}</p>
                  <p className="mt-0.5 truncate text-ui tabular-nums text-muted-foreground">
                    {t('ligneTelephone', { date: x.at ? f.jourMois(x.at) : '—', format: format(x), lignes: f.nombre(x.row_count), n: x.row_count })}
                  </p>
                </div>
                {refaire(x, i)}
              </li>
            ))}
          </ul>
          <div className="overflow-x-auto rounded-xl border border-border bg-card max-lg:hidden">
            <table className="w-full text-sm" data-slot="derniers-exports-table">
              <caption className="sr-only">{t('derniers')}</caption>
              <thead className="bg-muted/40 text-ui text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">{t('colonnes.date')}</th>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">{t('colonnes.type')}</th>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">{t('colonnes.periode')}</th>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">{t('colonnes.format')}</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">{t('colonnes.lignes')}</th>
                  <th scope="col" className="px-4 py-2.5"><span className="sr-only">{t('colonnes.gestes')}</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lignes.map((x, i) => (
                  <tr key={`${x.at}-${i}`}>
                    <td className="px-4 py-2 whitespace-nowrap tabular-nums text-muted-foreground">{x.at ? f.jourMois(x.at) : '—'}</td>
                    <td className="px-4 py-2 font-medium">{type(x)}</td>
                    <td className="px-4 py-2 text-foreground">{periode(x)}</td>
                    <td className="px-4 py-2">{format(x)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{f.nombre(x.row_count)}</td>
                    <td className="px-2 py-1 text-right">{refaire(x, i)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="mt-2 text-xs text-pretty text-muted-foreground">{t('pied', { max: f.nombre(PLAFOND_LIGNES_EXPORT), pdf: f.nombre(PLAFOND_LIGNES_EXPORT_PDF) })}</p>
    </section>
  );
}
