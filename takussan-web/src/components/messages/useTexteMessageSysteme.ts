'use client';

import { useTranslations } from 'next-intl';
import { useFormatteurs, VALEUR_ABSENTE } from '@/lib/format/useFormatteurs';
import type { MessageMetadata } from '@/types/message';
import { cleDuCanal } from './pont/pont'; // TCK-2984

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
 *
 * TCK-2962 — les codes des objets (TCK-2961 : échéances, baux, états des lieux, passages, visites,
 * réservations ; TCK-2964 : `visit.proposed`, `property.shared`), composés de `messaging.evenementsDuFil`
 * et des seules dates de `data` (jamais un montant : il n'y en a pas).
 */
const PROVIDER_CAUSES = new Set(['assigned', 'unassigned', 'accepted', 'declined']);
const STATUS_KEYS = new Set([
  'open', 'acknowledged', 'quote_requested', 'quote_submitted', 'awaiting_owner', 'approved',
  'rejected', 'assigned', 'in_progress', 'completed', 'closed', 'cancelled',
]);
const PREFIXE_INTERVENTION = 'maintenance.';

/** TCK-2962 — les codes d'objet que ce front sait dire, et la clé de `data` qui porte leur date. */
const CODES_D_OBJET: Readonly<Record<string, { readonly date?: string; readonly instant?: string }>> = {
  'lease_payment.due_soon': { date: 'due_date' },
  'lease_payment.overdue': { date: 'due_date' },
  'lease_payment.reminded': { date: 'due_date' },
  'lease_payment.paid': {},
  'lease_payment.receipt_issued': {},
  'lease.notice_given': { date: 'effective_date' },
  'lease.renewed': { date: 'start_date' },
  'inventory.awaiting_signature': {},
  // TCK-2967 — la signature d'une partie (`data.party` : `tenant`, `landlord`), puis celle de toutes.
  'inventory.signed_by_party': {},
  'inventory.signed': {},
  'maintenance.slot_requested': {},
  'maintenance.slot_set': { instant: 'scheduled_at' },
  'visit.confirmed': { instant: 'scheduled_at' },
  'visit.rescheduled': { instant: 'scheduled_at' },
  'visit.proposed': { instant: 'scheduled_at' },
  'visit.cancelled': {}, // TCK-2967
  'booking.confirmed': {},
  'property.shared': {},
  // TCK-2972 (ADR-0130 § 2) — les onze codes de l'engagement ; `data` ne porte que `due_at` (report) et
  // `reason` (annulation : `by_author`, `by_staff`, `object_closed`).
  'commitment.noted': {},
  'commitment.confirmed': {},
  'commitment.due_soon': {},
  'commitment.overdue': {},
  'commitment.reminded': {},
  'commitment.rescheduled': { instant: 'due_at' },
  'commitment.kept': {},
  'commitment.reopened': {},
  'commitment.cancelled': {},
  'commitment.check_requested': {},
  'commitment.not_kept_yet': {},
};

function texte(valeur: unknown): string | null {
  return typeof valeur === 'string' && valeur.trim() !== '' ? valeur : null;
}

export function useTexteMessageSysteme(): (meta: MessageMetadata | null | undefined) => string {
  const t = useTranslations('messaging.system');
  const tRole = useTranslations('messaging.group.info');
  const tMaintenance = useTranslations('messaging.maintenanceEvents');
  const tStatus = useTranslations('messaging.maintenanceEvents.statuses');
  const tObjet = useTranslations('messaging.evenementsDuFil');
  const tPont = useTranslations('messaging.pont'); // TCK-2984
  const f = useFormatteurs();

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
      // TCK-2984 (ADR-0132 § 3) — les avis du pont (`visibility = team`) : le canal, connu ou générique.
      case 'pont.stop':
      case 'pont.start':
      case 'pont.accord':
      case 'pont.media_non_relaye':
      case 'pont.numero_deja_a_un_compte':
        return tPont(`avis.${meta.event.slice('pont.'.length)}`, { canal: tPont(`canal.${cleDuCanal(meta.channel)}`) });
      default:
        return null;
    }
  };

  const avisDObjet = (meta: MessageMetadata): string | null => {
    const forme = meta.code ? CODES_D_OBJET[meta.code] : undefined;
    if (!meta.code || !forme) return null;
    const date = forme.date
      ? f.date(texte(meta.data?.[forme.date]), { dateStyle: 'long' })
      : forme.instant
        ? f.dateTime(texte(meta.data?.[forme.instant]))
        : VALEUR_ABSENTE;
    const jours = typeof meta.data?.days_late === 'number' ? meta.data.days_late : 0;
    // TCK-2967 — le rôle du signataire, un CODE ; inconnu ou absent : la branche `other` du libellé.
    const partie = texte(meta.data?.party) ?? 'other';
    // TCK-2972 — le motif d'une annulation d'engagement, un CODE ; inconnu ou absent : la branche `other`.
    const motif = texte(meta.data?.reason) ?? 'other';
    return tObjet(meta.code, { date, jours, partie, motif });
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

  return (meta) => (meta ? (meta.code !== undefined ? (avisDObjet(meta) ?? avisDIntervention(meta)) : avisSysteme(meta)) : null) ?? t('inconnu');
}
