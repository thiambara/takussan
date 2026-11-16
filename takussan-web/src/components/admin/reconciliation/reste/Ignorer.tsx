'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Undo2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { PuceDeFiltre } from '@/components/ui/puce-de-filtre';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { ActionDuToast, useToast } from '@/components/ui/toast';
import { ErrorState } from '@/components/feedback';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { useIgnorerPaiement, usePaiementsIgnores, useRetablirPaiement } from '@/lib/queries/reconciliation';
import { cn } from '@/lib/utils';
import type { MotifDIgnorer, PaiementIgnore, PendingPayment } from '@/types/reconciliation';

import { enNombre } from '../format';
import { FenetreAdaptee } from './FenetreAdaptee';

/**
 * TCK-2933 — « Ignorer » un paiement qui n'aura jamais de ligne de banque (espèces gardées à
 * l'agence, versé sur un autre compte…), et le défaire (TCK-2932 pour le contrat).
 *
 * Le geste vit au niveau de la PAGE (`ResteARapprocher`), pas de la liste : ignorer le dernier
 * paiement du reste remplace la liste par « Tout est rapproché », et le toast « Annuler » doit
 * survivre à ce démontage. L'`id` que « Annuler » défait est celui que le POST rend.
 */

export const MOTIFS: readonly MotifDIgnorer[] = ['cash_kept', 'other_account', 'other'];
/** La borne de `IgnoreReconciliationPaymentRequest::NOTE_MAX`. */
export const NOTE_MAX = 500;
/** Le temps laissé pour « Annuler » (le même que « Marquer traitée », TCK-2885). */
export const DELAI_D_ANNULATION_MS = 6000;

export function useIgnorerAvecAnnulation(agencyId: number) {
  const t = useTranslations('admin.reconciliation.reste.ignorer');
  const toast = useToast();
  const messageErreur = useMessageErreurApi();
  const ignorer = useIgnorerPaiement(agencyId);
  const retablir = useRetablirPaiement(agencyId);

  async function annuler(id: number, toastId: string) {
    toast.close(toastId);
    try {
      await retablir.mutateAsync(id);
      toast.add({ title: t('retabli'), type: 'success' });
    } catch (err) {
      toast.add({ title: messageErreur(err, t('echecRetablir')), type: 'error' });
    }
  }

  /** Lève l'erreur de l'API : la fenêtre du motif la montre et reste ouverte. */
  async function ignorerLePaiement(p: PendingPayment, motif: MotifDIgnorer, note: string): Promise<void> {
    const r = await ignorer.mutateAsync({
      payable_type: p.type,
      payable_id: p.id,
      reason: motif,
      ...(motif === 'other' ? { note: note.trim() } : {}),
    });
    const id = r.data.id;
    const toastId: string = toast.add({
      title: t('ignore'),
      type: 'success',
      timeout: DELAI_D_ANNULATION_MS,
      data: {
        action: (
          <ActionDuToast onClick={() => void annuler(id, toastId)}>
            <Undo2 strokeWidth={1.75} aria-hidden="true" />
            {t('annuler')}
          </ActionDuToast>
        ),
      },
    });
  }

  return { ignorer: ignorerLePaiement, retablir: retablir.mutateAsync, enCours: ignorer.isPending };
}

/** Le motif, en puces ; « Autre » demande un texte. */
export function FenetreIgnorer({
  paiement,
  qui,
  onFermer,
  onIgnorer,
}: {
  readonly paiement: PendingPayment | null;
  readonly qui: string;
  readonly onFermer: () => void;
  readonly onIgnorer: (p: PendingPayment, motif: MotifDIgnorer, note: string) => Promise<void>;
}) {
  const t = useTranslations('admin.reconciliation.reste.ignorer');
  const tCommon = useTranslations('common');
  const messageErreur = useMessageErreurApi();
  const [motif, setMotif] = useState<MotifDIgnorer | null>(null);
  const [note, setNote] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  // Une autre fenêtre (un autre paiement) repart vide.
  const cle = paiement ? `${paiement.type}-${paiement.id}` : null;
  const [vu, setVu] = useState(cle);
  if (vu !== cle) {
    setVu(cle);
    setMotif(null);
    setNote('');
    setErreur(null);
  }

  useEffect(() => {
    if (motif === 'other') noteRef.current?.focus();
  }, [motif]);

  const noteManquante = motif === 'other' && note.trim() === '';

  async function valider(e: FormEvent) {
    e.preventDefault();
    if (!paiement || !motif) return;
    if (noteManquante) {
      setErreur(t('noteRequise'));
      return;
    }
    setErreur(null);
    setEnCours(true);
    try {
      await onIgnorer(paiement, motif, note);
      onFermer();
    } catch (err) {
      setErreur(messageErreur(err, t('echec')));
    } finally {
      setEnCours(false);
    }
  }

  return (
    <FenetreAdaptee ouvert={paiement !== null} onFermer={onFermer} titre={t('titre')} description={t('description')}>
      <form onSubmit={(e) => void valider(e)} className="space-y-4" aria-label={`${t('titre')} — ${qui}`}>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">{t('motif')}</legend>
          <div className="flex flex-wrap gap-2">
            {MOTIFS.map((m) => (
              <PuceDeFiltre key={m} active={motif === m} onClick={() => setMotif(m)}>
                {t(`motifs.${m}`)}
              </PuceDeFiltre>
            ))}
          </div>
        </fieldset>
        {motif === 'other' ? (
          <div className="space-y-1.5">
            <Label htmlFor="ignorer-note">{t('note')}</Label>
            <Textarea
              id="ignorer-note"
              ref={noteRef}
              value={note}
              maxLength={NOTE_MAX}
              rows={3}
              aria-invalid={erreur !== null && noteManquante ? true : undefined}
              aria-describedby={erreur !== null && noteManquante ? 'ignorer-erreur' : undefined}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        ) : null}
        {erreur ? (
          <p id="ignorer-erreur" role="alert" className="text-sm text-destructive">
            {erreur}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={onFermer}>
            {tCommon('actions.cancel')}
          </Button>
          <Button type="submit" disabled={!motif || enCours}>
            {t('valider')}
          </Button>
        </div>
      </form>
    </FenetreAdaptee>
  );
}

/**
 * Les paiements ignorés du mois, repliés sous une ligne (« 2 paiements ignorés ce mois-ci · Voir ») :
 * la seule voie pour en rétablir un une fois le toast passé (`GET …/ignored-payments`, l'`id` du
 * geste). Rien n'est rendu quand la synthèse n'en compte aucun.
 */
export function PaiementsIgnores({
  agencyId,
  periode,
  nombre,
  bureau,
  retablir,
}: {
  readonly agencyId: number;
  readonly periode: string;
  readonly nombre: number;
  readonly bureau: boolean;
  readonly retablir: (id: number) => Promise<unknown>;
}) {
  const t = useTranslations('admin.reconciliation.reste.ignores');
  const tIgnorer = useTranslations('admin.reconciliation.reste.ignorer');
  const tCarte = useTranslations('admin.reconciliation.reste.carte');
  const tCommon = useTranslations('common');
  const f = useFormatteurs();
  const messageErreur = useMessageErreurApi();
  const [ouvert, setOuvert] = useState(false);
  const [enVol, setEnVol] = useState<number | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const liste = usePaiementsIgnores(agencyId, periode, ouvert && nombre > 0);

  if (nombre <= 0) return null;

  async function remettre(g: PaiementIgnore) {
    setEnVol(g.id);
    setErreur(null);
    try {
      await retablir(g.id);
    } catch (err) {
      setErreur(messageErreur(err, tIgnorer('echecRetablir')));
    } finally {
      setEnVol(null);
    }
  }

  const motifDe = (g: PaiementIgnore) => (g.reason && MOTIFS.includes(g.reason as MotifDIgnorer) ? tIgnorer(`motifs.${g.reason as MotifDIgnorer}`) : tIgnorer('motifs.other'));

  let corps = null;
  if (ouvert) {
    if (liste.isLoading) corps = <Skeleton className="m-4 h-16 rounded-lg" />;
    else if (liste.isError || !liste.data) corps = <ErrorState message={t('erreur')} onRetry={() => void liste.refetch()} retryLabel={tCommon('actions.retry')} />;
    else
      corps = (
        <ul className="divide-y divide-border border-t border-border">
          {liste.data.data.map((g) => {
            const p = g.payment;
            const qui = p?.payer?.name?.trim() || tCarte('sansPayeur');
            const montant = p ? f.montantCourt(enNombre(p.amount) ?? 0, p.currency ?? 'XOF') : null;
            const quand = g.ignored_at ? t('quand', { motif: motifDe(g), date: f.jourMois(g.ignored_at) }) : motifDe(g);
            return (
              <li key={g.id} className="flex items-center gap-3 px-4 py-2.5 text-sm" data-testid={`ignore-${g.id}`}>
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate font-medium">{qui}</span>
                  <span className="mt-0.5 block truncate text-ui text-muted-foreground">
                    {g.reason === 'other' && g.note ? `${quand} — ${g.note}` : quand}
                  </span>
                </span>
                {montant ? <span className="flex-none font-semibold tabular-nums">{montant}</span> : null}
                <Button size="sm" variant="outline" disabled={enVol === g.id} aria-label={t('retablirPour', { qui })} onClick={() => void remettre(g)}>
                  {t('retablir')}
                </Button>
              </li>
            );
          })}
        </ul>
      );
  }

  return (
    <section className={cn('rounded-xl border border-border bg-card', bureau ? 'mt-4' : '')} data-testid="paiements-ignores">
      <div className="flex items-center gap-3 px-4 py-3 text-sm">
        <span className="min-w-0 flex-1 text-muted-foreground">{t('resume', { count: nombre })}</span>
        <button type="button" aria-expanded={ouvert} className="flex-none font-medium text-primary hover:underline" onClick={() => setOuvert((o) => !o)}>
          {ouvert ? t('masquer') : t('voir')}
        </button>
      </div>
      {erreur ? (
        <p role="alert" className="border-t border-border px-4 py-2.5 text-sm text-destructive">
          {erreur}
        </p>
      ) : null}
      {corps}
    </section>
  );
}
