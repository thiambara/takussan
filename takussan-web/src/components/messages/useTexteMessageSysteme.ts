'use client';

import { useTranslations } from 'next-intl';
import type { MessageMetadata } from '@/types/message';

/**
 * TCK-085, TCK-592, TCK-671 — le texte d'un avis, rendu depuis ses CODES dans la langue du lecteur.
 *
 * Partagé par la bulle du fil (`SystemMessageBubble`) et l'aperçu de la liste (`ConversationList`).
 *
 * TCK-2958 (ADR-0128) — deux formes :
 *  - un avis système (`system`) : `metadata.event` (`participant_added`, `role_changed`…) ;
 *  - un avis d'intervention (`event`) : `metadata.code` = `maintenance.<cause>`, `metadata.data`
 *    (`status`, `provider_name`…).
 * Le `content` et le `last_message_preview` de l'API ne sont plus qu'un code : ils ne sont JAMAIS
 * montrés. Un code que ce front ne connaît pas rend un libellé générique (`messaging.system.inconnu`).
 */
const PROVIDER_CAUSES = new Set(['assigned', 'unassigned', 'accepted', 'declined']);
const STATUS_KEYS = new Set([
  'open', 'acknowledged', 'quote_requested', 'quote_submitted', 'awaiting_owner', 'approved',
  'rejected', 'assigned', 'in_progress', 'completed', 'closed', 'cancelled',
]);
const PREFIXE_INTERVENTION = 'maintenance.';

function texte(valeur: unknown): string | null {
  return typeof valeur === 'string' && valeur.trim() !== '' ? valeur : null;
}

export function useTexteMessageSysteme(): (meta: MessageMetadata | null | undefined) => string {
  const t = useTranslations('messaging.system');
  const tRole = useTranslations('messaging.group.info');
  const tMaintenance = useTranslations('messaging.maintenanceEvents');
  const tStatus = useTranslations('messaging.maintenanceEvents.statuses');

  const avisSysteme = (meta: MessageMetadata): string | null => {
    const actor = meta.actor_name ?? '—';
    const target = meta.target_name ?? '—';

    switch (meta.event) {
      case 'participant_added':
        return t('participantAdded', { actor, target });
      case 'participant_removed':
        return t('participantRemoved', { actor, target });
      case 'role_changed':
        // L'API émet `role` (`SystemMessageFactory::roleChanged()`) ; un rôle inconnu rend le générique.
        if (meta.role === 'admin') return t('roleChanged', { actor, target, role: tRole('roleAdmin') });
        if (meta.role === 'member') return t('roleChanged', { actor, target, role: tRole('roleMember') });
        return null;
      case 'renamed':
        return t('renamed', { actor, subject: meta.new_subject ?? '—' });
      default:
        return null;
    }
  };

  const avisDIntervention = (meta: MessageMetadata): string | null => {
    const code = meta.code;
    if (!code?.startsWith(PREFIXE_INTERVENTION)) return null;
    const cause = code.slice(PREFIXE_INTERVENTION.length);
    if (PROVIDER_CAUSES.has(cause)) {
      return tMaintenance(cause, { provider: texte(meta.data?.provider_name) ?? '—' });
    }
    const status = texte(meta.data?.status);
    if (status && STATUS_KEYS.has(status)) {
      return tMaintenance('status', { status: tStatus(status) });
    }
    return null;
  };

  return (meta) => (meta ? (meta.code !== undefined ? avisDIntervention(meta) : avisSysteme(meta)) : null) ?? t('inconnu');
}
