'use client';

import { useTranslations } from 'next-intl';
import type { MessageMetadata } from '@/types/message';

/**
 * TCK-085, TCK-592, TCK-671 — le texte d'un avis système, rendu depuis ses CODES
 * (`metadata.event`, `role`, `cause`, `status`) dans la langue du lecteur.
 *
 * Partagé par la bulle du fil (`SystemMessageBubble`) et l'aperçu de la liste (`ConversationList`) :
 * le `content` et le `last_message_preview` de l'API sont écrits en français par
 * `SystemMessageFactory::humanise()`, et ne restent que le repli d'un code que ce front ne connaît pas.
 *
 * Rend `null` quand le code est inconnu : l'appelant retombe alors sur le texte du serveur.
 */
const PROVIDER_CAUSES = new Set(['assigned', 'unassigned', 'accepted', 'declined']);
const STATUS_KEYS = new Set([
  'open', 'acknowledged', 'quote_requested', 'quote_submitted', 'awaiting_owner', 'approved',
  'rejected', 'assigned', 'in_progress', 'completed', 'closed', 'cancelled',
]);

export function useTexteMessageSysteme(): (meta: MessageMetadata | null | undefined) => string | null {
  const t = useTranslations('messaging.system');
  const tRole = useTranslations('messaging.group.info');
  const tMaintenance = useTranslations('messaging.maintenanceEvents');
  const tStatus = useTranslations('messaging.maintenanceEvents.statuses');

  return (meta) => {
    if (!meta) return null;
    const actor = meta.actor_name ?? '—';
    const target = meta.target_name ?? '—';

    switch (meta.event) {
      case 'participant_added':
        return t('participantAdded', { actor, target });
      case 'participant_removed':
        return t('participantRemoved', { actor, target });
      case 'role_changed':
        // L'API émet `role` (`SystemMessageFactory::roleChanged()`) ; un rôle inconnu garde le repli.
        if (meta.role === 'admin') return t('roleChanged', { actor, target, role: tRole('roleAdmin') });
        if (meta.role === 'member') return t('roleChanged', { actor, target, role: tRole('roleMember') });
        return null;
      case 'renamed':
        return t('renamed', { actor, subject: meta.new_subject ?? '—' });
      case 'maintenance':
        if (meta.cause && PROVIDER_CAUSES.has(meta.cause)) {
          return tMaintenance(meta.cause, { provider: meta.provider_name ?? '—' });
        }
        if (meta.status && STATUS_KEYS.has(meta.status)) {
          return tMaintenance('status', { status: tStatus(meta.status) });
        }
        return null;
      default:
        return null;
    }
  };
}
