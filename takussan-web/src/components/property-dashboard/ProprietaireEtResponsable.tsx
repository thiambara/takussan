import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';
import type { PropertyListItem } from '@/types/property';

/**
 * TCK-603 (ADR-0036) — le propriétaire et l'agent responsable sont deux personnes, et la ligne les
 * nomme chacune. Elle affichait `owner` sous le libellé « Agent : » : c'est ce mélange qui faisait
 * lire « Réattribuer » comme un changement d'agent alors qu'il changeait de propriétaire.
 *
 * `primary_contact` retombe sur le propriétaire quand aucun agent n'est éligible (TCK-502) : un
 * contact qui EST le propriétaire se lit donc « aucun » agent responsable. Clé absente (réponse qui
 * ne la porte pas) : la moitié « responsable » ne s'affiche pas plutôt que d'affirmer « aucun ».
 * Le propriétaire se tait quand c'est l'utilisateur courant, comme avant.
 *
 * Partagée par la liste (ligne et carte) et l'en-tête de la fiche : la règle de lecture de
 * `primary_contact` ne doit exister qu'une fois.
 */
export function ProprietaireEtResponsable({
  property,
  currentUserId,
  className,
  as: Balise = 'p',
}: {
  readonly property: Pick<PropertyListItem, 'owner' | 'primary_contact'>;
  readonly currentUserId?: number;
  readonly className?: string;
  /** `span` quand l'hôte est déjà un paragraphe (la `description` de `PageHeader`) : pas de `<p>` dans un `<p>`. */
  readonly as?: 'p' | 'span';
}) {
  const t = useTranslations('property.dashboard.list');
  const owner = property.owner ?? null;
  const showOwner = owner !== null && currentUserId !== undefined && owner.id !== currentUserId;
  const contact = property.primary_contact;
  const responsable = contact && contact.id !== owner?.id ? contact : null;
  if (!showOwner && contact === undefined) return null;
  return (
    <Balise className={cn('mt-1 truncate text-xs text-muted-foreground', className)}>
      {showOwner ? (
        <>
          <span className="text-muted-foreground/70">{t('ownerPrefix')}</span>{' '}
          <span className="font-medium text-foreground">{owner.name}</span>
        </>
      ) : null}
      {showOwner && contact !== undefined ? ' · ' : null}
      {contact !== undefined ? (
        <>
          <span className="text-muted-foreground/70">{t('responsiblePrefix')}</span>{' '}
          <span className="font-medium text-foreground">
            {responsable ? responsable.name : t('responsibleNone')}
          </span>
        </>
      ) : null}
    </Balise>
  );
}
