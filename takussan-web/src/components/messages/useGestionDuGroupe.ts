'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  useAddParticipants,
  useRemoveParticipant,
  useRenameConversation,
  useToggleMute,
  useUpdateParticipantRole,
  type MessagingContact,
} from '@/lib/queries/conversations';
import { useAuth } from '@/context/AuthContext';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import type { Conversation, ConversationParticipant } from '@/types/message';
import { phrasesDeValidation } from './erreursDeValidation';

/** Taille maximale d'un groupe, créateur compris — la borne de `AddParticipantsRequest`. */
export const MAX_GROUP_SIZE = 20;

/**
 * TCK-2748 — la gestion d'un groupe, UNE fois, pour ses deux surfaces : la feuille
 * `ConversationInfoSheet` (sous `xl`) et la colonne « Infos du groupe » du bureau (`InfosDuGroupe`,
 * dès `xl`). Les participants actuels, l'administration de l'appelant, la règle du dernier
 * administrateur, et les gestes — renommer, inviter, retirer, promouvoir, rétrograder, sourdine,
 * quitter — avec leurs refus dits dans une seule zone d'erreur (P228.05).
 *
 * La règle du départ est double : l'écran refuse avant l'appel (`dernierAdmin`), et l'API refuse
 * aussi (`GroupConversationService::removeParticipant`, 422 `promote_admin_before_leaving`) pour un
 * écran périmé — ce refus-là passe par `direLeRefus`.
 */
export function useGestionDuGroupe(conversation: Conversation | undefined, onParti?: () => void) {
  const t = useTranslations('messaging.group.info');
  const messageErreur = useMessageErreurApi();
  const { user } = useAuth();
  const conversationId = conversation?.id ?? 0;

  const rename = useRenameConversation(conversationId);
  const addParticipants = useAddParticipants(conversationId);
  const removeParticipant = useRemoveParticipant(conversationId);
  const updateRole = useUpdateParticipantRole(conversationId);
  const toggleMute = useToggleMute(conversationId);

  const [erreurs, setErreurs] = useState<string[]>([]);
  const setError = (phrase: string | null) => setErreurs(phrase ? [phrase] : []);

  const participants: ConversationParticipant[] = (conversation?.participants ?? []).filter((p) => !p.left_at);
  const moi = participants.find((p) => p.user_id === user?.id);
  const estAdmin = moi?.role === 'admin';
  const dernierAdmin = estAdmin && participants.filter((p) => p.role === 'admin').length === 1;

  // P228.05 (TCK-2218) — retrait, départ, rôle et sourdine disent leur refus dans la zone d'erreur de
  // l'écran (404 d'un participant déjà parti, 422 du dernier administrateur sur un écran périmé).
  const direLeRefus = (err: unknown) => setErreurs([messageErreur(err)]);

  function renommer(sujet: string) {
    setError(null);
    if (sujet.trim().length === 0) return;
    rename.mutate(
      { subject: sujet.trim() },
      { onError: (err) => setErreurs(phrasesDeValidation(err) ?? [messageErreur(err, t('renameFailed'))]) },
    );
  }

  /** TCK-565 — l'invitation se fait PAR LE NOM ; choisir une personne l'ajoute aussitôt. */
  function inviter(contact: MessagingContact | undefined) {
    setError(null);
    if (!contact) return;
    addParticipants.mutate(
      { user_ids: [contact.id] },
      // Les phrases de l'API, pas le résumé d'une 422 (M13, cf. `phrasesDeValidation`).
      { onError: (err) => setErreurs(phrasesDeValidation(err) ?? [messageErreur(err, t('addFailed'))]) },
    );
  }

  function retirer(userId: number) {
    setError(null);
    removeParticipant.mutate({ user_id: userId }, { onError: direLeRefus });
  }

  function changerDeRole(userId: number, role: 'admin' | 'member') {
    setError(null);
    updateRole.mutate({ user_id: userId, role }, { onError: direLeRefus });
  }

  function basculerLaSourdine(sourdine: boolean) {
    setError(null);
    toggleMute.mutate({ is_muted: !sourdine }, { onError: direLeRefus });
  }

  function quitter() {
    if (!user) return;
    if (dernierAdmin) {
      setError(t('lastAdminLeaveBlocked'));
      return;
    }
    setError(null);
    removeParticipant.mutate({ user_id: user.id }, { onSuccess: () => onParti?.(), onError: direLeRefus });
  }

  return {
    conversationId,
    moiId: user?.id ?? null,
    participants,
    estAdmin,
    dernierAdmin,
    erreurs,
    setError,
    renommer,
    inviter,
    retirer,
    changerDeRole,
    basculerLaSourdine,
    quitter,
    enCours: {
      renommer: rename.isPending,
      inviter: addParticipants.isPending,
      retirer: removeParticipant.isPending,
      role: updateRole.isPending,
      sourdine: toggleMute.isPending,
    },
  };
}
