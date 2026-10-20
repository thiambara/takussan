'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Archive, Copy, Loader2, MoreHorizontal, Rocket } from 'lucide-react';

import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  deletePropertyAction,
  duplicatePropertyAction,
  updatePropertyStatusAction,
  updatePropertyVisibilityAction,
} from '@/app/actions/dashboard-properties';
import { PROPERTY_ENUM_NAMESPACES } from '@/components/property-form/options';
import { propertyStatusValues } from '@/lib/schemas/property';
import { usePublicationAvecCoordonnees } from '@/components/contact/PublicationAvecCoordonnees';
import { STATUTS_DE_PUBLICATION, useGestesDuBien } from './useGestesDuBien';
import type { PropertyListItem } from '@/types/property';
import { BoostDialog } from '@/components/boost/BoostDialog';
import { useCan } from '@/hooks/useCan';

/**
 * Quick-action menu for a row in the dashboard property list.
 * Backs TCK-041 AC "les actions rapides (statut, visibilité) fonctionnent
 * sans recharger la page". Uses `startTransition` so the row stays
 * interactive while the mutation is in flight, and calls `router.refresh()`
 * to invalidate the RSC tree server-side without a full navigation.
 */

interface PropertyRowActionsProps {
  readonly property: PropertyListItem;
  /**
   * `row` : cellule de table (bureau). `card` : pied de carte (mobile et tablette) — les messages
   * de retour y restent VISIBLES, sur leur propre ligne. En `row`, ils sont masqués sous `md`
   * parce que la cellule n'a pas la place ; la carte, elle, n'a pas d'autre endroit où les dire.
   */
  readonly layout?: 'row' | 'card';
}

export function PropertyRowActions({ property, layout = 'row' }: PropertyRowActionsProps) {
  const t = useTranslations('property.dashboard.actions');
  const tBoost = useTranslations('boost');
  const tStatus = useTranslations(PROPERTY_ENUM_NAMESPACES.status);
  const router = useRouter();
  const { canPublish, canDelete } = useGestesDuBien();
  // TCK-633 lot F — « Booster » : capacité `boost.spend`, bien public ; le dialogue vit HORS du menu.
  const { can: canBoost } = useCan('boost.spend');
  const [boostOpen, setBoostOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const runAction = (
    fn: () => Promise<{ ok: boolean; message?: string; data?: { status?: string | null } }>,
    successMessage: string,
  ) => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        setError(result.message ?? t('error'));
        return;
      }
      // TCK-597 (§8) — une mise en ligne qui revient `pending_review` n'est PAS publiée : l'agence
      // modère, et l'écran le dit au lieu d'annoncer un succès qui n'a pas eu lieu.
      setSuccess(result.data?.status === 'pending_review' ? t('sentForReview') : successMessage);
      router.refresh();
    });
  };

  // TCK-633 (lot C, décision 3) — publier passe par `POST …/publish` : un compte prêt publie au
  // premier geste, sinon « Vos coordonnées pour les intéressés » s'ouvre en boîte de dialogue.
  const publication = usePublicationAvecCoordonnees(property.id, {
    onPublie: (statut, geste) => {
      setSuccess(
        statut === 'pending_review'
          ? t('sentForReview')
          : geste.type === 'statut'
            ? t('statusUpdated')
            : t('published'),
      );
      router.refresh();
    },
    onEchec: (message) => setError(message || t('error')),
  });

  const publish = () => {
    setError(null);
    setSuccess(null);
    publication.publier();
  };

  const unpublish = () => {
    runAction(
      () => updatePropertyVisibilityAction(property.id, 'private'),
      t('unpublished'),
    );
  };

  // Correction du lot C, tour 2 — un statut affichable REMET EN LIGNE un bien public retiré par
  // son statut, et l'API le garde comme une publication : son refus ouvre la même boîte que
  // « Publier », qui rejoue ce statut avec `accept_terms`, au lieu d'un message sans issue.
  const changeStatus = (status: string) => {
    if (status === property.status) return;
    setError(null);
    setSuccess(null);
    publication.changerStatut(status);
  };

  const archive = () => {
    runAction(
      () => updatePropertyStatusAction(property.id, 'archived'),
      t('archived'),
    );
  };

  const duplicate = () => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await duplicatePropertyAction(property.id);
      if (!result.ok) {
        setError(result.message ?? t('duplicateFailed'));
        return;
      }
      if (!result.data) {
        setError(t('duplicateFailed'));
        return;
      }
      router.push(`/app/properties/${result.data.id}`);
      router.refresh();
    });
  };

  const confirmAndDelete = () => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await deletePropertyAction(property.id);
      if (!result.ok) {
        setError(result.message ?? t('deleteFailed'));
        return;
      }
      setConfirmDelete(false);
      router.refresh();
    });
  };

  const isPublic = property.visibility === 'public';
  const statusActions = propertyStatusValues.filter(
    (status) =>
      status !== property.status &&
      status !== 'draft' &&
      status !== 'archived' &&
      (canPublish || !STATUTS_DE_PUBLICATION.has(status)),
  );

  return (
    <div
      className={cn(
        'flex items-center gap-1',
        layout === 'card' && 'flex-wrap justify-end',
      )}
    >
      {error ? (
        <span
          role="alert"
          className={cn(
            'text-xs text-destructive',
            layout === 'card'
              ? 'order-last w-full text-right text-pretty'
              : 'mr-2 hidden truncate md:inline',
          )}
        >
          {error}
        </span>
      ) : null}
      {success ? (
        <span
          role="status"
          className={cn(
            'text-xs text-success',
            layout === 'card'
              ? 'order-last w-full text-right text-pretty'
              : 'mr-2 hidden truncate md:inline',
          )}
        >
          {success}
        </span>
      ) : null}
      <Link
        href={`/app/properties/${property.id}`}
        className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
        aria-disabled={pending}
      >
        {t('edit')}
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              // TCK-1035 (P68.08) — une icône par ligne : le nom porte le bien visé.
              aria-label={t('moreFor', { title: property.title })}
              disabled={pending}
            >
              {pending ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <MoreHorizontal aria-hidden="true" />
              )}
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{t('quickActions')}</DropdownMenuLabel>
          {!canPublish ? null : isPublic ? (
            <DropdownMenuItem onClick={unpublish} disabled={pending}>
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
          {canBoost && isPublic ? (
            <DropdownMenuItem onClick={() => setBoostOpen(true)} disabled={pending}>
              <Rocket className="size-4" aria-hidden="true" />
              {tBoost('menuItem')}
            </DropdownMenuItem>
          ) : null}
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
            <DropdownMenuItem onClick={archive} disabled={pending}>
              <Archive className="size-4" aria-hidden="true" />
              {t('archive')}
            </DropdownMenuItem>
          ) : null}
          {canDelete ? (
            <DropdownMenuItem
              onClick={() => setConfirmDelete(true)}
              disabled={pending}
              className="text-destructive focus:text-destructive"
            >
              {t('delete')}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {publication.dialogue}

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('deleteTitle')}</DialogTitle>
            <DialogDescription>
              {t.rich('deleteBodyRow', {
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

      {boostOpen ? (
        <BoostDialog propertyId={property.id} propertyTitle={property.title} open={boostOpen} onOpenChange={setBoostOpen} />
      ) : null}
    </div>
  );
}
