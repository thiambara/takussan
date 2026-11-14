'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { ErrorState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { nomCompletDe } from '@/lib/identite';
import { useAbandonLeaseDraft, useFermerLaCandidatureDOrigine, type LeaseWithRelations } from '@/lib/queries/leases';

/** Le motif de l'abandon : 500 caractères au plus (`AbandonLeaseDraftRequest`). */
const MOTIF_MAX = 500;

/**
 * TCK-2764 — « Abandonner le brouillon » : le dialogue de la fiche d'un bail `draft`.
 *
 * Il dit l'effet en une phrase, prend un motif facultatif et, quand le brouillon vient d'une
 * candidature encore ouverte, la nomme (son candidat est le locataire du bail, P48.03) et propose de
 * la fermer — case DÉCOCHÉE : l'abandon ne la ferme jamais en douce, fermer prévient le candidat.
 *
 * Cochée, le geste existant de la candidature part APRÈS le `DELETE`, sur le statut que la réponse
 * rend (`reject` si `pending`, `cancel` si `confirmed`), et non sur celui que la fiche a lu. S'il
 * échoue, le brouillon reste abandonné et un message le dit. Puis retour à la liste des baux : la
 * fiche rend désormais 404.
 */
export function AbandonnerLeBrouillon({
  lease,
  open,
  onOpenChange,
}: {
  readonly lease: LeaseWithRelations;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('lease.abandon');
  const router = useRouter();
  const toast = useToast();
  const messageErreur = useMessageErreurApi();
  const abandonner = useAbandonLeaseDraft(lease.id);
  const fermer = useFermerLaCandidatureDOrigine();
  const [motif, setMotif] = useState('');
  const [fermerAussi, setFermerAussi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const origine = lease.origin_booking ?? null;
  const ouverte = origine !== null && (origine.status === 'pending' || origine.status === 'confirmed') ? origine : null;
  const enCours = abandonner.isPending || fermer.isPending;

  const reinitialiser = () => {
    setMotif('');
    setFermerAussi(false);
    setErreur(null);
  };

  async function valider() {
    setErreur(null);
    let reponse;
    try {
      reponse = await abandonner.mutateAsync(motif.trim() !== '' ? { reason: motif.trim() } : {});
    } catch (e) {
      setErreur(messageErreur(e, t('erreur')));
      return;
    }

    const restee = reponse.data.origin_booking;
    const geste = restee?.status === 'pending' ? 'reject' : restee?.status === 'confirmed' ? 'cancel' : null;
    let titre = t('abandonne');
    if (fermerAussi && ouverte !== null && restee !== null && geste !== null) {
      try {
        await fermer.mutateAsync({ id: restee.id, geste });
        titre = t('abandonneEtFerme');
      } catch (e) {
        toast.add({ title: t('fermetureEchouee'), description: messageErreur(e), type: 'error' });
        titre = '';
      }
    }
    if (titre !== '') toast.add({ title: titre, type: 'success' });
    onOpenChange(false);
    router.push('/app/leases');
  }

  const nom = nomCompletDe(lease.tenant) ?? '—';

  return (
    <Dialog
      open={open}
      onOpenChange={(suivant) => {
        if (enCours) return;
        if (!suivant) reinitialiser();
        onOpenChange(suivant);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('titre')}</DialogTitle>
          <DialogDescription>{t('effet')}</DialogDescription>
        </DialogHeader>

        {erreur ? <ErrorState message={erreur} /> : null}

        <div className="space-y-4">
          {ouverte ? (
            <div className="space-y-2 rounded-md border border-border p-3" data-testid="candidature-d-origine">
              <p className="text-sm font-medium">{t(`candidature.${ouverte.status}`, { nom })}</p>
              {ouverte.status === 'confirmed' ? <p className="text-ui text-muted-foreground">{t('resteAcceptee')}</p> : null}
              <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1">
                <Checkbox className="mt-0.5" checked={fermerAussi} onCheckedChange={(c) => setFermerAussi(c === true)} disabled={enCours} />
                <span className="text-sm">
                  {t('fermer')}
                  <span className="block text-ui text-muted-foreground">{t(`fermerAide.${ouverte.status}`)}</span>
                </span>
              </label>
            </div>
          ) : null}

          <div>
            <label className="text-xs font-medium text-muted-foreground" htmlFor="abandon-motif">
              {t('motif')}
            </label>
            <Textarea id="abandon-motif" rows={3} maxLength={MOTIF_MAX} value={motif} onChange={(e) => setMotif(e.target.value)} disabled={enCours} />
          </div>
        </div>

        <div className="mt-5 flex justify-between gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={enCours}>
            {t('annuler')}
          </Button>
          <Button type="button" variant="destructive" onClick={() => void valider()} disabled={enCours}>
            {enCours ? t('enCours') : t('confirmer')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
