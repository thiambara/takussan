import { useTranslations } from 'next-intl';
import { useMyProfiles } from '@/hooks/useProfiles';
import type { MessagingContact } from '@/lib/queries/conversations';

/**
 * TCK-2830 — la ligne de détail d'un contact de la messagerie (« Maison avec jardin · Thiès »,
 * « Agent », « 4 biens gérés »), composée ICI depuis les DONNÉES que l'API rend (`detail`,
 * TCK-2745) : le front possède le texte (principe 5).
 *
 * La relation vient du serveur (`MessagingRelation`) et n'est jamais rejouée : sans `relation`, ou
 * avec une relation dont le détail manque, aucune ligne. Un client sans bien d'échange n'a pas de
 * ligne non plus (pas de « — ») ; sans ville, le titre seul.
 *
 * L'équipe, c'est l'agence ACTIVE de l'appelant (`MessagingRelation::EQUIPE`) : son nom est celui
 * de l'espace actif (`useMyProfiles`, le cache du changement d'espace), d'où « Agent · Dakar Immo »
 * comme la maquette ; sans nom lisible, le rôle seul.
 */
export function useLigneDeContact(): (contact: MessagingContact) => string | null {
  const t = useTranslations('messaging.nouvelle.detail');
  const { data: profils } = useMyProfiles();
  const agence = profils?.data.find((p) => p.id === profils.meta.active_profile_id)?.agency?.name ?? null;
  return (contact) => {
    const detail = contact.detail;
    if (!detail) return null;
    if (contact.relation === 'client' && 'property' in detail) {
      const bien = detail.property;
      if (!bien) return null;
      return bien.city ? t('bienEtVille', { titre: bien.title, ville: bien.city }) : bien.title;
    }
    if (contact.relation === 'equipe' && 'role' in detail) {
      const role = detail.role === 'admin' ? t('role.admin') : t('role.agent');
      return agence ? t('roleEtAgence', { role, agence }) : role;
    }
    if (contact.relation === 'proprietaire' && 'properties_count' in detail) {
      return t('biensGeres', { count: detail.properties_count });
    }
    return null;
  };
}
