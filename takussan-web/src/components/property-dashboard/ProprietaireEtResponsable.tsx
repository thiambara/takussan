import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';
import type { PropertyListItem } from '@/types/property';

/**
 * TCK-603 (ADR-0036) — le propriétaire et l'agent responsable sont deux personnes, et la ligne les
 * nomme chacune. Elle affichait `owner` sous le libellé « Agent : » : c'est ce mélange qui faisait
 * lire « Réattribuer » comme un changement d'agent alors qu'il changeait de propriétaire.
 *
 * Qui est l'agent responsable, c'est l'API qui le dit (`primary_contact_source`, ADR-0059 §6) : une
 * ligne `agent` (`designated` ou `invitation_order`), ou le repli sur le titulaire (`owner`) — et alors
 * « aucun ». Jamais une égalité `owner.id === primary_contact.id` (verif-603 M2) : un agent qui a saisi
 * le bien ET en est l'agent responsable a les deux, et l'écran affirmait « aucun » juste après l'avoir
 * désigné. Source absente (réponse qui ne la porte pas) : la moitié « responsable » ne s'affiche pas
 * plutôt que de deviner. Le propriétaire se tait quand c'est l'utilisateur courant, comme avant.
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
  readonly property: Pick<PropertyListItem, 'owner' | 'primary_contact' | 'primary_contact_source'>;
  readonly currentUserId?: number;
  readonly className?: string;
  /** `span` quand l'hôte est déjà un paragraphe (la `description` de `PageHeader`) : pas de `<p>` dans un `<p>`. */
  readonly as?: 'p' | 'span';
}) {
  const t = useTranslations('property.dashboard.list');
  const owner = property.owner ?? null;
  const showOwner = owner !== null && currentUserId !== undefined && owner.id !== currentUserId;
  const source = property.primary_contact_source;
  const connu = property.primary_contact !== undefined && source !== undefined;
  const responsable =
    source === 'designated' || source === 'invitation_order' ? (property.primary_contact ?? null) : null;
  if (!showOwner && !connu) return null;
  return (
    <Balise className={cn('mt-1 truncate text-xs text-muted-foreground', className)}>
      {showOwner ? (
        <>
          <span className="text-muted-foreground/70">{t('ownerPrefix')}</span>{' '}
          <span className="font-medium text-foreground">{owner.name}</span>
        </>
      ) : null}
      {showOwner && connu ? ' · ' : null}
      {connu ? (
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
