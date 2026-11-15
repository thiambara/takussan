'use client';

import { useId, useState, type ReactNode } from 'react';
import { Banknote, Check, FileText, Landmark, MoreHorizontal, Smartphone, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { ApiError } from '@/lib/api';
import { jourDeDakar } from '@/lib/commissions/vue';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import {
  MOTIFS_D_ANNULATION,
  useCancelCommission,
  type CommissionEntry,
  type MotifDAnnulation,
  type MoyenDeCommission,
  type PreuveDePaiement,
} from '@/lib/queries/commissions';
import { cn } from '@/lib/utils';

import { MOYENS_PROPOSES, useLectureDeCommission } from './pieces';

/**
 * TCK-2662 — les gestes d'argent des commissions, réservés à `payouts.approve` et jamais sur sa
 * propre ligne (la policy le refuse ; un bouton qui mène à un 403 n'est pas une option). Plus aucun
 * geste en un clic : payer demande la date, le moyen et la référence (exigée hors espèces) ; annuler,
 * un motif choisi dans la liste (« Autre » exige un texte), puis la confirmation.
 */

/* ───────────────────────────────── La preuve d'un paiement ───────────────────────────────── */

export function IconeDuMoyen({ moyen, className }: { readonly moyen: string | null | undefined; readonly className?: string }) {
  const I = moyen === 'cash' ? Banknote : moyen === 'bank_transfer' ? Landmark : Smartphone;
  return <I className={cn('size-3.5 flex-none', className)} strokeWidth={1.75} aria-hidden="true" />;
}

/** Le moyen : quatre cases, une choisie (radio natif : flèches et espace au clavier). */
export function ChoixDuMoyen({ valeur, onChange, nom }: { readonly valeur: MoyenDeCommission; readonly onChange: (m: MoyenDeCommission) => void; readonly nom: string }) {
  const l = useLectureDeCommission();
  return (
    <div className="grid grid-cols-2 gap-2">
      {MOYENS_PROPOSES.map((m) => (
        <label
          key={m}
          className={cn(
            'flex h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm font-medium has-focus-visible:ring-3 has-focus-visible:ring-ring',
            m === valeur ? 'border-foreground bg-muted/40 ring-1 ring-foreground' : 'border-border bg-card text-encre-douce',
          )}
        >
          <input type="radio" name={nom} value={m} checked={m === valeur} onChange={() => onChange(m)} className="sr-only" />
          <IconeDuMoyen moyen={m} className="size-4" />
          {l.moyen(m)}
          {m === valeur ? <Check className="ml-auto size-4" aria-hidden="true" /> : null}
        </label>
      ))}
    </div>
  );
}

export interface EtatDeLaPreuve {
  readonly moyen: MoyenDeCommission;
  readonly date: string;
  readonly reference: string;
}

export function usePreuve() {
  const [etat, setEtat] = useState<EtatDeLaPreuve>(() => ({ moyen: 'wave', date: jourDeDakar(), reference: '' }));
  const poser = (suite: Partial<EtatDeLaPreuve>) => setEtat((avant) => ({ ...avant, ...suite }));
  return { etat, poser };
}

/** La preuve est-elle complète ? (La référence n'est facultative qu'en espèces, comme à l'API.) */
export function preuveComplete(etat: EtatDeLaPreuve, min: string | null): boolean {
  const aujourdhui = jourDeDakar();
  const dateValide = /^\d{4}-\d{2}-\d{2}$/.test(etat.date) && etat.date <= aujourdhui && (min === null || etat.date >= min);
  return dateValide && (etat.moyen === 'cash' || etat.reference.trim() !== '');
}

export function preuveAEnvoyer(etat: EtatDeLaPreuve): PreuveDePaiement {
  const reference = etat.reference.trim();
  return { paid_at: etat.date, payment_method: etat.moyen, payment_reference: reference === '' ? null : reference };
}

/** Les erreurs de champ d'une 422 de l'API, par champ de la preuve. */
export function erreursDeChamp(e: unknown): Partial<Record<'paid_at' | 'payment_method' | 'payment_reference' | 'reason_code' | 'reason', string>> {
  const champs = e instanceof ApiError ? e.validationErrors : undefined;
  if (!champs) return {};
  const sortie: Record<string, string> = {};
  for (const [cle, messages] of Object.entries(champs)) if (messages[0]) sortie[cle] = messages[0];
  return sortie;
}

/**
 * Moyen, date, référence. Au bureau (`bureau`), deux colonnes : le moyen à gauche, la date et la
 * référence à droite ; au téléphone, l'un sous l'autre, la date et la référence côte à côte.
 */
export function ChampsDeLaPreuve({
  etat,
  poser,
  min,
  erreurs,
  bureau,
}: {
  readonly etat: EtatDeLaPreuve;
  readonly poser: (suite: Partial<EtatDeLaPreuve>) => void;
  /** Le premier jour possible : celui où la plus récente des lignes payées est née. */
  readonly min: string | null;
  readonly erreurs: ReturnType<typeof erreursDeChamp>;
  readonly bureau: boolean;
}) {
  const t = useTranslations('commissions.payer');
  const id = useId();
  const f = useFormatteurs();
  const aujourdhui = jourDeDakar();
  const horsBornes = etat.date > aujourdhui || (min !== null && etat.date < min);
  const erreurDate = erreurs.paid_at ?? (horsBornes && min ? t('dateHorsBornes', { min: f.jourMois(`${min}T12:00:00Z`) }) : undefined);
  const erreurReference = erreurs.payment_reference;

  const moyen = (
    <fieldset className="min-w-0">
      <legend className={cn('text-sm font-medium', bureau ? 'mb-1.5' : 'mb-2')}>{t('moyen')}</legend>
      <ChoixDuMoyen nom={`${id}-moyen`} valeur={etat.moyen} onChange={(m) => poser({ moyen: m })} />
      {erreurs.payment_method ? <p className="mt-1 text-xs text-destructive">{erreurs.payment_method}</p> : null}
    </fieldset>
  );
  const date = (
    <div className="min-w-0">
      <label htmlFor={`${id}-date`} className="mb-1.5 block text-sm font-medium">
        {bureau ? t('date') : t('dateCourte')}
      </label>
      <DatePicker
        id={`${id}-date`}
        value={etat.date}
        min={min ?? undefined}
        max={aujourdhui}
        required
        aria-invalid={erreurDate ? true : undefined}
        aria-describedby={erreurDate ? `${id}-date-erreur` : undefined}
        onValueChange={(date) => poser({ date })}
      />
      {erreurDate ? (
        <p id={`${id}-date-erreur`} className="mt-1 text-xs text-destructive">
          {erreurDate}
        </p>
      ) : null}
    </div>
  );
  const reference = (
    <div className="min-w-0">
      <label htmlFor={`${id}-ref`} className="mb-1.5 block text-sm font-medium">
        {t('reference')}
      </label>
      <Input
        id={`${id}-ref`}
        value={etat.reference}
        maxLength={100}
        autoComplete="off"
        required={etat.moyen !== 'cash'}
        placeholder={etat.moyen === 'cash' ? t('referenceFacultative') : undefined}
        aria-invalid={erreurReference ? true : undefined}
        aria-describedby={`${id}-ref-aide`}
        onChange={(ev) => poser({ reference: ev.target.value })}
      />
      <p id={`${id}-ref-aide`} className={cn('mt-1 text-xs', erreurReference ? 'text-destructive' : 'text-muted-foreground', !bureau && !erreurReference && 'sr-only')}>
        {erreurReference ?? t('referenceAide')}
      </p>
    </div>
  );

  if (bureau) {
    return (
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-5">
        {moyen}
        <div className="space-y-3">
          {date}
          {reference}
        </div>
      </div>
    );
  }
  return (
    <div>
      {moyen}
      <div className="mt-5 grid grid-cols-2 gap-3">
        {date}
        {reference}
      </div>
    </div>
  );
}

/* ───────────────────────────────── Le cadre d'un geste au bureau ───────────────────────────────── */

/** Le dialogue centré de la maquette (`Dialogue`) : en-tête titré, corps qui défile, pied gris. */
export function DialogueDeGeste({
  ouvert,
  onFermer,
  titre,
  sousTitre,
  largeur,
  pied,
  children,
}: {
  readonly ouvert: boolean;
  readonly onFermer: () => void;
  readonly titre: ReactNode;
  readonly sousTitre?: ReactNode;
  /** `large` : 680 px de la maquette (solder) ; `etroit` : 520 px (annuler, marquer payée). */
  readonly largeur: 'large' | 'etroit';
  readonly pied: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <Dialog open={ouvert} onOpenChange={(o) => (o ? undefined : onFermer())}>
      <DialogContent
        className={cn(
          'flex max-h-[calc(100dvh-var(--spacing)*16)] flex-col gap-0 overflow-hidden p-0 ring-border',
          largeur === 'large' ? 'sm:max-w-[42.5rem]' : 'sm:max-w-[32.5rem]',
        )}
      >
        <div className="flex flex-none items-start gap-3 border-b border-border py-4 pr-12 pl-6">
          <div className="min-w-0 flex-1">
            <DialogTitle className="font-display text-lg font-semibold tracking-titre">{titre}</DialogTitle>
            {sousTitre ? <DialogDescription className="mt-0.5">{sousTitre}</DialogDescription> : null}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        <div className="flex flex-none items-center justify-end gap-2 border-t border-border bg-muted/40 px-6 py-3">{pied}</div>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────────────── Le menu « … » d'une ligne ───────────────────────────────── */

export function MenuDeLigne({
  e,
  onPayer,
  onAnnuler,
  className,
}: {
  readonly e: CommissionEntry;
  readonly onPayer: () => void;
  readonly onAnnuler: () => void;
  readonly className?: string;
}) {
  const t = useTranslations('commissions');
  const l = useLectureDeCommission();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${t('menu.actions')} — ${l.bien(e)}`}
        className={cn(
          'inline-flex size-9 flex-none items-center justify-center rounded-md text-muted-foreground outline-none lg:size-8 hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring aria-expanded:bg-muted aria-expanded:text-foreground',
          className,
        )}
      >
        {/* La maquette : 20 px au téléphone, `size-4` dans le registre du bureau. */}
        <MoreHorizontal className="size-5 lg:size-4" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 p-1.5">
        <DropdownMenuItem onClick={onPayer} className="items-start gap-2.5 px-2.5 py-2">
          <Check className="mt-0.5 size-4 flex-none text-success" aria-hidden="true" />
          <span className="leading-tight">
            <span className="block font-medium">{t('markPaid')}</span>
            <span className="mt-0.5 block text-ui text-muted-foreground">{t('menu.marquerPayeeDetail')}</span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href={`/app/leases/${e.lease_id}`} />} className="gap-2.5 px-2.5 py-2">
          <FileText className="size-4 flex-none text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
          {t('menu.voirBail')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onAnnuler} className="items-start gap-2.5 px-2.5 py-2 text-destructive">
          <TriangleAlert className="mt-0.5 size-4 flex-none" strokeWidth={1.75} aria-hidden="true" />
          <span className="leading-tight">
            <span className="block font-medium">{t('menu.annuler')}</span>
            <span className="mt-0.5 block text-ui text-destructive">{t('menu.annulerDetail')}</span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ───────────────────────────────── Annuler (motif) ───────────────────────────────── */

function ChoixDuMotif({
  motif,
  onChange,
  precision,
  onPrecision,
  erreur,
}: {
  readonly motif: MotifDAnnulation | null;
  readonly onChange: (m: MotifDAnnulation) => void;
  readonly precision: string;
  readonly onPrecision: (texte: string) => void;
  readonly erreur?: string;
}) {
  const t = useTranslations('commissions');
  const id = useId();
  return (
    <div className="space-y-2">
      {MOTIFS_D_ANNULATION.map((m) => (
        <label
          key={m}
          className={cn(
            'flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 text-corps has-focus-visible:ring-3 has-focus-visible:ring-ring',
            m === motif ? 'border-foreground ring-1 ring-foreground' : 'border-border',
          )}
        >
          <input type="radio" name={`${id}-motif`} value={m} checked={m === motif} onChange={() => onChange(m)} className="sr-only" />
          <span className={cn('inline-flex size-icone flex-none items-center justify-center rounded-full border', m === motif ? 'border-primary' : 'border-input')} aria-hidden="true">
            {m === motif ? <span className="size-2.5 rounded-full bg-primary" /> : null}
          </span>
          {t(`motifs.${m}`)}
        </label>
      ))}
      {motif === 'other' ? (
        <div className="pt-1">
          <label htmlFor={`${id}-precision`} className="sr-only">
            {t('annuler.precision')}
          </label>
          <Textarea
            id={`${id}-precision`}
            value={precision}
            maxLength={500}
            rows={3}
            required
            placeholder={t('annuler.precision')}
            aria-invalid={erreur ? true : undefined}
            aria-describedby={erreur ? `${id}-precision-erreur` : undefined}
            onChange={(ev) => onPrecision(ev.target.value)}
          />
          {erreur ? (
            <p id={`${id}-precision-erreur`} className="mt-1.5 text-ui text-destructive">
              {erreur}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Le motif est-il complet ? Un motif choisi ; « Autre » exige un texte (AC4). */
export function motifComplet(motif: MotifDAnnulation | null, precision: string): motif is MotifDAnnulation {
  return motif !== null && (motif !== 'other' || precision.trim() !== '');
}

export function AnnulerLaCommission({ e, bureau, onFermer }: { readonly e: CommissionEntry | null; readonly bureau: boolean; readonly onFermer: () => void }) {
  const t = useTranslations('commissions');
  const l = useLectureDeCommission();
  const messageErreur = useMessageErreurApi();
  const annuler = useCancelCommission();
  const [motif, setMotif] = useState<MotifDAnnulation | null>(null);
  const [precision, setPrecision] = useState('');
  const [erreur, setErreur] = useState<unknown>(null);
  if (!e) return null;
  const nom = e.beneficiary?.name || t('admin.sansNom', { id: e.beneficiary_id });
  const montant = l.montant(e);
  const pret = motifComplet(motif, precision);
  const champs = erreursDeChamp(erreur);
  const fermer = () => {
    setMotif(null);
    setPrecision('');
    setErreur(null);
    onFermer();
  };
  const confirmer = async () => {
    if (!motifComplet(motif, precision)) return;
    setErreur(null);
    try {
      await annuler.mutateAsync({ id: e.id, reason_code: motif, reason: motif === 'other' ? precision.trim() : null });
      fermer();
    } catch (err) {
      setErreur(err);
    }
  };
  const alerte = erreur && !champs.reason && !champs.reason_code ? (
    <p role="alert" className="mt-4 text-sm text-destructive">
      {messageErreur(erreur, t('actionFailed'))}
    </p>
  ) : null;
  const boutonAnnuler = (
    <Button
      type="button"
      disabled={!pret || annuler.isPending}
      onClick={() => void confirmer()}
      className="bg-destructive text-background hover:bg-destructive/90"
    >
      {t('annuler.confirmer', { montant })}
    </Button>
  );

  if (bureau) {
    return (
      <DialogueDeGeste
        ouvert
        onFermer={fermer}
        largeur="etroit"
        titre={t('annuler.titre')}
        sousTitre={t('annuler.sousTitre', { bien: l.bien(e), montant, nom })}
        pied={
          <>
            <Button type="button" variant="ghost" onClick={fermer}>
              {t('annuler.garder')}
            </Button>
            {boutonAnnuler}
          </>
        }
      >
        <div className="px-6 py-5">
          <div className="flex items-start gap-2.5 rounded-lg bg-destructive/10 px-3 py-2.5 text-ui leading-snug">
            <TriangleAlert className="mt-px size-4 flex-none text-destructive" strokeWidth={1.75} aria-hidden="true" />
            <span className="min-w-0 flex-1">{t('annuler.consequence', { nom })}</span>
          </div>
          <p className="mt-5 mb-2 text-sm font-medium">
            {t('annuler.motif')} <span className="font-normal text-muted-foreground">{t('annuler.motifAide')}</span>
          </p>
          <ChoixDuMotif motif={motif} onChange={setMotif} precision={precision} onPrecision={setPrecision} erreur={champs.reason ?? champs.reason_code} />
          {alerte}
        </div>
      </DialogueDeGeste>
    );
  }
  return (
    <FeuilleDuBas
      open
      onOpenChange={(o) => (o ? undefined : fermer())}
      titre={t('annuler.titre')}
      pied={
        <div className="flex gap-2 *:h-12 *:flex-1">
          <Button type="button" variant="outline" onClick={fermer}>
            {t('annuler.garderCourt')}
          </Button>
          {boutonAnnuler}
        </div>
      }
    >
      <p className="text-corps leading-relaxed text-encre-douce">
        <span className="font-semibold text-foreground">{l.bien(e)}</span> — {t('annuler.duA', { montant, nom })}.{' '}
        {t('annuler.consequenceTelephone', { nom })}
      </p>
      <p className="mt-5 mb-2 text-sm font-medium">
        {t('annuler.motif')} <span className="font-normal text-muted-foreground">{t('annuler.motifAideCourte')}</span>
      </p>
      <ChoixDuMotif motif={motif} onChange={setMotif} precision={precision} onPrecision={setPrecision} erreur={champs.reason ?? champs.reason_code} />
      {alerte}
    </FeuilleDuBas>
  );
}

