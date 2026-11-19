'use client';

import { useContext, useEffect } from 'react';
import { QueryClientContext } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { messagesInfiniteQueryKey } from '@/lib/queries/conversations-cles';
import { demanderLaTranscription } from '@/lib/queries/copilote';
import { relaisImpersonationActif } from '@/lib/impersonation';
import type { TranscriptionDeLaNote as Transcription } from '@/types/message';
import { MarqueDeLAssistant } from './GrammaireDeLAssistant';

/**
 * TCK-2977 (ADR-0131 § 7, maquette `fil-copilote` A, écran `vocal`) — sous le lecteur d'une note vocale, séparée
 * par un filet en tirets, dans la grammaire de l'assistant :
 *
 * · `prete` : « ✦ Transcription automatique », le texte en italique, « Peut contenir des erreurs · la note fait
 *   foi » — sauf une langue rendue autre que `fr`, qui dit « Seules les notes en français sont transcrites » ;
 * · `en_cours` : une ligne discrète, sans spinner ;
 * · `indisponible` : « ✦ Transcription indisponible » et la phrase de son code.
 *
 * **Clé `transcription` absente : rien, et aucune requête** — l'API ne la rend qu'au personnel servi par le
 * copilote (TCK-2976). `aucune` : la transcription est demandée À L'AFFICHAGE, une fois par note et par
 * session (`demanderLaTranscription`), puis le fil se relit ; `message.updated` apporte la suite.
 */
export function TranscriptionDeLaNote({
  conversationId,
  messageId,
  transcription,
}: {
  readonly conversationId: number;
  readonly messageId: number;
  readonly transcription: Transcription | undefined;
}) {
  const t = useTranslations('messaging.copilote.transcription');
  const { user, token } = useAuth();
  const locale = useLocale();
  // Le contexte, pas `useQueryClient()` qui lève sans fournisseur (harnais de `ChatView`).
  const queryClient = useContext(QueryClientContext);
  const etat = transcription?.etat;
  const userId = user?.id ?? null;

  useEffect(() => {
    // Jamais sous impersonation : l'API la refuserait, et rien ne doit partir au nom de la cible.
    if (etat !== 'aucune' || userId === null || relaisImpersonationActif()) return;
    demanderLaTranscription(conversationId, messageId, userId, { token, locale }, () => {
      void queryClient?.invalidateQueries({ queryKey: messagesInfiniteQueryKey(conversationId) }, { cancelRefetch: false });
    });
  }, [etat, userId, conversationId, messageId, token, locale, queryClient]);

  if (!transcription || etat === 'aucune') return null;

  const autreLangue = etat === 'prete' && transcription.langue != null && transcription.langue !== '' && transcription.langue !== 'fr';
  const filet = 'mt-2 border-t border-dashed border-primary/40 pt-2';

  if (etat === 'en_cours') {
    return (
      <p className={`${filet} text-xs text-muted-foreground`} data-testid="transcription-de-la-note" aria-live="polite">
        {t('enCours')}
      </p>
    );
  }

  if (etat === 'prete' && !autreLangue && transcription.texte) {
    return (
      <div className={filet} data-testid="transcription-de-la-note">
        <MarqueDeLAssistant texte={t('prete')} />
        <p className="mt-0.5 text-corps italic leading-snug text-pretty break-words">{transcription.texte}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t('avertissement')}</p>
      </div>
    );
  }

  return (
    <div className={filet} data-testid="transcription-de-la-note">
      <MarqueDeLAssistant texte={t('indisponible')} />
      <p className="mt-0.5 text-ui leading-snug text-muted-foreground">{t(phraseDeLIndisponibilite(transcription.code, autreLangue))}</p>
    </div>
  );
}

/** La phrase courte d'une transcription indisponible, selon son code (TCK-2976) ou la langue rendue. */
export function phraseDeLIndisponibilite(
  code: string | null | undefined,
  autreLangue: boolean,
): 'francaisSeulement' | 'nonActivee' | 'pause' | 'desactivee' | 'echec' {
  if (autreLangue) return 'francaisSeulement';
  switch (code) {
    case 'ai.role_unassigned':
      return 'nonActivee';
    case 'copilote.budget_epuise':
      return 'pause';
    case 'copilote.coupe':
      return 'desactivee';
    default:
      return 'echec';
  }
}
