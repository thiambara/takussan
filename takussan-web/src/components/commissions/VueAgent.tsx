'use client';

import { Check, ChevronDown, Download } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { PageHeader } from '@/components/console';
import { DeclarerEnTete } from '@/components/layout/en-tete-de-la-coque';
import { PagePleineLargeur } from '@/components/layout/PagePleineLargeur';
import { buttonVariants } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useAuth } from '@/context/AuthContext';
import { useVueDansLUrl } from '@/hooks/useVueDansLUrl';
import { anneesProposees, bornesDeLAnnee, jourDeDakar, statutAEcrire, statutAffiche, vueDesCommissions } from '@/lib/commissions/vue';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { buildExportUrl } from '@/lib/queries/exports';
import { useCommissionEntries, useCommissionSummary, type CommissionEntry } from '@/lib/queries/commissions';
import { cn } from '@/lib/utils';

import {
  AucuneCommission,
  Carte,
  ListeEnAttente,
  PaginationDuTelephone,
  PiedDeTableau,
  PucesDeStatut,
  Rangee,
  Rubrique,
  useComptesParStatut,
} from './listes';
import { CarteDeCommission, CarteDuDu, LienDuBail, StatutDeCommission, useLectureDeCommission } from './pieces';

/**
 * TCK-2662 — la lecture de l'AGENT (maquette `app-commissions`, A, « Vue agent ») : ce qu'on lui doit
 * d'abord (`/summary`, toutes dates), ce qu'on lui a payé dans l'année, puis ses lignes.
 *
 * - Téléphone : « On vous doit », « Payé cette année » et « Relevé », les puces (« Dues » par
 *   défaut), une carte par ligne, « Dernières payées », la naissance d'une commission en pied.
 * - Bureau : l'année et « Exporter mon relevé » en tête ; dès `xl`, deux colonnes (la carte et les
 *   derniers paiements | le tableau) — sous `xl`, le dû au-dessus du tableau, qui défile dans sa
 *   carte (maquette ; décision 5 a). Le tableau suit l'année choisie (« Depuis janvier ») ou toutes
 *   les dates.
 */

const COLS = 'minmax(0,1fr) 6.25rem 6rem 3rem 6.25rem 5.25rem 5.75rem';
/** Bureau 1280 (sous 1440) : le rôle rejoint le quartier, le taux passe sous la base. */
const COLS_ETROIT = 'minmax(0,1fr) 7rem 6.25rem 5.25rem 5.75rem';

function useMonPoint(annee: string) {
  const { user } = useAuth();
  const aujourdhui = jourDeDakar();
  const point = useCommissionSummary(aujourdhui.slice(0, 7), annee);
  const lignes = point.data?.data ?? [];
  const moi = lignes.find((r) => r.beneficiary.id === user?.id) ?? (lignes.length === 1 ? lignes[0] : undefined);
  return { point, moi };
}

function DateDeLigne({ e }: { readonly e: CommissionEntry }) {
  const t = useTranslations('commissions');
  const l = useLectureDeCommission();
  const [jour, sous] =
    e.status === 'paid'
      ? [l.jour(e.paid_at), l.moyen(e.payment_method)]
      : e.status === 'cancelled'
        ? [l.jour(e.cancelled_at), l.motif(e, true)]
        : [l.jour(e.earned_at), t('ligne.bailActive')];
  return (
    <span role="cell" className="min-w-0 leading-tight">
      <span className="block truncate tabular-nums">{jour}</span>
      {sous ? <span className="mt-0.5 block truncate text-ui text-muted-foreground">{sous}</span> : null}
    </span>
  );
}

function TableDeLAgent({ lignes }: { readonly lignes: readonly CommissionEntry[] }) {
  const t = useTranslations('commissions');
  const l = useLectureDeCommission();
  return (
    <div role="table" aria-label={t('tableLignes')}>
      <Rangee cols={COLS} colsEtroit={COLS_ETROIT} entete>
        <span role="columnheader">{t('colonnes.bien')}</span>
        <span role="columnheader" className="hidden min-[90rem]:block">
          {t('colonnes.role')}
        </span>
        <span role="columnheader" className="text-right">
          <span className="block min-[90rem]:hidden">{t('colonnes.baseTaux')}</span>
          <span className="hidden min-[90rem]:block">{t('colonnes.base')}</span>
        </span>
        <span role="columnheader" className="hidden text-right min-[90rem]:block">
          {t('colonnes.taux')}
        </span>
        <span role="columnheader" className="text-right">
          {t('columns.amount')}
        </span>
        <span role="columnheader">{t('columns.status')}</span>
        <span role="columnheader">{t('colonnes.date')}</span>
      </Rangee>
      {lignes.map((e) => (
        <Rangee key={e.id} cols={COLS} colsEtroit={COLS_ETROIT}>
          <span role="cell" className="min-w-0 leading-tight">
            <LienDuBail e={e} className="block truncate font-medium">
              {l.titreDuBien(e)}
            </LienDuBail>
            <span className="mt-0.5 block truncate text-ui text-muted-foreground">
              {l.quartier(e)}
              <span className="min-[90rem]:hidden">
                {l.quartier(e) ? ' · ' : ''}
                {l.role(e)}
              </span>
            </span>
          </span>
          <span role="cell" className="hidden text-encre-douce min-[90rem]:block">
            {l.Role(e)}
          </span>
          <span role="cell" className="text-right leading-tight text-encre-douce tabular-nums min-[90rem]:leading-[inherit]">
            {l.montant(e, e.base_amount)}
            <span className="mt-0.5 block text-ui text-muted-foreground min-[90rem]:hidden">{l.taux(e)}</span>
          </span>
          <span role="cell" className="hidden text-right text-encre-douce tabular-nums min-[90rem]:block">
            {l.taux(e)}
          </span>
          <span role="cell" className={cn('text-right font-semibold tabular-nums', e.status === 'cancelled' && 'font-normal text-muted-foreground line-through')}>
            {l.montant(e)}
          </span>
          <span role="cell">
            <StatutDeCommission statut={e.status} />
          </span>
          <DateDeLigne e={e} />
        </Rangee>
      ))}
    </div>
  );
}

function ChoixDAnnee({ annee, onChange }: { readonly annee: string; readonly onChange: (annee: string) => void }) {
  const t = useTranslations('commissions.agent');
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('annee', { annee })}
        className="inline-flex h-9 flex-none items-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-card px-3 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring"
      >
        {annee}
        <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {anneesProposees(jourDeDakar()).map((a) => (
          <DropdownMenuItem key={a} onClick={() => onChange(a)}>
            <Check className={cn('size-4 flex-none', a === annee ? 'text-foreground' : 'invisible')} aria-hidden="true" />
            {a}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ChoixDePeriode({ annee, toutes, onChange }: { readonly annee: string; readonly toutes: boolean; readonly onChange: (toutes: boolean) => void }) {
  const t = useTranslations('commissions.agent');
  const courante = annee === jourDeDakar().slice(0, 4);
  const deLAnnee = courante ? t('depuisJanvier') : t('enAnnee', { annee });
  const libelle = toutes ? t('toutesLesDates') : deLAnnee;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('periode', { periode: libelle })}
        className="ml-auto inline-flex h-8 flex-none items-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-card px-3 text-ui font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring"
      >
        {libelle}
        <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {[
          { valeur: false, texte: deLAnnee },
          { valeur: true, texte: t('toutesLesDates') },
        ].map((o) => (
          <DropdownMenuItem key={String(o.valeur)} onClick={() => onChange(o.valeur)}>
            <Check className={cn('size-4 flex-none', o.valeur === toutes ? 'text-foreground' : 'invisible')} aria-hidden="true" />
            {o.texte}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function VueAgent({ telephone }: { readonly telephone: boolean }) {
  const t = useTranslations('commissions');
  const f = useFormatteurs();
  const l = useLectureDeCommission();
  const { params, remplacer } = useVueDansLUrl();
  const aujourdhui = jourDeDakar();
  const vue = vueDesCommissions(params, aujourdhui);
  const statut = statutAffiche(vue);
  const annee = bornesDeLAnnee(vue.annee);
  const bornes = !telephone && !vue.toutesLesDates ? { earnedFrom: annee.du, earnedTo: annee.au } : {};
  const { moi } = useMonPoint(vue.annee);
  const comptes = useComptesParStatut(bornes);
  const liste = useCommissionEntries({ status: statut ?? undefined, page: vue.page, ...bornes });
  // Téléphone : « Dernières payées » sous les dues ; bureau : les trois derniers paiements de l'année.
  const payees = useCommissionEntries({
    status: 'paid',
    sort: '-paid_at',
    perPage: 3,
    ...(telephone ? {} : { paidFrom: annee.du, paidTo: annee.au }),
    enabled: telephone ? statut === 'due' : true,
  });
  const releve = buildExportUrl({ entity: 'commissions', format: 'csv', from: annee.du, to: annee.au });
  const anneeCourante = vue.annee === aujourdhui.slice(0, 4);
  const payeLibelle = anneeCourante ? t('agent.payeCetteAnnee') : t('agent.payeEn', { annee: vue.annee });
  const paye = f.montantCourt(moi?.paid_year ?? 0);
  const lignes = liste.data?.data ?? [];
  const surStatut = (s: typeof statut) => remplacer({ status: statutAEcrire(s), page: null });

  const carteDuDu = <CarteDuDu montant={moi?.due_amount ?? 0} baux={moi?.due_count ?? 0} plusAncienne={moi?.oldest_due_earned_at ?? null} />;
  const naissance = <p className="text-ui leading-snug text-muted-foreground">{t('agent.naissance')}</p>;

  if (telephone) {
    return (
      <PagePleineLargeur data-slot="commissions-agent" className="pb-8">
        <DeclarerEnTete titre={t('titreAgent')} />
        <div className="px-4 pt-4">
          {carteDuDu}
          <div className="mt-3 flex min-h-11 items-center gap-2 px-1 text-sm">
            <p className="min-w-0 flex-1 text-muted-foreground">
              {payeLibelle} : <span className="font-semibold text-foreground tabular-nums">{paye}</span>
            </p>
            <a href={releve} download aria-label={t('agent.releveAria', { annee: vue.annee })} className="inline-flex flex-none items-center gap-1.5 rounded-sm font-medium text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring">
              <Download className="size-4" aria-hidden="true" /> {t('agent.releve')}
            </a>
          </div>
        </div>
        <PucesDeStatut className="pt-1" statut={statut} comptes={comptes} onChange={surStatut} />
        <div className="px-4">
          {liste.isLoading ? (
            <ListeEnAttente />
          ) : lignes.length === 0 ? (
            <AucuneCommission />
          ) : (
            <Carte as="ul" className="divide-y divide-border">
              {lignes.map((e) => (
                <li key={e.id}>
                  <CarteDeCommission e={e} />
                </li>
              ))}
            </Carte>
          )}
          <PaginationDuTelephone meta={liste.data?.meta} onPage={(p) => remplacer({ page: p })} />
          {statut === 'due' && (payees.data?.data.length ?? 0) > 0 ? (
            <>
              <Rubrique
                className="mt-6"
                action={
                  <button type="button" onClick={() => remplacer({ status: 'paid', page: null })} className="rounded-sm text-sm font-medium text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring">
                    {t('agent.toutVoir')}
                  </button>
                }
              >
                {t('agent.dernieresPayees')}
              </Rubrique>
              <Carte as="ul" className="divide-y divide-border">
                {payees.data?.data.map((e) => (
                  <li key={e.id}>
                    <CarteDeCommission e={e} />
                  </li>
                ))}
              </Carte>
            </>
          ) : null}
          <div className="px-2 pt-4 text-center">{naissance}</div>
        </div>
      </PagePleineLargeur>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('titreAgent')}
        description={t('agent.sousTitre')}
        actions={
          <>
            <ChoixDAnnee annee={vue.annee} onChange={(a) => remplacer({ annee: a === aujourdhui.slice(0, 4) ? null : a, page: null })} />
            <a href={releve} download aria-label={t('agent.releveAria', { annee: vue.annee })} className={buttonVariants({ variant: 'outline' })}>
              <Download className="size-4" strokeWidth={1.75} aria-hidden="true" /> {t('agent.exporter')}
            </a>
          </>
        }
      />
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[18rem_minmax(0,1fr)]">
        <div className="space-y-4">
          {carteDuDu}
          <Carte as="section" className="p-5">
            <h2 className="text-sm font-normal text-muted-foreground">{payeLibelle}</h2>
            <p className="mt-1 font-display text-2xl font-semibold tracking-titre tabular-nums">{paye}</p>
            {(payees.data?.data.length ?? 0) > 0 ? (
              <ul className="mt-3 divide-y divide-border border-t border-border">
                {payees.data?.data.map((e) => (
                  <li key={e.id} className="flex items-baseline justify-between gap-4 py-2 text-sm">
                    <span className="inline-flex min-w-0 items-center gap-1.5 text-muted-foreground">
                      {[l.jour(e.paid_at), l.moyen(e.payment_method)].filter(Boolean).join(' · ')}
                    </span>
                    <span className="text-right font-medium tabular-nums">{l.montant(e)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 border-t border-border pt-2 text-sm text-muted-foreground">{t('agent.aucunPaiement', { annee: vue.annee })}</p>
            )}
            <Link
              href={`?status=paid${vue.annee !== aujourdhui.slice(0, 4) ? `&annee=${vue.annee}` : ''}`}
              scroll={false}
              className="mt-2 inline-block rounded-sm text-ui font-medium text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring"
            >
              {t('agent.tousLesPaiements')}
            </Link>
          </Carte>
          <div className="px-1">{naissance}</div>
        </div>
        <div className="min-w-0">
          <div className="mb-4 flex items-center gap-2 max-xl:flex-wrap">
            <PucesDeStatut taille="sm" statut={statut} comptes={comptes} onChange={surStatut} />
            <ChoixDePeriode annee={vue.annee} toutes={vue.toutesLesDates} onChange={(toutes) => remplacer({ periode: toutes ? 'tout' : null, page: null })} />
          </div>
          {liste.isLoading ? (
            <ListeEnAttente />
          ) : lignes.length === 0 ? (
            <AucuneCommission />
          ) : (
            <Carte className="overflow-hidden">
              <div className="max-xl:overflow-x-auto">
                <div className="min-w-[37.5rem]">
                  <TableDeLAgent lignes={lignes} />
                </div>
              </div>
              <PiedDeTableau meta={liste.data?.meta} onPage={(p) => remplacer({ page: p })} />
            </Carte>
          )}
        </div>
      </div>
    </div>
  );
}

