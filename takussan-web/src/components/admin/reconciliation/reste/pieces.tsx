'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowLeftRight, Check, Landmark, Search, TriangleAlert, Unlink, Zap } from 'lucide-react';

import { StatusBadge } from '@/components/console';
import { EmptyState } from '@/components/feedback';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { initialesDuNom } from '@/components/admin/finances/argent/encaissement';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { cn } from '@/lib/utils';
import type { PendingPayment, ReconciliationOverview } from '@/types/reconciliation';

import { confianceEnFraction, enNombre } from '../format';

/**
 * TCK-2675 — les pièces de « Reste à rapprocher » (maquette `app-rapprochement`, approche C) : les
 * compteurs du mois, la confiance d'une suggestion, une carte (téléphone) et une rangée (bureau) par
 * paiement, les paiements en ligne connectés.
 *
 * **Chaque phrase est calculée sur les données** : la maquette dit « 812 confirmés par Wave et
 * Orange Money » et « espèces et virements » ; le produit nomme les fournisseurs et les moyens que
 * l'API compte ce mois-là, et se tait sur ce qu'elle ne compte pas.
 */

/** Le nom d'un moyen de paiement ou d'un fournisseur : `payments.methods`, sinon la clé lisible. */
/**
 * Le nom d'un moyen de paiement, sous la forme que la maquette lui donne selon la place :
 * - `nom` — « Virement bancaire », « Wave » (le nom du produit) ;
 * - `court` — sur une rangée ou une carte : « Virement · 9 nov. » ;
 * - `pluriel` — une pastille, un compte : « Virements 13 » ;
 * - `phrase` — dans une phrase : « espèces et virements ».
 * Une forme absente retombe sur le nom (les passerelles, « Wave », gardent leur majuscule).
 */
export type FormeDuMoyen = 'nom' | 'court' | 'pluriel' | 'phrase';

export function useNomDuMoyen(forme: FormeDuMoyen = 'nom'): (cle: string) => string {
  const t = useTranslations('payments.methods');
  const tForme = useTranslations('admin.reconciliation.reste.moyens');
  return (cle) => {
    if (forme !== 'nom' && tForme.has(`${forme}.${cle}`)) return tForme(`${forme}.${cle}`);
    return t.has(cle) ? t(cle) : cle.replace(/_/g, ' ');
  };
}

/** Les clés d'une table de comptes, la plus grande d'abord (l'API trie déjà ; on ne s'y fie pas). */
export function clesParCompte(table: Record<string, number> | null | undefined): string[] {
  return Object.entries(table ?? {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([cle]) => cle);
}

/** « Wave et Orange Money » ; au-delà de deux, « Wave, Espèces et 3 autres » (place d'un demi-écran). */
export function useListeCourte(): (noms: readonly string[]) => string {
  const t = useTranslations('admin.reconciliation.reste.compteurs');
  const f = useFormatteurs();
  return (noms) => {
    const liste = new Intl.ListFormat(f.locale, { type: 'conjunction' });
    if (noms.length <= 2) return liste.format(noms);
    return t('etAutres', { liste: noms.slice(0, 2).join(', '), count: noms.length - 2 });
  };
}

/** Le mois en toutes lettres (« Novembre » en tête de phrase). */
export function useNomDuMois(): (periode: string, enTete?: boolean) => string {
  const f = useFormatteurs();
  // `enTete` : capitale en tête de phrase ; sinon le nom tel que la langue l'écrit au fil du texte
  // (« en novembre », « in November »).
  return (periode, enTete = true) => {
    const texte = f.date(`${periode}-01T12:00:00Z`, { month: 'long', timeZone: 'UTC' });
    return enTete ? texte.charAt(0).toLocaleUpperCase(f.locale) + texte.slice(1) : texte;
  };
}

/** La confiance d'une ligne proposée : verte dès 90 %, ambre dès 75 %, neutre en dessous. */
export function Confiance({ valeur, className }: { readonly valeur: number | string | null; readonly className?: string }) {
  const f = useFormatteurs();
  const fraction = confianceEnFraction(valeur);
  if (fraction === null) return null;
  const ton = fraction >= 0.9 ? 'success' : fraction >= 0.75 ? 'attention' : 'neutral';
  return <StatusBadge tone={ton} label={f.pourcentage(fraction)} className={className} />;
}

export function CompteursDuReste({
  apercu,
  bureau = false,
  enAttente = false,
}: {
  readonly apercu: ReconciliationOverview;
  readonly bureau?: boolean;
  /** Aucun relevé importé : « En attente d'un relevé » à la place d'« À rapprocher ». */
  readonly enAttente?: boolean;
}) {
  const t = useTranslations('admin.reconciliation.reste.compteurs');
  const f = useFormatteurs();
  const nomDuMoyen = useNomDuMoyen();
  const auPluriel = useNomDuMoyen('pluriel');
  const enPhrase = useNomDuMoyen('phrase');
  const listeCourte = useListeCourte();
  const nomDuMois = useNomDuMois();

  const auto = apercu.confirmed_automatically;
  const reste = apercu.to_reconcile;
  const fournisseurs = clesParCompte(auto.by_provider);
  const moyens = clesParCompte(reste.by_method);
  const detail = (cles: string[], table: Record<string, number>, nom: (cle: string) => string) => cles.map((c) => `${nom(c)} ${f.nombre(table[c] ?? 0)}`).join(' · ');

  const total = apercu.payments_total;
  const dejaRapproches = auto.total + apercu.reconciled_manually;
  const part = total > 0 ? dejaRapproches / total : 0;
  const mois = nomDuMois(apercu.period);

  const chiffre = cn('mt-1 font-display leading-none font-semibold tracking-titre tabular-nums', bureau ? 'text-affiche-32' : 'text-affiche-28');
  const sousChiffre = 'mt-1.5 text-ui leading-snug text-muted-foreground';

  return (
    <section className={cn('rounded-xl border border-border bg-card', bureau ? 'p-5' : 'p-4')} data-testid="compteurs-du-reste">
      <div className={cn('grid grid-cols-2', bureau ? 'gap-8' : 'gap-4')}>
        <div>
          <p className="flex items-center gap-1.5 text-ui font-medium text-success">
            <Zap className="size-3.5" aria-hidden="true" /> {t('auto')}
          </p>
          <p className={chiffre} data-testid="compte-auto">
            {f.nombre(auto.total)}
          </p>
          <p className={sousChiffre}>
            {fournisseurs.length === 0
              ? t('aucun')
              : bureau
                ? detail(fournisseurs, auto.by_provider, nomDuMoyen)
                : t('par', { liste: listeCourte(fournisseurs.map(nomDuMoyen)) })}
          </p>
        </div>
        <div>
          <p className="flex items-center gap-1.5 text-ui font-medium text-encre-douce">
            <ArrowLeftRight className="size-3.5" aria-hidden="true" /> {enAttente ? t('enAttente') : t('aRapprocher')}
          </p>
          <p className={chiffre} data-testid="compte-reste">
            {f.nombre(reste.total)}
          </p>
          {moyens.length > 0 ? (
            <p className={sousChiffre}>{bureau ? detail(moyens, reste.by_method, auPluriel) : listeCourte(moyens.map(enPhrase))}</p>
          ) : null}
        </div>
      </div>
      {total > 0 ? <Progress value={Math.round(part * 100)} ton="success" taille="grand" aria-label={t('jauge')} className="mt-4" /> : null}
      <p className="mt-2 text-ui text-muted-foreground" data-testid="phrase-du-mois">
        {total > 0
          ? t.rich('phrase', {
              mois,
              total,
              pct: f.pourcentage(part),
              // « sans relevé » ne vaut que si tout ce qui est rapproché l'a été par une passerelle.
              sansReleve: auto.total > 0 && apercu.reconciled_manually === 0 ? 'oui' : 'non',
              fort: (morceau) => <span className="font-medium text-foreground">{morceau}</span>,
            })
          : t('phraseVide', { mois })}
      </p>
    </section>
  );
}

/** Ce qu'une rangée et une carte savent faire ; la page tient l'état en vol. */
export interface GestesDuPaiement {
  readonly onConfirmer: (p: PendingPayment) => void;
  readonly onDelier: (p: PendingPayment) => void;
  readonly onChercher: (p: PendingPayment) => void;
  /** Un geste est en vol sur ce paiement (ou un « Confirmer les N ») : ses boutons attendent. */
  readonly enVol: (p: PendingPayment) => boolean;
  /** Le nom de banque du relevé d'une ligne proposée, lu dans la liste des relevés. */
  readonly banqueDuReleve: (statementId: number) => string | null;
}

function usePaiement(p: PendingPayment) {
  const t = useTranslations('admin.reconciliation.reste');
  const f = useFormatteurs();
  const nomDuMoyen = useNomDuMoyen('court');
  const qui = p.payer?.name?.trim() || t('carte.sansPayeur');
  return {
    qui,
    initiales: p.payer?.name ? initialesDuNom(p.payer.name) : '·',
    objet: p.property?.title ?? null,
    montant: f.montantCourt(enNombre(p.amount) ?? 0, p.currency ?? 'XOF'),
    moyen: p.payment_method ? nomDuMoyen(p.payment_method) : null,
    date: p.paid_at ? f.jourMois(p.paid_at) : null,
  };
}

/** « CBAO · 9 nov. » : la banque du relevé et le jour de la ligne (le jour seul si la banque n'est pas nommée). */
function useBanqueEtJour(ligne: PendingPayment['suggested_line'], gestes: GestesDuPaiement): string | null {
  const f = useFormatteurs();
  if (!ligne) return null;
  const morceaux = [gestes.banqueDuReleve(ligne.statement_id), ligne.date ? f.jourMois(`${ligne.date}T12:00:00Z`) : null].filter(Boolean);
  return morceaux.length ? morceaux.join(' · ') : null;
}

/** Une carte par paiement déclaré, au téléphone. */
export function CarteDuReste({ p, gestes }: { readonly p: PendingPayment; readonly gestes: GestesDuPaiement }) {
  const t = useTranslations('admin.reconciliation.reste');
  const v = usePaiement(p);
  const ligne = p.suggested_line;
  const banque = useBanqueEtJour(ligne, gestes);
  const occupe = gestes.enVol(p);

  return (
    <article className="rounded-xl border border-border bg-card p-4" data-testid={`reste-${p.type}-${p.id}`}>
      <div className="flex items-start gap-3">
        <Avatar size="40" aria-hidden="true">
          <AvatarFallback>{v.initiales}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p className="min-w-0 flex-1 truncate text-corps leading-tight font-semibold">{v.qui}</p>
            <p className="flex-none text-corps leading-tight font-semibold tabular-nums">{v.montant}</p>
          </div>
          {v.objet ? <p className="mt-0.5 truncate text-ui text-muted-foreground">{v.objet}</p> : null}
          {v.moyen && v.date ? <p className="mt-0.5 text-ui text-muted-foreground">{t('carte.declare', { moyen: v.moyen, date: v.date })}</p> : null}
        </div>
      </div>
      {ligne ? (
        <>
          <div className="mt-3 flex items-center gap-2.5 rounded-lg bg-muted/70 px-3 py-2.5">
            <Landmark className="size-4 flex-none text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="text-ui text-muted-foreground">{banque ? t('carte.surLeReleve', { banque }) : t('carte.surUnReleve')}</p>
              <p className="mt-1 truncate font-mono text-xs text-encre-douce">{ligne.label}</p>
            </div>
            <Confiance valeur={ligne.confidence} />
          </div>
          <div className="mt-3 flex gap-2">
            <Button size="lg" className="flex-1 text-corps font-semibold" disabled={occupe} onClick={() => gestes.onConfirmer(p)}>
              <Check className="size-4" aria-hidden="true" /> {t('actions.confirmer')}
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="px-4 text-corps font-semibold"
              disabled={occupe}
              aria-label={t('actions.chercherPour', { qui: v.qui })}
              onClick={() => gestes.onChercher(p)}
            >
              {t('actions.autreLigne')}
            </Button>
          </div>
        </>
      ) : (
        <div className="mt-3 flex items-center gap-2.5 rounded-lg bg-warning/12 px-3 py-2.5 text-ui">
          <TriangleAlert className="size-4 flex-none text-warning" strokeWidth={1.75} aria-hidden="true" />
          <p className="min-w-0 flex-1 leading-snug">{t('carte.aucunDepot')}</p>
          <button
            type="button"
            className="flex-none font-medium text-primary hover:underline disabled:opacity-50"
            disabled={occupe}
            aria-label={t('actions.chercherPour', { qui: v.qui })}
            onClick={() => gestes.onChercher(p)}
          >
            {t('actions.chercher')}
          </button>
        </div>
      )}
    </article>
  );
}

/**
 * Les colonnes du tableau du bureau : à 1440, la confiance a sa colonne ; en dessous, elle rejoint
 * la ligne de banque (`COLS_RESTE_ETROIT` de la maquette). Les pistes fixes en `rem` NUS : la
 * maquette les écrit en px, que la densité du bureau (×0,9 sur `--spacing`) ne réduit pas. La
 * colonne des gestes passe de 148 à 168 px : elle porte « Délier » en plus (le ticket).
 */
export const COLONNES_DU_RESTE =
  'grid-cols-[minmax(0,1.1fr)_7.25rem_minmax(0,1fr)_10.5rem] min-[90rem]:grid-cols-[minmax(0,1fr)_7.25rem_minmax(0,1.05fr)_3.75rem_10.5rem]';

export function EnTeteDuTableau() {
  const t = useTranslations('admin.reconciliation.reste.colonnes');
  return (
    <div role="row" className={cn('grid h-10 items-center gap-x-4 px-4 text-xs font-medium text-muted-foreground', COLONNES_DU_RESTE)}>
      <span role="columnheader">{t('paiement')}</span>
      <span role="columnheader" className="text-right">
        {t('montant')}
      </span>
      <span role="columnheader">
        {t('ligne')}
        <span className="min-[90rem]:hidden">{t('ligneEtConfiance')}</span>
      </span>
      <span role="columnheader" className="hidden min-[90rem]:block">
        {t('confiance')}
      </span>
      <span role="columnheader">
        <span className="sr-only">{t('actions')}</span>
      </span>
    </div>
  );
}

/** Une rangée par paiement déclaré, au bureau. */
export function RangeeDuReste({ p, gestes }: { readonly p: PendingPayment; readonly gestes: GestesDuPaiement }) {
  const t = useTranslations('admin.reconciliation.reste');
  const v = usePaiement(p);
  const ligne = p.suggested_line;
  const banque = useBanqueEtJour(ligne, gestes);
  const occupe = gestes.enVol(p);

  return (
    <div
      role="row"
      className={cn('grid min-h-[4rem] items-center gap-x-4 border-t border-border px-4 py-2 text-sm', COLONNES_DU_RESTE)}
      data-testid={`reste-${p.type}-${p.id}`}
    >
      <span role="cell" className="min-w-0 leading-tight">
        <span className="block truncate font-medium">{v.qui}</span>
        {v.objet ? <span className="mt-0.5 block truncate text-ui text-muted-foreground">{v.objet}</span> : null}
      </span>
      <span role="cell" className="text-right leading-tight">
        <span className="block font-semibold tabular-nums">{v.montant}</span>
        {v.moyen || v.date ? (
          <span className="mt-0.5 block text-ui text-muted-foreground">{[v.moyen, v.date].filter(Boolean).join(' · ')}</span>
        ) : null}
      </span>
      {ligne ? (
        <span role="cell" className="min-w-0 leading-tight">
          <span className="block truncate text-ui text-muted-foreground">{banque ?? t('carte.surUnReleve')}</span>
          <span className="mt-1 block truncate font-mono text-xs text-encre-douce">{ligne.label}</span>
          <span className="mt-1 block min-[90rem]:hidden">
            <Confiance valeur={ligne.confidence} />
          </span>
        </span>
      ) : (
        <span role="cell" className="flex items-center gap-1.5 text-ui leading-tight text-warning">
          <TriangleAlert className="size-3.5 flex-none" strokeWidth={1.75} aria-hidden="true" /> {t('carte.aucunDepotCourt')}
        </span>
      )}
      <span role="cell" className="hidden min-[90rem]:block">
        {ligne ? <Confiance valeur={ligne.confidence} /> : null}
      </span>
      <span role="cell" className="flex items-center justify-end gap-1">
        {ligne ? (
          <>
            <Button size="sm" disabled={occupe} onClick={() => gestes.onConfirmer(p)}>
              <Check className="size-3.5" aria-hidden="true" /> {t('actions.confirmer')}
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              className="text-muted-foreground"
              disabled={occupe}
              aria-label={t('actions.delierPour', { qui: v.qui })}
              title={t('actions.delier')}
              onClick={() => gestes.onDelier(p)}
            >
              <Unlink className="size-4" strokeWidth={1.75} aria-hidden="true" />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              className="text-muted-foreground"
              disabled={occupe}
              aria-label={t('actions.chercherPour', { qui: v.qui })}
              title={t('actions.chercher')}
              onClick={() => gestes.onChercher(p)}
            >
              <Search className="size-4" strokeWidth={1.75} aria-hidden="true" />
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" disabled={occupe} aria-label={t('actions.chercherPour', { qui: v.qui })} onClick={() => gestes.onChercher(p)}>
            <Search className="size-3.5" aria-hidden="true" /> {t('actions.chercher')}
          </Button>
        )}
      </span>
    </div>
  );
}

/** Une carte titrée de la colonne de droite (« Relevés importés », « Paiements en ligne »). */
export function CarteTitree({
  titre,
  action,
  children,
  className,
}: {
  readonly titre: ReactNode;
  readonly action?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <section className={cn('rounded-xl border border-border bg-card', className)}>
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <h2 className="min-w-0 flex-1 truncate text-corps font-semibold">{titre}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * « Paiements en ligne » : les fournisseurs de paiement **connectés** (intégrations actives, lues
 * à l'API) et ce qu'ils ont confirmé ce mois-ci. « Connecté » ne s'écrit que pour une intégration
 * active.
 */
export function PaiementsEnLigne({ fournisseurs, apercu }: { readonly fournisseurs: readonly string[] | null; readonly apercu: ReconciliationOverview | null }) {
  const t = useTranslations('admin.reconciliation.integrations');
  const nomDuMoyen = useNomDuMoyen();
  const nomDuMois = useNomDuMois();
  const mois = apercu ? nomDuMois(apercu.period, false) : null;
  // Les intégrations n'ont pas pu être lues : rien n'est affirmé, ni « Connecté » ni « aucun ».
  if (fournisseurs === null) return null;

  return (
    <CarteTitree
      titre={t('titre')}
      action={
        <Link href="/app/agency/integrations" className="flex-none text-sm font-medium text-primary hover:underline">
          {t('lien')}
        </Link>
      }
    >
      {fournisseurs.length === 0 ? (
        <EmptyState variant="nue" className="py-6" title={t('aucune')} />
      ) : (
        <ul className="divide-y divide-border px-4">
          {fournisseurs.map((cle) => (
            <li key={cle} className="flex items-center gap-2.5 py-2.5 text-sm">
              <span className="inline-flex size-7 flex-none items-center justify-center rounded-full bg-success/10 text-success">
                <Zap className="size-3.5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block font-medium">{nomDuMoyen(cle)}</span>
                {apercu && mois ? (
                  <span className="block text-ui text-muted-foreground">
                    {t('confirmes', { count: apercu.confirmed_automatically.by_provider[cle] ?? 0, mois })}
                  </span>
                ) : null}
              </span>
              <StatusBadge tone="success" label={t('connecte')} />
            </li>
          ))}
        </ul>
      )}
    </CarteTitree>
  );
}
