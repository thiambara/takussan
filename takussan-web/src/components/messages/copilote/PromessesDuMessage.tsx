'use client';

import { useContext, useEffect, useState } from 'react';
import { QueryClientContext } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { Handshake } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { formatDateTime } from '@/lib/format';
import {
  deciderLaSuggestion,
  demanderLesPromesses,
  etatDuCopiloteQueryKey,
  useEtatDuCopilote,
  type PromesseRepere,
} from '@/lib/queries/copilote';
import type { Locale } from '@/i18n/config';
import type { Message } from '@/types/message';
import { NoterUnEngagement, type ParticipantDuFil } from '../engagements/NoterUnEngagement';
import { CadreDeLAssistant, MarqueDeLAssistant, PourVousSeulement } from './GrammaireDeLAssistant';

/**
 * TCK-2978 (ADR-0131 § 3, § 5) — les promesses se demandent À L'OUVERTURE du fil, une fois par ouverture
 * (`demanderLesPromesses`) ; l'API n'appelle le modèle que s'il y a de nouveaux messages. Monté pour le seul
 * personnel servi par le copilote.
 */
export function DemandeDesPromesses({ conversationId, dernierMessageId }: { readonly conversationId: number; readonly dernierMessageId: number | null }) {
  const { user, token } = useAuth();
  const locale = useLocale();
  const queryClient = useContext(QueryClientContext);
  const userId = user?.id ?? null;
  const [ouverture] = useState(dernierMessageId);
  const premier = ouverture ?? dernierMessageId;
  useEffect(() => {
    if (userId === null || premier === null) return;
    demanderLesPromesses(conversationId, userId, premier, { token, locale }, () => {
      void queryClient?.invalidateQueries({ queryKey: etatDuCopiloteQueryKey(conversationId, userId) });
    });
  }, [conversationId, userId, premier, token, locale, queryClient]);
  return null;
}

interface PromessesDuMessageProps {
  readonly conversationId: number;
  readonly message: Message;
  readonly participants: readonly ParticipantDuFil[];
}

/**
 * TCK-2978 (maquette `fil-copilote` A, écran `extraction`) — sous un message, AU PLUS un bloc « Repéré par
 * l'assistant » : une carte par promesse (porteur · libellé, échéance), « Noter l'engagement » (le formulaire du
 * lot 3, pré-rempli ; seule sa route crée) et « Écarter » (`rejected`). Écarté ou noté, le bloc se replie.
 */
export function PromessesDuMessage({ conversationId, message, participants }: PromessesDuMessageProps) {
  const t = useTranslations('messaging.copilote.promesses');
  const { user, token } = useAuth();
  const locale = useLocale();
  const queryClient = useContext(QueryClientContext);
  const userId = user?.id ?? null;
  const { etat } = useEtatDuCopilote(conversationId, userId, true);
  const [replies, setReplies] = useState<ReadonlySet<number>>(new Set());
  const [aNoter, setANoter] = useState<PromesseRepere | null>(null);
  const promesses = (etat?.promesses.liste ?? []).filter((p) => p.messageId === message.id && !replies.has(p.suggestionId));

  const replier = (id: number) => setReplies((r) => new Set([...r, id]));
  const relire = () => void queryClient?.invalidateQueries({ queryKey: etatDuCopiloteQueryKey(conversationId, userId) });

  if (promesses.length === 0 && aNoter === null) return null;

  return (
    <li data-testid="promesses-du-message">
      {promesses.length > 0 ? (
        <CadreDeLAssistant>
          <MarqueDeLAssistant texte={t('titre', { count: promesses.length })} />
          <div className="mt-2 space-y-2.5">
            {promesses.map((p) => {
              const porteur = participants.find((x) => x.id === p.porteurId)?.nom ?? '—';
              return (
                <div key={p.suggestionId} className="rounded-xl border border-border bg-card p-3" data-testid="promesse">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Handshake className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
                    {t('unePromesse')}
                  </p>
                  <p className="mt-1 text-corps font-semibold leading-snug">{t('porteurEtLibelle', { porteur, libelle: p.libelle })}</p>
                  <p className="text-ui text-muted-foreground">
                    {p.echeance ? formatDateTime(p.echeance, locale as Locale, { dateStyle: 'medium', timeStyle: 'short' }) : t('sansEcheance')}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => setANoter(p)}>
                      {t('noter')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        replier(p.suggestionId);
                        void deciderLaSuggestion({ suggestionId: p.suggestionId, decision: 'rejected' }, { token, locale }).then(relire, relire);
                      }}
                    >
                      {t('ecarter')}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-2.5">
            <PourVousSeulement />
          </div>
        </CadreDeLAssistant>
      ) : null}
      {aNoter && userId !== null ? (
        <NoterUnEngagement
          key={aNoter.suggestionId}
          conversationId={conversationId}
          message={message}
          participants={participants}
          moi={userId}
          duPersonnel
          open
          onOpenChange={(o) => !o && setANoter(null)}
          prerempli={{ holder_id: aNoter.porteurId, title: aNoter.libelle, due_at: aNoter.echeance }}
          onCree={(corps) => {
            const promesse = aNoter;
            replier(promesse.suggestionId);
            const identique =
              corps.holder_id === promesse.porteurId && corps.title === promesse.libelle && memeInstant(corps.due_at, promesse.echeance) && !('beneficiary_id' in corps);
            void deciderLaSuggestion(
              identique
                ? { suggestionId: promesse.suggestionId, decision: 'accepted' }
                : { suggestionId: promesse.suggestionId, decision: 'edited', final: { ...corps } },
              { token, locale },
            ).then(relire, relire);
          }}
        />
      ) : null}
    </li>
  );
}

function memeInstant(a: unknown, b: string | null): boolean {
  if (typeof a !== 'string' || b === null) return a === b;
  return Date.parse(a) === Date.parse(b);
}
