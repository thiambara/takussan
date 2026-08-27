'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Stamp } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { regenerateAgencyWatermarksAction } from '@/app/actions/admin-agency';

/**
 * TCK-370 — la regénération des filigranes, depuis la configuration d'agence.
 *
 * `POST /api/agencies/{agency}/regenerate-watermarks` existe depuis TCK-106 et n'avait AUCUN
 * appelant côté front. Deux propriétés portent tout le sens de ce composant :
 *
 *  1. **Elle se confirme.** C'est un traitement long sur toutes les photos de tous les biens de
 *     l'agence ; un clic isolé qui le déclenche est un piège. La confirmation nomme ce qui va
 *     être touché, elle ne demande pas « êtes-vous sûr ? ».
 *  2. **Elle ne rend PAS la main en silence.** Le contrôleur répond 202 et travaille en file :
 *     l'écran dit que la demande est partie, il ne prétend pas que c'est fini. Le suivi de
 *     progression est hors périmètre (cf. le ticket).
 *
 * ⚠ Le bouton n'autorise rien. La garde serveur est `primary_admin_id === user->id` ou
 * super-admin — plus étroite que l'`isAdmin` qui donne accès à cette page. Un `agency_admin`
 * secondaire verra donc le refus de l'API, affiché tel quel plutôt que masqué : *un bouton
 * caché par prudence enlève le message d'erreur en même temps que le bouton.*
 */
export function RegenerateWatermarksCard({ agencyId }: { readonly agencyId: number }) {
  const t = useTranslations('admin.agencyConfig.watermarks');
  const tCommon = useTranslations('common.actions');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, startTransition] = useTransition();

  function confirmer() {
    setErreur(null);
    setMessage(null);
    startTransition(async () => {
      const resultat = await regenerateAgencyWatermarksAction(agencyId);
      setConfirmOpen(false);
      if (resultat.ok) {
        setMessage(t('queued'));
      } else {
        setErreur(resultat.message);
      }
    });
  }

  return (
    <section className="rounded-xl bg-card p-6 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">{t('title')}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t('description')}</p>
      </div>

      <Button type="button" variant="outline" onClick={() => setConfirmOpen(true)}>
        <Stamp aria-hidden="true" />
        <span>{t('action')}</span>
      </Button>

      {message ? (
        <p role="status" className="text-xs text-muted-foreground">
          {message}
        </p>
      ) : null}
      {erreur ? (
        <p role="alert" className="text-xs text-destructive">
          {erreur}
        </p>
      ) : null}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('confirmTitle')}</DialogTitle>
            <DialogDescription>{t('confirmBody')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={enCours}
            >
              {tCommon('cancel')}
            </Button>
            <Button type="button" onClick={confirmer} disabled={enCours}>
              {enCours ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden="true" />
                  <span>{t('pending')}</span>
                </>
              ) : (
                <span>{t('confirmAction')}</span>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
