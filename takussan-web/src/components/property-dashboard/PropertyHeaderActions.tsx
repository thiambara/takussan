'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
import { PROPERTY_ENUM_NAMESPACES } from '@/components/property-form/options';
import { propertyStatusValues } from '@/lib/schemas/property';
import { STATUTS_DE_PUBLICATION, useGestesDuBien } from './useGestesDuBien';
import { useGestesRapides } from './useGestesRapides';
import type { PropertyDetail } from '@/types/property';

interface Props {
  readonly property: PropertyDetail;
  /** TCK-633 — la fiche est ouverte avec `?booster=1` (message de confirmation de publication). */
  readonly ouvrirBoost?: boolean;
  /** TCK-2639 — « Ajouter un document » : la feuille « ⋯ » du téléphone seulement (l'onglet Documents le porte). */
  readonly ajouterUnDocument?: boolean;
}

const PUBLIC_VIEWABLE_STATUSES = new Set(['available', 'published']);

export function PropertyHeaderActions({ property, ouvrirBoost = false, ajouterUnDocument = false }: Props) {
  const t = useTranslations('property.dashboard.actions');
  const tStatus = useTranslations(PROPERTY_ENUM_NAMESPACES.status);
  const router = useRouter();
  const { canPublish, canDelete } = useGestesDuBien();
  // Réserve de verif-patrimoine (2026-11-12) — échecs rattrapés et dits par un toast, Archiver et
  // Dépublier confirmés : la règle vit dans `useGestesRapides`, commune à la ligne de liste.
  const gestes = useGestesRapides(property, {
    corpsDeSuppression: 'deleteBodyDetail',
    apresSuppression: () => {
      router.push('/app/properties');
      router.refresh();
    },
  });
  const pending = gestes.pending;

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
              <DropdownMenuItem onClick={() => gestes.demanderConfirmation('unpublish')} disabled={pending}>
                {t('unpublish')}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={gestes.publier} disabled={pending || gestes.publicationEnCours}>
                {t('publish')}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={gestes.dupliquer} disabled={pending}>
              <Copy className="size-4" aria-hidden="true" />
              {t('duplicate')}
            </DropdownMenuItem>
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
                <Trash2 className="size-4" aria-hidden="true" />
                {t('delete')}
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {gestes.dialogues}
    </div>
  );
}
