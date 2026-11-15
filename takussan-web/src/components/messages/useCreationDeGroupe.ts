'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  useCreateGroupConversation,
  type CreateGroupConversationPayload,
  type MessagingContact,
} from '@/lib/queries/conversations';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import type { GroupContextOption } from './GroupContextPicker';
import { phrasesDeValidation } from './erreursDeValidation';

export const MIN_PARTICIPANTS = 2; // creator + 2 others = 3 total
export const MAX_PARTICIPANTS = 19; // creator + 19 = 20 total

/**
 * TCK-2748 — la création d'un groupe, UNE fois, pour ses deux formulaires : `NewGroupDialog` (deux
 * étapes, au téléphone et entre `md` et `lg`) et le mode « groupe » de `NouvelleConversation` au
 * bureau (un seul formulaire, maquette a-3). L'état (personnes, nom, bien, bail), la cohérence du
 * bien et du bail, les bornes, et l'envoi `POST /api/conversations` (`type: group`) avec les phrases
 * de l'API par problème (M13).
 */
export function useCreationDeGroupe() {
  const t = useTranslations('messaging.group.create');
  const messageErreur = useMessageErreurApi();
  const create = useCreateGroupConversation();
  const [participants, setParticipants] = useState<MessagingContact[]>([]);
  const [subject, setSubject] = useState('');
  const [bien, setBien] = useState<GroupContextOption | null>(null);
  const [bail, setBail] = useState<GroupContextOption | null>(null);
  const [erreurs, setErreurs] = useState<string[]>([]);
  const setError = (phrase: string | null) => setErreurs(phrase ? [phrase] : []);

  function reset() {
    setParticipants([]);
    setSubject('');
    setBien(null);
    setBail(null);
    setError(null);
  }

  /** Assez de personnes ? Sinon, la phrase est posée et `false` rendu. */
  function verifierLesParticipants(): boolean {
    setError(null);
    if (participants.length < MIN_PARTICIPANTS) {
      setError(t('minParticipants', { min: MIN_PARTICIPANTS + 1 }));
      return false;
    }
    return true;
  }

  function choisirBien(suivant: GroupContextOption | null) {
    setBien(suivant);
    // Un bail d'un AUTRE bien ne peut pas rester choisi : la liste des baux se restreint au bien,
    // et l'API refuse la paire (`CreateGroupConversationRequest`, 422 sur `lease_id`).
    // ⚠ On compare au bien DU BAIL, pas au bien précédent (réparation 1, 2026-09-24) : choisir le
    // bail, puis son propre bien, effaçait le bail parce que le bien passait de « aucun » à « un ».
    // Retirer le bien garde le bail : un bail seul est un rattachement valide.
    if (suivant !== null && bail !== null && bail.propertyId !== suivant.id) setBail(null);
  }

  /** Le `POST` groupe : l'identifiant du fil créé, ou `null` (erreurs posées). */
  async function creer(): Promise<number | null> {
    setError(null);
    if (subject.trim().length === 0) {
      setError(t('subjectRequired'));
      return null;
    }
    const payload: CreateGroupConversationPayload = {
      type: 'group',
      subject: subject.trim(),
      participants: participants.map((p) => p.id),
    };
    if (bien) payload.property_id = bien.id;
    if (bail) payload.lease_id = bail.id;
    try {
      const res = await create.mutateAsync(payload);
      return res.data.id;
    } catch (err) {
      // Les phrases de l'API, une par problème — jamais le résumé `message` d'une 422, qui n'en
      // montre qu'une et accole « (and N more error) » (M13, cf. `phrasesDeValidation`).
      setErreurs(phrasesDeValidation(err) ?? [messageErreur(err, t('createFailed'))]);
      return null;
    }
  }

  return {
    participants,
    setParticipants,
    subject,
    setSubject,
    bien,
    choisirBien,
    bail,
    setBail,
    erreurs,
    setError,
    reset,
    verifierLesParticipants,
    creer,
    enCours: create.isPending,
  };
}
