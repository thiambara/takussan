'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { BoutonFlecheDeRetour } from '@/components/navigation-publique/FlecheDeRetour';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { initiales } from '@/lib/fiche-publique';
import { messageErreurApi } from '@/lib/api';
import { useCreateDirectConversation, type MessagingContact } from '@/lib/queries/conversations';
import { useMatchesMaxWidth } from '@/hooks/useMatchesMedia';
import { cn } from '@/lib/utils';
import { ChatComposerShell } from './ChatComposerShell';

interface BrouillonDirectProps {
  readonly personne: MessagingContact;
  readonly onBack?: () => void;
  /** Appelé avec l'identifiant du fil que le premier envoi vient de créer. */
  readonly onCreated: (conversationId: number) => void;
}

/**
 * TCK-2632 (AC4) — le fil à deux qui n'existe pas encore : « Nouvelle conversation » → une personne
 * sans fil. **Rien n'est en base** tant que rien n'est envoyé (même raison que
 * `PropertyDraftChatView`, TCK-500 : ouvrir n'écrit rien, pas de fil vide chez l'autre) ; le premier
 * envoi crée la conversation ET son premier message en UNE requête (`initial_message`), puis
 * l'écran passe au fil.
 *
 * Pas de trombone : `POST /api/conversations` ne reçoit qu'un texte. La pièce jointe revient dès le
 * premier message, avec `ChatView`.
 */
export function BrouillonDirect({ personne, onBack, onCreated }: BrouillonDirectProps) {
  const t = useTranslations('messaging');
  const tRacine = useTranslations();
  const tWidget = useTranslations('messaging.widget');
  const compact = useMatchesMaxWidth(1023);
  const creer = useCreateDirectConversation();
  const [texte, setTexte] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);

  async function envoyer(e?: React.SyntheticEvent) {
    e?.preventDefault();
    const contenu = texte.trim();
    if (!contenu || creer.isPending) return;
    setErreur(null);
    try {
      const res = await creer.mutateAsync({ participants: [personne.id], initial_message: contenu });
      onCreated(res.data.id);
    } catch (err) {
      setErreur(messageErreurApi(err, tRacine, t('nouvelle.envoiEchoue')));
    }
  }

  return (
    <div className="flex h-full flex-col" data-testid="brouillon-direct">
      <header
        className={cn(
          'flex flex-none items-center border-b border-border/70 bg-background',
          compact ? 'h-14 pr-1 pl-1' : 'h-16 gap-3 px-5',
        )}
      >
        {onBack ? <BoutonFlecheDeRetour libelle={tWidget('chatBack')} onClick={onBack} data-testid="chat-back-button" /> : null}
        <Avatar size={compact ? '36' : '40'}>
          {personne.avatar_url ? <AvatarImage src={personne.avatar_url} alt="" /> : null}
          <AvatarFallback>{initiales(personne.name)}</AvatarFallback>
        </Avatar>
        <h2 className={cn('min-w-0 flex-1 truncate text-base font-semibold text-foreground', compact && 'ml-2.5')}>{personne.name}</h2>
      </header>

      <div className="flex flex-1 items-center justify-center bg-muted/50 px-6 py-8">
        <p className="max-w-xs text-center text-sm text-pretty text-muted-foreground">
          {t('nouvelle.premierMessage', { nom: personne.name })}
        </p>
      </div>

      <ChatComposerShell
        onSubmit={(e) => void envoyer(e)}
        error={erreur}
        sendDisabled={creer.isPending || texte.trim().length === 0}
        sendAriaLabel={t('chat.sendAria')}
      >
        <Textarea
          rows={1}
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          placeholder={t('chat.placeholder')}
          aria-label={t('nouvelle.champ', { nom: personne.name })}
          className="min-h-11 resize-none sm:min-h-9"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) void envoyer(e);
          }}
        />
      </ChatComposerShell>
    </div>
  );
}
