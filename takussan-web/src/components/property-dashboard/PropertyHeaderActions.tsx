'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import {
  Archive,
  Copy,
  Globe,
  Loader2,
  MoreHorizontal,
  Trash2,
} from 'lucide-react';

import { AddDocumentButton } from '@/components/documents/AddDocumentButton';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { BoostButton } from '@/components/boost/BoostButton';
import {
  deletePropertyAction,
  duplicatePropertyAction,
  updatePropertyStatusAction,
  updatePropertyVisibilityAction,
} from '@/app/actions/dashboard-properties';
import { PROPERTY_ENUM_NAMESPACES } from '@/components/property-form/options';
import { propertyStatusValues } from '@/lib/schemas/property';
import { usePublicationAvecCoordonnees } from '@/components/contact/PublicationAvecCoordonnees';
import { useToast } from '@/components/ui/toast';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { STATUTS_DE_PUBLICATION, useGestesDuBien } from './useGestesDuBien';
import type { PropertyDetail } from '@/types/property';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Props {
  readonly property: PropertyDetail;
  /** TCK-633 — la fiche est ouverte avec `?booster=1` (message de confirmation de publication). */
  readonly ouvrirBoost?: boolean;
  /** TCK-2639 — « Ajouter un document » : la feuille « ⋯ » du téléphone seulement (l'onglet Documents le porte). */
  readonly ajouterUnDocument?: boolean;
}

const PUBLIC_VIEWABLE_STATUSES = new Set(['available', 'published']);

/** Les gestes qui retirent le bien du site : ils se confirment avant de partir. */
type GesteAConfirmer = 'archive' | 'unpublish';

type ResultatDAction = { ok: boolean; message?: string; data?: { status?: string | null } };

export function PropertyHeaderActions({ property, ouvrirBoost = false, ajouterUnDocument = false }: Props) {
  const t = useTranslations('property.dashboard.actions');
  const tStatus = useTranslations(PROPERTY_ENUM_NAMESPACES.status);
  const router = useRouter();
  const { canPublish, canDelete } = useGestesDuBien();
  const [pending, startTransition] = useTransition();
  // L'erreur de la suppression : elle se dit DANS son dialogue, ouvert au moment de l'échec.
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Le geste reste posé pendant que le dialogue se referme : son titre ne bascule pas à la sortie.
  const [aConfirmer, setAConfirmer] = useState<GesteAConfirmer>('unpublish');
  const [confirmationOuverte, setConfirmationOuverte] = useState(false);
  const demanderConfirmation = (geste: GesteAConfirmer) => {
    setAConfirmer(geste);
    setConfirmationOuverte(true);
  };
  const toast = useToast();
  const messageErreur = useMessageErreurApi();

  // Réserve de verif-patrimoine (2026-11-12, décision a de la session) — tout échec se dit par un
  // toast : au téléphone, ces gestes partent de la feuille « ⋯ » de la coque, où un message posé à
  // côté du menu ne se voit pas. Et rien ne remonte : une action serveur qui LÈVE (panne réseau,
  // `TypeError: Failed to fetch`) atteignait la frontière `(dashboard)/error.tsx` depuis la
  // transition, et la page entière passait à l'écran d'erreur.
  const signalerEchec = (message: string) => toast.add({ title: message, type: 'error' });
  const signalerSucces = (message: string) => toast.add({ title: message, type: 'success' });

  const runAction = (fn: () => Promise<ResultatDAction>, successMessage: string, apres?: () => void) => {
    startTransition(async () => {
      try {
        const result = await fn();
        if (!result.ok) {
          signalerEchec(result.message ?? t('error'));
          return;
        }
        // TCK-597 (§8) — une mise en ligne qui revient `pending_review` n'est PAS publiée : l'agence
        // modère, et l'écran le dit au lieu d'annoncer un succès qui n'a pas eu lieu.
        signalerSucces(result.data?.status === 'pending_review' ? t('sentForReview') : successMessage);
        router.refresh();
      } catch (erreur) {
        signalerEchec(messageErreur(erreur, t('error')));
      } finally {
        apres?.();
      }
    });
  };

  // TCK-633 (lot C, décision 3) — publier passe par `POST …/publish` : un compte prêt publie au
  // premier geste, sinon « Vos coordonnées pour les intéressés » s'ouvre en boîte de dialogue.
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

  const publish = () => publication.publier();

  // Décision b de la session — Dépublier et Archiver retirent le bien du site : ils passent par
  // un dialogue qui nomme le bien et l'effet. Dupliquer et les statuts restent en un geste.
  const confirmer = () => {
    const fermer = () => setConfirmationOuverte(false);
    if (aConfirmer === 'unpublish') {
      runAction(() => updatePropertyVisibilityAction(property.id, 'private'), t('unpublished'), fermer);
    } else {
      runAction(() => updatePropertyStatusAction(property.id, 'archived'), t('archived'), fermer);
    }
  };

  // Correction du lot C, tour 2 — cf. `PropertyRowActions` : un refus de remise en ligne par le
  // statut ouvre la boîte « Vos coordonnées », qui rejoue ce statut avec `accept_terms`.
  const changeStatus = (status: string) => {
    if (status === property.status) return;
    publication.changerStatut(status);
  };

  const duplicate = () => {
    startTransition(async () => {
      try {
        const result = await duplicatePropertyAction(property.id);
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

  const confirmAndDelete = () => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await deletePropertyAction(property.id);
        if (!result.ok) {
          setError(result.message ?? t('deleteFailed'));
          return;
        }
        setConfirmDelete(false);
        router.push('/app/properties');
        router.refresh();
      } catch (erreur) {
        setError(messageErreur(erreur, t('deleteFailed')));
      }
    });
  };

  const canViewPublic =
    property.visibility === 'public' &&
    property.slug &&
    property.status &&
    PUBLIC_VIEWABLE_STATUSES.has(property.status);
  const isPublic = property.visibility === 'public';
  const statusActions = propertyStatusValues.filter(
    (status) =>
      status !== property.status &&
      status !== 'draft' &&
      status !== 'archived' &&
      (canPublish || !STATUTS_DE_PUBLICATION.has(status)),
  );

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {canViewPublic ? (
        <Link
          href={`/properties/${property.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
        >
          <Globe aria-hidden="true" />
          {t('viewPublic')}
        </Link>
      ) : null}
      {/* Le bouton et le menu ne se séparent pas : à 768 px, l'en-tête passait « ⋯ » seul sur
          une seconde ligne, loin de l'action qu'il prolonge. */}
      <div className="flex shrink-0 items-center gap-2">
        {/* TCK-633 lot F — « Booster », pour un bien public et qui détient `boost.spend`. */}
        <BoostButton
          propertyId={property.id}
          propertyTitle={property.title}
          isPublic={Boolean(canViewPublic)}
          ouvrirDemande={ouvrirBoost}
        />
        {/* TCK-2639 (AC3) — « Ajouter un document » vit dans l'onglet Documents, préattaché au bien ;
            l'en-tête du bureau n'en porte plus (maquette), la feuille « ⋯ » du téléphone le garde. */}
        {ajouterUnDocument ? (
          <AddDocumentButton documentableType="property" documentableId={property.id} displayLabel={property.title} />
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                // TCK-2639 — le « ⋯ » de la maquette `app-biens` a-2 : bordé, sur la carte.
                variant="outline"
                size="icon"
                aria-label={t('more')}
                disabled={pending}
              >
                {pending ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <MoreHorizontal className="size-icone stroke-2 text-muted-foreground" aria-hidden="true" />
                )}
              </Button>
            }
          />
          {/* `onClick`, jamais `onSelect` : `Menu.Item` de base-ui n'a pas de `onSelect` (c'est un
              vocabulaire Radix). La prop tombait sur l'événement DOM `select` — celui d'une
              sélection de texte — et les six actions de ce menu ne faisaient RIEN, mesuré au
              navigateur le 2026-09-16 (le même clic sur le menu de ligne ouvrait bien le dialogue). */}
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{t('quickActions')}</DropdownMenuLabel>
            {!canPublish ? null : isPublic ? (
              <DropdownMenuItem onClick={() => demanderConfirmation('unpublish')} disabled={pending}>
                {t('unpublish')}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={publish} disabled={pending || publication.enCours}>
                {t('publish')}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={duplicate} disabled={pending}>
              <Copy className="size-4" aria-hidden="true" />
              {t('duplicate')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t('statusHeading')}</DropdownMenuLabel>
            {statusActions.map((status) => (
              <DropdownMenuItem
                key={status}
                disabled={pending}
                onClick={() => changeStatus(status)}
              >
                {tStatus(status)}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            {property.status !== 'archived' ? (
              <DropdownMenuItem onClick={() => demanderConfirmation('archive')} disabled={pending}>
                <Archive className="size-4" aria-hidden="true" />
                {t('archive')}
              </DropdownMenuItem>
            ) : null}
            {canDelete ? (
              <DropdownMenuItem
                onClick={() => {
                  setError(null);
                  setConfirmDelete(true);
                }}
                disabled={pending}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="size-4" aria-hidden="true" />
                {t('delete')}
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
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
            <Button variant="ghost" onClick={() => setConfirmationOuverte(false)} disabled={pending}>
              {t('cancel')}
            </Button>
            <Button onClick={confirmer} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              {aConfirmer === 'archive' ? t('archive') : t('unpublish')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('deleteTitle')}</DialogTitle>
            <DialogDescription>
              {t.rich('deleteBodyDetail', {
                title: property.title,
                b: (chunks) => <strong>{chunks}</strong>,
              })}
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirmDelete(false)}
              disabled={pending}
            >
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={confirmAndDelete}
              disabled={pending}
            >
              {pending ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : null}
              {t('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
