'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, ChevronDown, ChevronRight, Download, FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { PageHeader } from '@/components/console';
import { DeclarerEnTete } from '@/components/layout/en-tete-de-la-coque';
import { PagePleineLargeur } from '@/components/layout/PagePleineLargeur';
import { BarreDAction } from '@/components/ui/barre-d-action';
import { Button, buttonVariants } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useAuth } from '@/context/AuthContext';
import { useCan } from '@/hooks/useCan';
import { useVueDansLUrl } from '@/hooks/useVueDansLUrl';
import { jourDeDakar, statutAEcrire, statutAffiche, vueDesCommissions } from '@/lib/commissions/vue';
import { bornesDuMois, dateDuMois, derniersMois } from '@/lib/finances/mois';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { buildExportUrl } from '@/lib/queries/exports';
import { useCommissionEntries, useCommissionSummary, type CommissionEntry, type PointDUnBeneficiaire } from '@/lib/queries/commissions';
import { cn } from '@/lib/utils';

import { AnnulerLaCommission, MenuDeLigne } from './gestes';
import { MarquerPayee, Solder } from './Payer';
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
import { AvatarDeBeneficiaire, Bascule, CarteDeCommission, LienDuBail, StatutDeCommission, useLectureDeCommission } from './pieces';

/**
 * TCK-2662 — la lecture de qui lit tout le grand livre (`reports.view_agency` ou `payouts.approve`,
 * `CommissionEntry::readsWholeLedger`) : ce que l'agence doit à chacun, et « Solder ».
 *
 * - « Par agent » (`/summary` du mois) : au téléphone, le total dû et une carte par agent qui ouvre
 *   ses lignes ; au bureau, le tableau Agent · Dû · Lignes · Payé ce mois · Payé dans l'année ·
 *   Dernier paiement, et la ligne de total.
 * - « Par ligne » (`?vue=lignes`, ou `?agent=` : les lignes d'UN bénéficiaire) : le registre, ses
 *   puces de statut, le filtre de bénéficiaire, et le menu « … » d'une ligne due.
 * - Les gestes (« Solder », « Marquer payée », « Annuler ») exigent `payouts.approve`, et jamais sur
 *   sa propre ligne (AC5) ; sans elle, ni bouton ni menu.
 */

/** Les gabarits de la maquette (px ÷ 16, ADR-0107), écrits piste par piste. */
const gabarit = (...pistes: readonly string[]) => pistes.join(' ');
const COLS_AGENTS = gabarit('minmax(0,1.4fr)', '8.25rem', '5.25rem', '8.25rem', '8.75rem', 'minmax(0,1fr)', '9.375rem');
const COLS_AGENTS_ETROIT = gabarit('minmax(0,1.4fr)', '7rem', '3rem', '7rem', '7.5rem', 'minmax(0,1fr)', '6.875rem');
const COLS_REGISTRE = gabarit('5.25rem', 'minmax(0,1.2fr)', 'minmax(0,1.1fr)', '9.375rem', '7.25rem', '6rem', 'minmax(0,0.9fr)', '2.25rem');
const COLS_REGISTRE_ETROIT = gabarit('4rem', 'minmax(0,1.1fr)', 'minmax(0,1.3fr)', '9.375rem', '6.25rem', '5.5rem', 'minmax(0,0.8fr)', '2.25rem');

type Geste = { readonly sorte: 'payer' | 'annuler'; readonly e: CommissionEntry };

function nomDe(r: PointDUnBeneficiaire | undefined, id: number, repli: (id: number) => string): string {
  return r?.beneficiary.name?.trim() || repli(id);
}

function ChoixDuMois({ mois, onChange }: { readonly mois: string; readonly onChange: (mois: string) => void }) {
  const t = useTranslations('commissions.admin');
  const f = useFormatteurs();
  const nommer = (m: string) => {
    const texte = f.date(dateDuMois(m), { month: 'long', year: 'numeric', timeZone: 'UTC' });
    return texte.charAt(0).toLocaleUpperCase(f.locale) + texte.slice(1);
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('choisirMois', { mois: nommer(mois) })}
        className="inline-flex h-9 flex-none items-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-card px-3 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring"
      >
        {nommer(mois)}
        <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
        {derniersMois(jourDeDakar().slice(0, 7)).map((m) => (
          <DropdownMenuItem key={m} onClick={() => onChange(m)}>
            <Check className={cn('size-4 flex-none', m === mois ? 'text-foreground' : 'invisible')} aria-hidden="true" />
            {nommer(m)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ChoixDuBeneficiaire({
  agent,
  points,
  onChange,
  repli,
}: {
  readonly agent: number | null;
  readonly points: readonly PointDUnBeneficiaire[];
  readonly onChange: (id: number | null) => void;
  readonly repli: (id: number) => string;
}) {
  const t = useTranslations('commissions.admin');
  const choisi = agent !== null ? nomDe(points.find((p) => p.beneficiary.id === agent), agent, repli) : null;
  const libelle = choisi ? t('beneficiaire', { nom: choisi }) : t('beneficiaireTous');
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={libelle}
        data-choisi={agent !== null}
        className="ml-auto inline-flex h-8 max-w-full flex-none items-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-card px-3 text-ui font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring data-[choisi=true]:border-foreground"
      >
        <span className="min-w-0 truncate">{libelle}</span>
        <ChevronDown className="size-4 flex-none text-muted-foreground" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
        <DropdownMenuItem onClick={() => onChange(null)}>
          <Check className={cn('size-4 flex-none', agent === null ? 'text-foreground' : 'invisible')} aria-hidden="true" />
          {t('tous')}
        </DropdownMenuItem>
        {points.map((p) => (
          <DropdownMenuItem key={p.beneficiary.id} onClick={() => onChange(p.beneficiary.id)}>
            <Check className={cn('size-4 flex-none', p.beneficiary.id === agent ? 'text-foreground' : 'invisible')} aria-hidden="true" />
            {nomDe(p, p.beneficiary.id, repli)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function VueAdmin({ telephone }: { readonly telephone: boolean }) {
  const t = useTranslations('commissions');
  const f = useFormatteurs();
  const l = useLectureDeCommission();
  const { user } = useAuth();
  const { can: peutSolder } = useCan('payouts.approve');
  const { can: peutExporter } = useCan('reports.export');
  const { params, remplacer } = useVueDansLUrl();
  const aujourdhui = jourDeDakar();
  const vue = vueDesCommissions(params, aujourdhui);
  const statut = statutAffiche(vue);
  const anneeDuMois = vue.mois.slice(0, 4);
  const point = useCommissionSummary(vue.mois, anneeDuMois);
  const points = point.data?.data ?? [];
  const [geste, setGeste] = useState<Geste | null>(null);

  const comptes = useComptesParStatut({ beneficiaryId: vue.agent ?? undefined, enabled: vue.lignes });
  const liste = useCommissionEntries({ status: statut ?? undefined, beneficiaryId: vue.agent ?? undefined, page: vue.page, enabled: vue.lignes });
  const payees = useCommissionEntries({
    status: 'paid',
    beneficiaryId: vue.agent ?? undefined,
    sort: '-paid_at',
    perPage: 3,
    enabled: telephone && vue.agent !== null && statut === 'due',
  });

  const repli = (id: number) => t('admin.sansNom', { id });
  const moi = user?.id ?? null;
  const peutGererLigne = (e: CommissionEntry) => peutSolder && e.status === 'due' && e.beneficiary_id !== moi;
  const peutSolderAgent = (id: number) => peutSolder && id !== moi;
  const du = points.reduce((s, p) => s + p.due_amount, 0);
  const agentsDus = points.filter((p) => p.due_amount > 0).length;
  const payeMois = points.reduce((s, p) => s + p.paid_month, 0);
  const payeAnnee = points.reduce((s, p) => s + p.paid_year, 0);
  const lignesDues = points.reduce((s, p) => s + p.due_count, 0);
  const nomDuMois = f.date(dateDuMois(vue.mois), { month: 'long', timeZone: 'UTC' });
  const moisCourt = f.date(dateDuMois(vue.mois), { month: 'short', timeZone: 'UTC' });
  const resume = agentsDus > 0 ? t('admin.dusA', { count: agentsDus, mois: nomDuMois, paye: f.montantCourt(payeMois) }) : t('admin.rienDu', { mois: nomDuMois, paye: f.montantCourt(payeMois) });
  const bornes = bornesDuMois(vue.mois);
  const lienExport = peutExporter ? buildExportUrl({ entity: 'commissions', format: 'csv', from: bornes.du, to: bornes.au }) : null;
  const solderPoint = vue.solder !== null ? points.find((p) => p.beneficiary.id === vue.solder) : undefined;
  const agentPoint = vue.agent !== null ? points.find((p) => p.beneficiary.id === vue.agent) : undefined;
  const ouvrirSolde = (id: number) => remplacer({ solder: id });
  const fermerSolde = () => remplacer({ solder: null });
  const surStatut = (s: typeof statut) => remplacer({ status: statutAEcrire(s), page: null });
  const allerVers = (lignes: boolean) => remplacer({ vue: lignes ? 'lignes' : null, agent: null, status: null, page: null });

  const solde =
    vue.solder !== null && peutSolderAgent(vue.solder) ? (
      <Solder beneficiaire={{ id: vue.solder, nom: nomDe(solderPoint, vue.solder, repli) }} bureau={!telephone} onFermer={fermerSolde} />
    ) : null;
  const gestes = (
    <>
      {geste?.sorte === 'payer' ? <MarquerPayee e={geste.e} bureau={!telephone} onFermer={() => setGeste(null)} /> : null}
      {geste?.sorte === 'annuler' ? <AnnulerLaCommission e={geste.e} bureau={!telephone} onFermer={() => setGeste(null)} /> : null}
    </>
  );
  const menu = (e: CommissionEntry, className?: string) =>
    peutGererLigne(e) ? (
      <MenuDeLigne e={e} className={className} onPayer={() => setGeste({ sorte: 'payer', e })} onAnnuler={() => setGeste({ sorte: 'annuler', e })} />
    ) : null;
  const bascule = (pleine?: boolean) => (
    <Bascule
      pleine={pleine}
      libelle={t('admin.affichage')}
      actif={vue.lignes ? 'lignes' : 'agents'}
      onChange={(v) => allerVers(v === 'lignes')}
      options={[
        { valeur: 'agents', libelle: t('admin.parAgent') },
        { valeur: 'lignes', libelle: t('admin.parLigne') },
      ]}
    />
  );
  const lignes = liste.data?.data ?? [];

  /* ════════════════════════════════ Téléphone ════════════════════════════════ */
  if (telephone) {
    if (solde) return solde;

    if (vue.agent !== null) {
      const nom = nomDe(agentPoint, vue.agent, repli);
      return (
        <PagePleineLargeur data-slot="commissions-agent-admin" className="pb-8">
          <DeclarerEnTete forme="detail" titre={nom} repli="/app/commissions" />
          <div className="px-4 pt-5">
            <p className="font-display text-3xl font-semibold leading-none tracking-titre tabular-nums">{f.montantCourt(agentPoint?.due_amount ?? 0)}</p>
            <p className="mt-2 text-sm text-muted-foreground">{t('admin.dusLignes', { count: agentPoint?.due_count ?? 0, paye: f.montantCourt(agentPoint?.paid_year ?? 0) })}</p>
          </div>
          <PucesDeStatut className="pt-4" statut={statut} comptes={comptes} onChange={surStatut} />
          <div className="px-4">
            <ListeDesCartes chargement={liste.isLoading} lignes={lignes} menu={(e) => menu(e, '-mr-2')} />
            <PaginationDuTelephone meta={liste.data?.meta} onPage={(p) => remplacer({ page: p })} />
            {statut === 'due' && (payees.data?.data.length ?? 0) > 0 ? (
              <>
                <Rubrique
                  className="mt-6"
                  action={
                    <button type="button" onClick={() => surStatut('paid')} className="rounded-sm text-sm font-medium text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring">
                      {t('agent.toutVoir')}
                    </button>
                  }
                >
                  {t('agent.dernieresPayees')}
                </Rubrique>
                <ListeDesCartes chargement={false} lignes={payees.data?.data ?? []} />
              </>
            ) : null}
          </div>
          {peutSolderAgent(vue.agent) && (agentPoint?.due_amount ?? 0) > 0 ? (
            <BarreDAction taille="action">
              <Button type="button" size="xl" onClick={() => ouvrirSolde(vue.agent as number)}>
                {t('admin.solderMontant', { montant: f.montantCourt(agentPoint?.due_amount ?? 0) })}
              </Button>
            </BarreDAction>
          ) : null}
          {gestes}
        </PagePleineLargeur>
      );
    }

    return (
      <PagePleineLargeur data-slot="commissions-admin" className="pb-8">
        <DeclarerEnTete titre={t('titreAdmin')} />
        <div className="px-4 pt-5">
          <p className="font-display text-3xl font-semibold leading-none tracking-titre tabular-nums">{f.montantCourt(du)}</p>
          <p className="mt-2 text-sm text-muted-foreground">{resume}</p>
          <div className="mt-4">{bascule(true)}</div>
        </div>
        {vue.lignes ? (
          <>
            <PucesDeStatut className="pt-3" statut={statut} comptes={comptes} onChange={surStatut} />
            <div className="px-4">
              <ListeDesCartes chargement={liste.isLoading} lignes={lignes} menu={(e) => menu(e, '-mr-2')} />
              <PaginationDuTelephone meta={liste.data?.meta} onPage={(p) => remplacer({ page: p })} />
            </div>
          </>
        ) : (
          <div className="px-4 pt-4">
            {point.isLoading ? (
              <ListeEnAttente />
            ) : points.length === 0 ? (
              <AucuneCommission />
            ) : (
              <Carte as="ul" className="divide-y divide-border">
                {points.map((p) => (
                  <li key={p.beneficiary.id}>
                    <CarteDAgent p={p} nom={nomDe(p, p.beneficiary.id, repli)} solder={peutSolderAgent(p.beneficiary.id) && p.due_amount > 0 ? () => ouvrirSolde(p.beneficiary.id) : null} />
                  </li>
                ))}
              </Carte>
            )}
            {lienExport ? (
              <a href={lienExport} download aria-label={t('admin.exporterAria', { mois: nomDuMois })} className="mx-auto mt-5 flex w-fit items-center justify-center gap-1.5 rounded-sm text-sm font-medium text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring">
                <Download className="size-4" aria-hidden="true" /> {t('admin.exporterMois')}
              </a>
            ) : null}
          </div>
        )}
        {gestes}
      </PagePleineLargeur>
    );
  }

  /* ════════════════════════════════ Bureau ════════════════════════════════ */
  return (
    <div className="space-y-6">
      <PageHeader
        title={t('titreAdmin')}
        description={`${f.montantCourt(du)} ${resume}`}
        actions={
          <>
            <ChoixDuMois mois={vue.mois} onChange={(m) => remplacer({ mois: m === aujourdhui.slice(0, 7) ? null : m })} />
            {lienExport ? (
              <a href={lienExport} download aria-label={t('admin.exporterAria', { mois: nomDuMois })} className={buttonVariants({ variant: 'outline' })}>
                <Download className="size-4" strokeWidth={1.75} aria-hidden="true" /> {t('admin.exporter')}
              </a>
            ) : null}
          </>
        }
      />
      {vue.lignes ? (
        <div>
          <div className="flex items-center gap-2 max-xl:flex-wrap">
            {bascule()}
            <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
            <PucesDeStatut taille="sm" toutesDAbord statut={statut} comptes={comptes} onChange={surStatut} />
            <ChoixDuBeneficiaire agent={vue.agent} points={points} repli={repli} onChange={(id) => remplacer({ agent: id, vue: id === null ? 'lignes' : null, page: null })} />
          </div>
          {liste.isLoading ? (
            <div className="mt-4">
              <ListeEnAttente />
            </div>
          ) : lignes.length === 0 ? (
            <AucuneCommission />
          ) : (
            <Carte className="mt-4 overflow-hidden">
              <div className="max-xl:overflow-x-auto">
                <div className="min-w-[56.25rem]" role="table" aria-label={t('tableLignes')}>
                  <Rangee cols={COLS_REGISTRE} colsEtroit={COLS_REGISTRE_ETROIT} entete>
                    <span role="columnheader">{t('columns.earnedAt')}</span>
                    <span role="columnheader">{t('colonnes.bien')}</span>
                    <span role="columnheader">{t('columns.beneficiary')}</span>
                    <span role="columnheader">{t('columns.share')}</span>
                    <span role="columnheader" className="text-right">
                      {t('columns.amount')}
                    </span>
                    <span role="columnheader">{t('columns.status')}</span>
                    <span role="columnheader">{t('colonnes.paiement')}</span>
                    <span role="columnheader">
                      <span className="sr-only">{t('columns.actions')}</span>
                    </span>
                  </Rangee>
                  {lignes.map((e) => {
                    const nom = e.beneficiary?.name?.trim() || repli(e.beneficiary_id);
                    const paiement =
                      e.status === 'paid' ? [l.jour(e.paid_at), l.moyen(e.payment_method)].filter(Boolean).join(' · ') : e.status === 'cancelled' ? l.motif(e, true) : null;
                    return (
                      <Rangee key={e.id} cols={COLS_REGISTRE} colsEtroit={COLS_REGISTRE_ETROIT}>
                        <span role="cell" className="text-encre-douce tabular-nums">
                          {l.jour(e.earned_at)}
                        </span>
                        <span role="cell" className="min-w-0 leading-tight">
                          <LienDuBail e={e} className="block truncate font-medium">
                            {l.titreDuBien(e)}
                          </LienDuBail>
                          {l.quartier(e) ? <span className="mt-0.5 block truncate text-ui text-muted-foreground">{l.quartier(e)}</span> : null}
                        </span>
                        <span role="cell" className="flex min-w-0 items-center gap-2.5">
                          <AvatarDeBeneficiaire nom={nom} taille="28" />
                          <span className="min-w-0 leading-tight">
                            <span className="block truncate font-medium">{nom}</span>
                            <span className="mt-0.5 block truncate text-ui text-muted-foreground">{l.Role(e)}</span>
                          </span>
                        </span>
                        <span role="cell" className="text-encre-douce tabular-nums">
                          {l.part(e)}
                        </span>
                        <span role="cell" className={cn('text-right font-semibold tabular-nums', e.status === 'cancelled' && 'font-normal text-muted-foreground line-through')}>
                          {l.montant(e)}
                        </span>
                        <span role="cell">
                          <StatutDeCommission statut={e.status} />
                        </span>
                        <span role="cell" className="truncate text-ui text-muted-foreground">
                          {paiement ?? '—'}
                        </span>
                        <span role="cell" className="flex justify-end">
                          {menu(e, 'size-8')}
                        </span>
                      </Rangee>
                    );
                  })}
                </div>
              </div>
              <PiedDeTableau meta={liste.data?.meta} onPage={(p) => remplacer({ page: p })} />
            </Carte>
          )}
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-2">
            {bascule()}
            <span className="ml-auto text-ui text-muted-foreground">{t('admin.agentsTri', { count: points.length })}</span>
          </div>
          {point.isLoading ? (
            <div className="mt-4">
              <ListeEnAttente />
            </div>
          ) : points.length === 0 ? (
            <AucuneCommission />
          ) : (
            <Carte className="mt-4 overflow-hidden">
              <div className="max-xl:overflow-x-auto">
                <div className="min-w-[55rem]" role="table" aria-label={t('tableAgents')}>
                  <Rangee cols={COLS_AGENTS} colsEtroit={COLS_AGENTS_ETROIT} entete>
                    <span role="columnheader">{t('colonnes.agent')}</span>
                    <span role="columnheader" className="text-right">
                      {t('colonnes.du')}
                    </span>
                    <span role="columnheader" className="text-right">
                      {t('colonnes.lignes')}
                    </span>
                    <span role="columnheader" className="text-right">
                      {t('colonnes.payeMois', { mois: moisCourt })}
                    </span>
                    <span role="columnheader" className="text-right">
                      {t('colonnes.payeAnnee', { annee: anneeDuMois })}
                    </span>
                    <span role="columnheader">{t('colonnes.dernierPaiement')}</span>
                    <span role="columnheader">
                      <span className="sr-only">{t('columns.actions')}</span>
                    </span>
                  </Rangee>
                  {points.map((p) => {
                    const nom = nomDe(p, p.beneficiary.id, repli);
                    return (
                      <Rangee key={p.beneficiary.id} cols={COLS_AGENTS} colsEtroit={COLS_AGENTS_ETROIT} className="min-h-[3.75rem]">
                        <span role="cell" className="flex min-w-0 items-center gap-2.5">
                          <AvatarDeBeneficiaire nom={nom} taille="32" />
                          <span className="min-w-0 leading-tight">
                            <span className="block truncate font-medium">{nom}</span>
                            <span className="mt-0.5 block truncate text-ui text-muted-foreground">
                              {p.due_amount > 0 && p.oldest_due_earned_at ? t('agent.plusAncienne', { date: f.jourMois(p.oldest_due_earned_at) }) : t('admin.aJourCourt')}
                            </span>
                          </span>
                        </span>
                        <span role="cell" className={cn('text-right tabular-nums', p.due_amount > 0 ? 'text-corps font-semibold' : 'text-muted-foreground')}>
                          {p.due_amount > 0 ? f.montantCourt(p.due_amount) : '—'}
                        </span>
                        <span role="cell" className="text-right text-encre-douce tabular-nums">
                          {p.due_count || '—'}
                        </span>
                        <span role="cell" className="text-right text-encre-douce tabular-nums">
                          {p.paid_month ? f.montantCourt(p.paid_month) : '—'}
                        </span>
                        <span role="cell" className="text-right text-encre-douce tabular-nums">
                          {f.montantCourt(p.paid_year)}
                        </span>
                        <span role="cell" className="truncate text-encre-douce">
                          {p.last_paid ? [f.jourMois(p.last_paid.at), l.moyen(p.last_paid.method)].filter(Boolean).join(' · ') : '—'}
                        </span>
                        <span role="cell" className="flex items-center justify-end gap-1">
                          {peutSolderAgent(p.beneficiary.id) && p.due_amount > 0 ? (
                            <Button type="button" size="sm" aria-label={t('admin.solderAria', { nom })} onClick={() => ouvrirSolde(p.beneficiary.id)}>
                              {t('admin.solder')}
                            </Button>
                          ) : null}
                          <Link
                            href={`?agent=${p.beneficiary.id}`}
                            scroll={false}
                            aria-label={t('admin.lignesDe', { nom })}
                            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring"
                          >
                            <FileText className="size-4" strokeWidth={1.75} aria-hidden="true" />
                          </Link>
                        </span>
                      </Rangee>
                    );
                  })}
                  <Rangee cols={COLS_AGENTS} colsEtroit={COLS_AGENTS_ETROIT} className="min-h-12 bg-muted/40 font-semibold">
                    <span role="cell">{t('admin.total')}</span>
                    <span role="cell" className="text-right tabular-nums">
                      {f.montantCourt(du)}
                    </span>
                    <span role="cell" className="text-right tabular-nums">
                      {lignesDues}
                    </span>
                    <span role="cell" className="text-right tabular-nums">
                      {f.montantCourt(payeMois)}
                    </span>
                    <span role="cell" className="text-right tabular-nums">
                      {f.montantCourt(payeAnnee)}
                    </span>
                    <span role="cell" />
                    <span role="cell" />
                  </Rangee>
                </div>
              </div>
            </Carte>
          )}
        </div>
      )}
      {solde}
      {gestes}
    </div>
  );
}

/** Une ligne par agent (téléphone) : avatar, nom, ce qu'on lui doit ou « À jour », « Solder ». */
function CarteDAgent({ p, nom, solder }: { readonly p: PointDUnBeneficiaire; readonly nom: string; readonly solder: (() => void) | null }) {
  const t = useTranslations('commissions.admin');
  const f = useFormatteurs();
  return (
    <div className="relative flex min-h-[4.75rem] items-center gap-2.5 px-4 py-3">
      <Link
        href={`?agent=${p.beneficiary.id}`}
        scroll={false}
        aria-label={t('ouvrirAgent', { nom })}
        className="absolute inset-0 rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring"
      />
      <AvatarDeBeneficiaire nom={nom} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-corps font-semibold leading-tight">{nom}</p>
        {p.due_amount > 0 ? (
          <p className="mt-1 truncate text-ui text-muted-foreground">
            <span className="text-corps font-semibold text-foreground tabular-nums">{f.montantCourt(p.due_amount)}</span> · {t('lignes', { count: p.due_count })}
          </p>
        ) : (
          <p className="mt-1 inline-flex items-center gap-1 text-ui font-medium text-success">
            <Check className="size-3.5" strokeWidth={2.25} aria-hidden="true" />
            {p.last_paid ? t('aJourLe', { date: f.jourMois(p.last_paid.at) }) : t('aJour')}
          </p>
        )}
      </div>
      {solder ? (
        <Button type="button" className="relative z-10 px-3.5" aria-label={t('solderAria', { nom })} onClick={solder}>
          {t('solder')}
        </Button>
      ) : null}
      <ChevronRight className="size-4 flex-none text-muted-foreground" aria-hidden="true" />
    </div>
  );
}

function ListeDesCartes({ chargement, lignes, menu }: { readonly chargement: boolean; readonly lignes: readonly CommissionEntry[]; readonly menu?: (e: CommissionEntry) => React.ReactNode }) {
  if (chargement) return <ListeEnAttente />;
  if (lignes.length === 0) return <AucuneCommission />;
  return (
    <Carte as="ul" className="divide-y divide-border">
      {lignes.map((e) => (
        <li key={e.id}>
          <CarteDeCommission e={e} menu={menu?.(e)} />
        </li>
      ))}
    </Carte>
  );
}
