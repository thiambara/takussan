'use client';

import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { Check, TrendingDown, TrendingUp, Users } from 'lucide-react';

import { StatusBadge } from '@/components/console/StatusBadge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { FormAmountInput } from '@/components/forms/FormAmountInput';
import { FormError } from '@/components/forms/FormError';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { PuceDeFiltre } from '@/components/ui/puce-de-filtre';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/context/AuthContext';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { ApiError } from '@/lib/api';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { initialesDe } from '@/lib/identite';
import { useReviewLeaseRent, type LeaseWithRelations } from '@/lib/queries/leases';
import type { LeasePayment } from '@/types/lease';

import { aujourdhuiADakar } from './CartesDuBail';

/**
 * TCK-2645 (AC2) — « Réviser le loyer » : la feuille de la maquette (`app-baux` a-4, `CorpsRevision`)
 * à la place des deux boîtes de saisie du navigateur de l'ancienne fiche.
 *
 * Nouveau loyer (le montant qui se relit), l'écart au loyer actuel en franc et en pourcentage, le
 * plafond que l'API dit exécuter pour CE bail (`rent_review_cap_pct`), la date d'effet, le motif.
 * `PATCH /api/leases/{id}/rent` ; l'API reste seule juge (motif, plafond, statut) et ses refus
 * s'écrivent sous le champ qu'ils visent.
 *
 *  · « Passer outre le plafond » n'est offert que si l'API dit qu'elle l'accepterait
 *    (`abilities.rent_review_force`, lot 1) : un plafond FIGÉ au contrat ne se dépasse jamais.
 *  · « Prévenus » ne se promet qu'à qui l'API prévient (décision 9) : le locataire s'il a un
 *    compte (`NotifyTenantOfRentReview`), le bailleur s'il n'est pas l'auteur
 *    (`NotifyLandlordOfRentReview`).
 *  · Au bureau, la feuille est le panneau latéral de `FeuilleDuBas` (décision du porteur du
 *    2026-11-11), et non le dialogue centré de 520 px de la maquette : écart inscrit à la fiche.
 */

export type MotifDeRevision = 'indexation' | 'travaux' | 'accord';
const MOTIFS: readonly MotifDeRevision[] = ['indexation', 'travaux', 'accord'];
/** `RentReviewService::REASON_MIN`. */
const MOTIF_MIN = 5;

/** La date d'effet proposée : le début de la prochaine période de loyer encore due, sinon aujourd'hui. */
export function dateDEffetProposee(paiements: readonly LeasePayment[] | undefined, aujourdhui: string): string {
  const prochaine = (paiements ?? [])
    .filter((p) => p.payment_type === 'rent' && (p.status === 'pending' || p.status === 'late') && p.period_start.slice(0, 10) > aujourdhui)
    .map((p) => p.period_start.slice(0, 10))
    .sort()[0];
  return prochaine ?? aujourdhui;
}

/** La première échéance au nouveau loyer : celle que l'API réécrit (loyer en attente, période à partir de la date d'effet). */
export function premiereEcheanceRevisee(paiements: readonly LeasePayment[] | undefined, effet: string): string | null {
  return (
    (paiements ?? [])
      .filter((p) => p.payment_type === 'rent' && p.status === 'pending' && p.period_start.slice(0, 10) >= effet && p.due_date)
      .map((p) => (p.due_date as string).slice(0, 10))
      .sort()[0] ?? null
  );
}

function codeDErreur(erreur: unknown): string | undefined {
  if (!(erreur instanceof ApiError) || !erreur.data || typeof erreur.data !== 'object') return undefined;
  const code = (erreur.data as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

/**
 * ⚠ Montée À L'OUVERTURE par la fiche (`{ouverte ? <FeuilleDeRevision … /> : null}`) : la date d'effet
 * se propose depuis les échéances lues à cet instant, et une saisie abandonnée ne survit pas à la
 * réouverture.
 */
interface FeuilleDeRevisionProps {
  readonly lease: LeaseWithRelations;
  readonly paiements: readonly LeasePayment[] | undefined;
  readonly ouverte: boolean;
  readonly onFermer: () => void;
  /** Le libellé du locataire (« Fatou Wade · Villa vue mer »), déjà composé par la fiche. */
  readonly libelle: string;
}

export function FeuilleDeRevision({ lease, paiements, ouverte, onFermer, libelle }: FeuilleDeRevisionProps) {
  const t = useTranslations('lease.fiche.revision');
  const f = useFormatteurs();
  const { user } = useAuth();
  const messageErreur = useMessageErreurApi();
  const toast = useToast();
  const reviser = useReviewLeaseRent(lease.id);
  const aujourdhui = aujourdhuiADakar();

  const form = useForm<{ new_rent: number | null }>({ defaultValues: { new_rent: null } });
  const nouveau = useWatch({ control: form.control, name: 'new_rent' });
  const [effet, setEffet] = useState(() => dateDEffetProposee(paiements, aujourdhui));
  const [motif, setMotif] = useState<MotifDeRevision | null>(null);
  const [precision, setPrecision] = useState('');
  const [force, setForce] = useState(false);
  const [erreur, setErreur] = useState<unknown>(null);

  const actuel = lease.monthly_rent ?? 0;
  const plafond = typeof lease.rent_review_cap_pct === 'number' ? lease.rent_review_cap_pct : null;
  const ecart = typeof nouveau === 'number' && nouveau > 0 && actuel > 0 ? nouveau - actuel : null;
  const ecartPct = ecart !== null ? (ecart / actuel) * 100 : null;
  const auDela = ecartPct !== null && plafond !== null && Math.abs(ecartPct) > plafond + 0.0001;
  const peutForcer = lease.abilities?.rent_review_force === true;

  const motifLibelle = motif ? t(`motifs.${motif}`) : '';
  const raison = [motifLibelle, precision.trim()].filter(Boolean).join(' : ');
  const premiere = premiereEcheanceRevisee(paiements, effet);

  const locatairePrevenu = lease.tenant?.user_id != null;
  const bailleurPrevenu = lease.landlord_id != null && lease.landlord_id !== user?.id;
  const prevenus = locatairePrevenu && bailleurPrevenu ? 'deux' : locatairePrevenu ? 'locataire' : bailleurPrevenu ? 'bailleur' : 'personne';

  const erreurs = erreur instanceof ApiError ? (erreur.validationErrors ?? {}) : {};
  const erreurMontant = erreurDuMontant(erreur);
  const erreurMotif = erreurs.reason?.[0];
  const erreurDate = erreurs.effective_date?.[0];
  const erreurForce = erreurs.force?.[0];
  const generale =
    erreur && !erreurMontant && !erreurMotif && !erreurDate && !erreurForce ? messageErreur(erreur, t('echec')) : null;

  const pret =
    ecart !== null && ecart !== 0 && raison.length >= MOTIF_MIN && effet >= aujourdhui && (!auDela || (peutForcer && force)) && !reviser.isPending;

  const fermer = () => {
    if (reviser.isPending) return;
    onFermer();
  };

  function erreurDuMontant(e: unknown): string | undefined {
    const champs = e instanceof ApiError ? (e.validationErrors ?? {}) : {};
    return champs.new_rent?.[0] ?? champs.monthly_rent?.[0] ?? (codeDErreur(e) === 'lease.rent_review_above_contract_cap' ? messageErreur(e) : undefined);
  }

  const proposer = async () => {
    if (!pret || typeof nouveau !== 'number') return;
    setErreur(null);
    form.clearErrors('new_rent');
    try {
      await reviser.mutateAsync({ new_rent: nouveau, reason: raison, effective_date: effet, ...(auDela && force ? { force: true } : {}) });
    } catch (e) {
      setErreur(e);
      // Le refus qui vise le montant (plafond, montant invalide, plafond figé au contrat) se pose SOUS
      // le champ, relié à lui (`FormError`, `aria-describedby`) — AC2.
      const surLeMontant = erreurDuMontant(e);
      if (surLeMontant) form.setError('new_rent', { type: 'server', message: surLeMontant });
      return;
    }
    toast.add({
      title: t('toast.titre'),
      description: t('toast.corps', { montant: f.montantCourt(nouveau, lease.currency), date: f.jourMois(effet) }),
      type: 'success',
    });
    onFermer();
  };

  const signe = ecart !== null && ecart > 0 ? '+' : '';

  return (
    <FeuilleDuBas
      open={ouverte}
      onOpenChange={(o) => (o ? undefined : fermer())}
      titre={t('titre')}
      pied={
        <>
          <Button type="button" variant="outline" className="max-md:hidden" onClick={fermer}>
            {t('annuler')}
          </Button>
          <Button type="button" size="xl" className="w-full font-semibold md:w-auto" disabled={!pret} onClick={() => void proposer()}>
            {t('proposer')}
          </Button>
        </>
      }
    >
      <div className="space-y-4" data-testid="feuille-de-revision">
        {/* TCK-2645 (lot 3) — maquette a-4 : le locataire par son avatar, puis le bien et le loyer actuel. */}
        <div className="flex items-center gap-3 rounded-xl bg-muted/60 p-3">
          <Avatar size="40">
            <AvatarFallback>
              <span aria-hidden="true">{initialesDe(lease.tenant) ?? '?'}</span>
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 leading-snug">
            <p className="truncate text-sm font-semibold">{libelle}</p>
            <p className="text-ui text-muted-foreground">
              {t.rich('actuel', {
                montant: f.montantCourt(actuel, lease.currency),
                m: (morceau) => <span className="font-medium tabular-nums text-foreground">{morceau}</span>,
              })}
            </p>
          </div>
        </div>

        <div data-testid="champ-nouveau-loyer">
          <FormAmountInput
            name="new_rent"
            control={form.control}
            label={t('nouveau')}
            currency={lease.currency}
            unite={t('unite', { devise: ['XOF', 'XAF'].includes(lease.currency.toUpperCase()) ? 'F' : lease.currency })}
            // TCK-2645 (lot 3) — maquette a-4 : le montant est la valeur de la feuille, au corps des chiffres clés.
            className="h-14 font-display text-2xl font-semibold tracking-titre tabular-nums"
          />
          {ecart !== null || plafond !== null ? (
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              {ecart !== null && ecartPct !== null ? (
                <StatusBadge
                  tone={auDela ? 'attention' : 'primary'}
                  icon={ecart < 0 ? <TrendingDown className="size-3.5" strokeWidth={2} aria-hidden="true" /> : <TrendingUp className="size-3.5" strokeWidth={2} aria-hidden="true" />}
                  label={`${signe}${f.montantCourt(ecart, lease.currency)} · ${signe}${f.nombre(ecartPct, { maximumFractionDigits: 1 })} %`}
                  data-testid="ecart-de-revision"
                />
              ) : null}
              {plafond !== null ? <span className="text-ui text-muted-foreground">{t('plafond', { pct: f.nombre(plafond, { maximumFractionDigits: 2 }) })}</span> : null}
            </p>
          ) : null}
          {auDela && !peutForcer ? <p className="mt-2 text-ui text-destructive">{t('auDela')}</p> : null}
          {auDela && peutForcer ? (
            <label className="mt-3 flex items-start gap-2.5 text-sm">
              <Checkbox checked={force} onCheckedChange={(c) => setForce(c === true)} />
              <span className="leading-snug">{t('forcer')}</span>
            </label>
          ) : null}
          <FormError>{erreurForce}</FormError>
        </div>

        <div>
          <label htmlFor="revision-effet" className="mb-1.5 block text-sm font-medium">
            {t('effet')}
          </label>
          <DatePicker
            id="revision-effet"
            value={effet}
            min={aujourdhui}
            onValueChange={setEffet}
            aria-invalid={erreurDate ? true : undefined}
            aria-describedby={erreurDate ? 'revision-effet-erreur' : undefined}
          />
          {premiere ? <p className="mt-1.5 text-ui text-muted-foreground">{t('premiere', { date: f.jourMois(premiere) })}</p> : null}
          <FormError id="revision-effet-erreur">{erreurDate}</FormError>
        </div>

        <div>
          <p id="revision-motif" className="mb-2 text-sm font-medium">
            {t('motif')}
          </p>
          <div role="group" aria-labelledby="revision-motif" className="flex flex-wrap gap-2">
            {MOTIFS.map((m) => (
              // TCK-2645 (lot 3) — maquette a-4 : un CHOIX (h-10, px-4, coche quand il est retenu), pas un filtre.
              <PuceDeFiltre key={m} type="button" active={motif === m} onClick={() => setMotif(motif === m ? null : m)} className="h-10 px-4">
                {motif === m ? <Check className="size-4" strokeWidth={2.25} aria-hidden="true" /> : null}
                {t(`motifs.${m}`)}
              </PuceDeFiltre>
            ))}
          </div>
          <Textarea
            aria-labelledby="revision-motif"
            className="mt-3 min-h-18"
            value={precision}
            maxLength={400}
            placeholder={t('precision')}
            onChange={(e) => setPrecision(e.target.value)}
            aria-invalid={erreurMotif ? true : undefined}
            aria-describedby={erreurMotif ? 'revision-motif-erreur' : undefined}
          />
          <FormError id="revision-motif-erreur">{erreurMotif}</FormError>
        </div>

        <p className="flex gap-2.5 text-ui leading-relaxed text-muted-foreground" data-testid="revision-prevenus">
          <Users className="mt-0.5 size-4 flex-none" strokeWidth={1.75} aria-hidden="true" />
          {t(`prevenus.${prevenus}`)}
        </p>

        {generale ? (
          <p role="alert" className="text-sm text-destructive">
            {generale}
          </p>
        ) : null}
      </div>
    </FeuilleDuBas>
  );
}
