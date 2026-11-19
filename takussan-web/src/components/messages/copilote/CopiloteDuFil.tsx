'use client';

import { useContext } from 'react';
import { QueryClientContext } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Sparkles } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { messagesInfiniteQueryKey, sujetDuFil } from '@/lib/queries/conversations-cles';
import { useEtatDuCopilote } from '@/lib/queries/copilote';
import { useSignal } from '@/lib/temps-reel/hooks';
import { cn } from '@/lib/utils';
import { raisonDuSilence } from './EtatDeLAssistant';

/**
 * TCK-2977 — ✦ de l'en-tête : ouvre « Demander au fil ». Grisé (jamais rouge) quand l'assistant est en pause
 * ou coupé ; il ouvre quand même la feuille, qui dit pourquoi. Monté par `ChatView` pour le SEUL personnel
 * dont le fil a `copilote` vrai : il est le premier à lire l'état, donc la première requête `…/copilote`.
 */
export function BoutonDeLAssistant({ conversationId, onOuvrir }: { readonly conversationId: number; readonly onOuvrir: () => void }) {
  const t = useTranslations('messaging.copilote');
  const { user } = useAuth();
  const { etat } = useEtatDuCopilote(conversationId, user?.id ?? null, true);
  const eteint = raisonDuSilence(etat?.resume) !== null || raisonDuSilence(etat?.question) !== null;
  return (
    <button
      type="button"
      onClick={onOuvrir}
      aria-label={eteint ? t('indisponible') : t('ouvrir')}
      aria-haspopup="dialog"
      data-testid="bouton-assistant"
      data-eteint={eteint || undefined}
      className={cn(
        'inline-flex size-11 flex-none items-center justify-center rounded-full outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring lg:size-9 lg:rounded-lg',
        eteint ? 'text-muted-foreground/60' : 'text-primary-deep',
      )}
    >
      <Sparkles className="size-5 lg:size-4.5" strokeWidth={1.75} aria-hidden="true" />
    </button>
  );
}

/**
 * TCK-2977 (TCK-2976) — une transcription arrive par `message.updated` sur le canal de l'UTILISATEUR (les seuls
 * lecteurs des notes d'équipe), jamais sur celui du fil : `useFilEnDirect` ne l'entend pas. Ce composant relit
 * les pages chargées du fil ouvert. Monté pour le seul personnel servi.
 */
export function EcouteDesTranscriptions({ conversationId }: { readonly conversationId: number }) {
  const queryClient = useContext(QueryClientContext);
  useSignal({ personnel: ['message.updated'] }, (signal) => {
    if (signal !== null && signal.subject.startsWith('conversation:') && signal.subject !== sujetDuFil(conversationId)) return;
    void queryClient?.invalidateQueries({ queryKey: messagesInfiniteQueryKey(conversationId) }, { cancelRefetch: false });
  });
  return null;
}
