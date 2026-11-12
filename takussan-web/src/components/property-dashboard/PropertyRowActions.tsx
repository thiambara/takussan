'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Archive, Copy, Loader2, MoreHorizontal, Rocket } from 'lucide-react';

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
import { PROPERTY_ENUM_NAMESPACES } from '@/components/property-form/options';
import { propertyStatusValues } from '@/lib/enums/property';
import { avalerLeClicFantome } from '@/lib/clic-fantome';
import { STATUTS_DE_PUBLICATION, useGestesDuBien } from './useGestesDuBien';
import { useGestesRapides } from './useGestesRapides';
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
   * `row` : cellule de table (bureau). `card` : pied de carte (mobile et tablette).
   *
   * `menu` (TCK-2638, mode Gestion) : le seul « ⋯ », qui porte « Modifier » en tête — la colonne de
   * fin du tableau et la carte compacte n'ont que sa place (44 px).
   *
   * Réserve de verif-patrimoine (2026-11-12) — l'issue d'un geste se dit par un toast, dans les
   * trois dispositions : le message posé à côté du menu (masqué sous `md` en `row`, en bulle en
   * `menu`) n'a plus de place à trouver.
   */
  readonly layout?: 'row' | 'card' | 'menu';
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
  // Réserve de verif-patrimoine (2026-11-12) — échecs rattrapés et dits par un toast, Archiver et
  // Dépublier confirmés : la règle vit dans `useGestesRapides`, commune à la fiche du bien.
  const gestes = useGestesRapides(property, {
    corpsDeSuppression: 'deleteBodyRow',
    apresSuppression: () => router.refresh(),
  });
  // L'état en vol de TOUS les gestes, statuts compris : un seul geste part à la fois.
  const pending = gestes.enVol;

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
        layout === 'menu' && 'relative justify-end',
      )}
    >
      {layout === 'menu' ? null : (
        <Link
          href={`/app/properties/${property.id}`}
          className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
          aria-disabled={pending}
        >
          {t('edit')}
        </Link>
      )}
      <DropdownMenu
        // Contre-vérification de f02583f76 — au toucher, le second appui d'un double appui sur une
        // entrée traversait la place libérée par le menu jusqu'au lien étiré de la carte du dessous
        // (la fiche d'un AUTRE bien). Après un choix au pointeur, le clic qui suit est avalé.
        onOpenChange={(ouvert, details) => {
          if (!ouvert && details.reason === 'item-press' && !(details.event instanceof KeyboardEvent)) {
            avalerLeClicFantome();
          }
        }}
      >
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              // TCK-1035 (P68.08) — une icône par ligne : le nom porte le bien visé.
              aria-label={t('moreFor', { title: property.title })}
              disabled={pending}
              // TCK-2638 — en `menu`, la cible de 44 px autour du rendu de 32 (`before:`, comme la puce).
              className={layout === 'menu' ? 'relative before:absolute before:-inset-1.5' : undefined}
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
          {layout === 'menu' ? (
            <>
              <DropdownMenuItem render={<Link href={`/app/properties/${property.id}`} />}>
                {t('edit')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          ) : null}
          <DropdownMenuLabel>{t('quickActions')}</DropdownMenuLabel>
          {!canPublish ? null : isPublic ? (
            <DropdownMenuItem onClick={() => gestes.demanderConfirmation('unpublish')} disabled={pending}>
              {t('unpublish')}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={gestes.publier} disabled={pending}>
              {t('publish')}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={gestes.dupliquer} disabled={pending}>
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
              onClick={() => gestes.changerStatut(status)}
            >
              {tStatus(status)}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          {property.status !== 'archived' ? (
            <DropdownMenuItem onClick={() => gestes.demanderConfirmation('archive')} disabled={pending}>
              <Archive className="size-4" aria-hidden="true" />
              {t('archive')}
            </DropdownMenuItem>
          ) : null}
          {canDelete ? (
            <DropdownMenuItem
              onClick={gestes.demanderSuppression}
              disabled={pending}
              className="text-destructive focus:text-destructive"
            >
              {t('delete')}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {gestes.dialogues}

      {boostOpen ? (
        <BoostDialog propertyId={property.id} propertyTitle={property.title} open={boostOpen} onOpenChange={setBoostOpen} />
      ) : null}
    </div>
  );
}
