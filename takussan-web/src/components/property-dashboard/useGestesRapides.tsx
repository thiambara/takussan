'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';

import {
  deletePropertyAction,
  duplicatePropertyAction,
  updatePropertyStatusAction,
  updatePropertyVisibilityAction,
} from '@/app/actions/dashboard-properties';
import { usePublicationAvecCoordonnees } from '@/components/contact/PublicationAvecCoordonnees';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { pendantLeGeste, useGesteEnVol } from '@/lib/biens/gestes-en-vol';

/** Les gestes qui retirent le bien du site : ils se confirment avant de partir. */
export type GesteAConfirmer = 'archive' | 'unpublish';

type ResultatDAction = { ok: boolean; message?: string; data?: { status?: string | null } };

interface Options {
  /** La phrase du dialogue de suppression : la liste et la fiche ne disent pas la même chose. */
  readonly corpsDeSuppression: 'deleteBodyRow' | 'deleteBodyDetail';
  /** Après la suppression : la fiche quitte la page du bien, la liste se rafraîchit. */
  readonly apresSuppression: () => void;
}

/**
 * Les gestes rapides d'un bien, communs au menu de la fiche (`PropertyHeaderActions`, au téléphone
 * dans la feuille « ⋯ » de la coque) et à celui de la ligne de liste (`PropertyRowActions`).
 *
 * Réserve de verif-patrimoine (2026-11-12), décisions de la session :
 *
 * - (a) **Tout échec est rattrapé et se dit par un toast.** Une action serveur qui LÈVE (panne
 *   réseau : `TypeError: Failed to fetch`) n'était rattrapée nulle part : depuis la transition, elle
 *   atteignait la frontière `(dashboard)/error.tsx`, et la PAGE ENTIÈRE passait à l'écran d'erreur
 *   (relevé au navigateur sur « Dupliquer », non-GET bloqués). Le message posé à côté du menu ne se
 *   voyait pas non plus au téléphone. Seule exception : l'échec de la suppression se dit dans SON
 *   dialogue, ouvert au moment de l'échec.
 * - (b) **Archiver et Dépublier se confirment** dans un dialogue qui nomme le bien et l'effet
 *   (« ne sera plus visible sur le site ») ; Dupliquer et les statuts restent en un geste, confirmé
 *   par un toast.
 */
export function useGestesRapides(
  property: { readonly id: number; readonly title: string; readonly status?: string | null },
  { corpsDeSuppression, apresSuppression }: Options,
): {
  /**
   * UN SEUL état « en vol » pour tous les gestes du bien : la transition de l'en-tête (Dupliquer,
   * Archiver, Dépublier, Supprimer) OU celle de la publication (Publier et les statuts, qui partent
   * par `usePublicationAvecCoordonnees`). Le « ⋯ », ses entrées et les boutons des dialogues le
   * lisent tous : le menu ne se désactivait que par la transition de l'en-tête, et pendant un statut
   * en vol un second statut ou « Dupliquer » pouvait partir (contre-vérification de 263df479b par
   * verif-commercial, 2026-11-12).
   */
  readonly enVol: boolean;
  readonly publier: () => void;
  readonly changerStatut: (status: string) => void;
  readonly dupliquer: () => void;
  readonly demanderConfirmation: (geste: GesteAConfirmer) => void;
  readonly demanderSuppression: () => void;
  readonly dialogues: ReactNode;
} {
  const t = useTranslations('property.dashboard.actions');
  const router = useRouter();
  const toast = useToast();
  const messageErreur = useMessageErreurApi();
  const [pending, startTransition] = useTransition();
  // L'erreur de la suppression : elle se dit DANS son dialogue.
  const [erreurDeSuppression, setErreurDeSuppression] = useState<string | null>(null);
  const [suppressionOuverte, setSuppressionOuverte] = useState(false);
  // Le geste reste posé pendant que le dialogue se referme : son titre ne bascule pas à la sortie.
  const [aConfirmer, setAConfirmer] = useState<GesteAConfirmer>('unpublish');
  const [confirmationOuverte, setConfirmationOuverte] = useState(false);

  const signalerEchec = (message: string) => toast.add({ title: message, type: 'error' });
  const signalerSucces = (message: string) => toast.add({ title: message, type: 'success' });

  const lancer = (fn: () => Promise<ResultatDAction>, succes: string, apres: () => void) => {
    startTransition(async () => {
      try {
        const result = await pendantLeGeste(property.id, fn);
        if (!result.ok) {
          signalerEchec(result.message ?? t('error'));
          return;
        }
        // TCK-597 (§8) — une mise en ligne qui revient `pending_review` n'est PAS publiée : l'agence
        // modère, et l'écran le dit au lieu d'annoncer un succès qui n'a pas eu lieu.
        signalerSucces(result.data?.status === 'pending_review' ? t('sentForReview') : succes);
        router.refresh();
      } catch (erreur) {
        signalerEchec(messageErreur(erreur, t('error')));
      } finally {
        apres();
      }
    });
  };

  // TCK-633 (lot C, décision 3) — publier passe par `POST …/publish` : un compte prêt publie au
  // premier geste, sinon « Vos coordonnées pour les intéressés » s'ouvre en boîte de dialogue. Un
  // statut affichable REMET EN LIGNE un bien public retiré par son statut (correction du lot C,
  // tour 2) : son refus ouvre la même boîte, qui rejoue ce statut avec `accept_terms`.
  const publication = usePublicationAvecCoordonnees(property.id, {
    onPublie: (statut, geste) => {
      signalerSucces(
        statut === 'pending_review'
          ? t('sentForReview')
          : geste.type === 'statut'
            ? t('statusUpdated')
            : t('published'),
      );
      router.refresh();
    },
    onEchec: (message) => signalerEchec(message || t('error')),
  });
  // Contre-vérification de f02583f76 — le registre par bien survit au démontage du menu (la feuille
  // « ⋯ » de la fiche au téléphone) : la fiche remontée retrouve le geste en vol.
  const enVolAilleurs = useGesteEnVol(property.id);
  const enVol = pending || publication.enCours || enVolAilleurs;

  const confirmer = () => {
    const fermer = () => setConfirmationOuverte(false);
    if (aConfirmer === 'unpublish') {
      lancer(() => updatePropertyVisibilityAction(property.id, 'private'), t('unpublished'), fermer);
    } else {
      lancer(() => updatePropertyStatusAction(property.id, 'archived'), t('archived'), fermer);
    }
  };

  const dupliquer = () => {
    startTransition(async () => {
      try {
        const result = await pendantLeGeste(property.id, () => duplicatePropertyAction(property.id));
        if (!result.ok) {
          signalerEchec(result.message ?? t('duplicateFailed'));
          return;
        }
        if (!result.data) {
          signalerEchec(t('duplicateFailed'));
          return;
        }
        signalerSucces(t('duplicated'));
        router.push(`/app/properties/${result.data.id}`);
        router.refresh();
      } catch (erreur) {
        signalerEchec(messageErreur(erreur, t('duplicateFailed')));
      }
    });
  };

  const supprimer = () => {
    setErreurDeSuppression(null);
    startTransition(async () => {
      try {
        const result = await pendantLeGeste(property.id, () => deletePropertyAction(property.id));
        if (!result.ok) {
          setErreurDeSuppression(result.message ?? t('deleteFailed'));
          return;
        }
        setSuppressionOuverte(false);
        apresSuppression();
      } catch (erreur) {
        setErreurDeSuppression(messageErreur(erreur, t('deleteFailed')));
      }
    });
  };

  const dialogues = (
    <>
      {publication.dialogue}
      <Dialog open={confirmationOuverte} onOpenChange={setConfirmationOuverte}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{aConfirmer === 'archive' ? t('archiveTitle') : t('unpublishTitle')}</DialogTitle>
            <DialogDescription>
              {t.rich(aConfirmer === 'archive' ? 'archiveBody' : 'unpublishBody', {
                title: property.title,
                b: (chunks) => <strong>{chunks}</strong>,
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmationOuverte(false)} disabled={enVol}>
              {t('cancel')}
            </Button>
            <Button onClick={confirmer} disabled={enVol}>
              {enVol ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              {aConfirmer === 'archive' ? t('archive') : t('unpublish')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={suppressionOuverte} onOpenChange={setSuppressionOuverte}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('deleteTitle')}</DialogTitle>
            <DialogDescription>
              {t.rich(corpsDeSuppression, {
                title: property.title,
                b: (chunks) => <strong>{chunks}</strong>,
              })}
            </DialogDescription>
          </DialogHeader>
          {erreurDeSuppression ? (
            <p role="alert" className="text-sm text-destructive">
              {erreurDeSuppression}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSuppressionOuverte(false)} disabled={enVol}>
              {t('cancel')}
            </Button>
            <Button variant="destructive" onClick={supprimer} disabled={enVol}>
              {enVol ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              {t('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  return {
    enVol,
    publier: publication.publier,
    changerStatut: (status) => {
      if (status === property.status) return;
      publication.changerStatut(status);
    },
    dupliquer,
    demanderConfirmation: (geste) => {
      setAConfirmer(geste);
      setConfirmationOuverte(true);
    },
    demanderSuppression: () => {
      setErreurDeSuppression(null);
      setSuppressionOuverte(true);
    },
    dialogues,
  };
}
