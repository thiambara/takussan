'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Home } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { submitContactMessage } from '@/app/actions/property';
import { construireBrouillonBien } from '@/lib/messages/brouillonBien';
import { propertyConversationQueryKey } from '@/lib/queries/conversations';
import { useTriggerMinimalProfileOnce } from '@/hooks/useTriggerMinimalProfileOnce';
import { ChatComposerShell } from './ChatComposerShell';

export interface BienDuFilNeuf {
  readonly slug: string;
  readonly title: string;
  readonly reference_number: string;
  readonly main_photo_url?: string | null;
}

interface PropertyDraftChatViewProps {
  readonly property: BienDuFilNeuf;
  readonly recipientName?: string | null;
  readonly recipientAvatarUrl?: string | null;
  /** `widget` ajoute le bouton de retour, comme dans `ChatView`. */
  readonly variant?: 'page' | 'widget';
  readonly onBack?: () => void;
  /** Appelé avec l'identifiant du fil que l'envoi vient de créer. */
  readonly onCreated: (conversationId: number) => void;
}

/**
 * TCK-500 — le fil qui n'existe pas encore.
 *
 * ⚠️ **Rien de ce qui est à l'écran n'est en base.** Ouvrir cette vue n'écrit pas une ligne :
 * pas de conversation, pas de participant, pas de notification. C'est le point central du
 * ticket — la solution qui vient en premier, créer le fil à l'ouverture pour que `ChatView`
 * n'ait rien à apprendre, déposerait une conversation vide dans la boîte d'un agent à chaque
 * visiteur qui ouvre le chat par curiosité. La conversation naît du PREMIER ENVOI, par
 * `contact-message`, qui la crée et poste le message d'un seul geste. L'écran bascule ensuite
 * sur `ChatView` via `onCreated`.
 *
 * **Le brouillon est une valeur, pas une indication.** Le bouton d'envoi est actif avant la
 * moindre frappe, et tout le texte est remplaçable — c'est le geste WhatsApp, et c'est ce qui
 * distingue ce composant du `placeholder` qui l'a précédé.
 *
 * **Pas de trombone**, et ce n'est pas un oubli : `contact-message` n'accepte qu'un texte.
 * Proposer une pièce jointe qui serait silencieusement perdue serait pire que ne pas la
 * proposer. Elle revient dès le premier message, avec `ChatView`.
 */
export function PropertyDraftChatView({
  property,
  recipientName,
  recipientAvatarUrl,
  variant = 'page',
  onBack,
  onCreated,
}: PropertyDraftChatViewProps) {
  const t = useTranslations('messaging');
  const tBrouillon = useTranslations('messaging.propertyDraft');
  const tWidget = useTranslations('messaging.widget');
  // TCK-253 — contacter un agent reste une action sensible : même invite de profil minimal que
  // le favori et la réservation. Sans effet hors du tableau de bord client (fournisseur absent).
  const { triggerIfNeeded } = useTriggerMinimalProfileOnce();
  const queryClient = useQueryClient();

  // ⚠️ Initialiseur PARESSEUX, et c'est le détail qui porte AC3 : le brouillon est calculé une
  // seule fois, au montage. Le recalculer à chaque rendu — ce que ferait un `useEffect` qui
  // « resynchronise » ou un simple `value={brouillon}` — réimposerait le texte par-dessus ce que
  // l'utilisateur vient d'écrire, et le champ redeviendrait ineffaçable : exactement le défaut du
  // `placeholder` qu'on remplace, en pire.
  const [content, setContent] = useState(() =>
    construireBrouillonBien((cle, valeurs) => tBrouillon(cle, valeurs), property),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function envoyer(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const texte = content.trim();
    if (!texte || pending) return;
    setPending(true);
    setError(null);
    triggerIfNeeded();
    try {
      const res = await submitContactMessage(property.slug, texte);
      if (!res.ok || !res.data) {
        setError(res.ok ? t('chat.loadError') : res.message);
        return;
      }
      // ⚠️ SANS cette invalidation, le fil qui vient de naître reste invisible à la résolution
      // pendant 30 s (`staleTime`) — et un second clic sur « Envoyer un message » depuis la fiche
      // reposerait le brouillon PAR-DESSUS une conversation déjà ouverte. Le défaut ne se voit
      // qu'en cliquant deux fois de suite : passé le délai, la vue se corrige toute seule, ce qui
      // est exactement ce qui rend ce genre de bogue difficile à croire sur parole.
      await queryClient.invalidateQueries({
        queryKey: propertyConversationQueryKey(property.slug),
      });
      onCreated(res.data.conversation_id);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border bg-card px-4 py-3">
        {variant === 'widget' && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onBack}
            aria-label={tWidget('chatBack')}
            data-testid="chat-back-button"
          >
            <ArrowLeft className="size-4" aria-hidden />
          </Button>
        )}
        <div className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
          {property.main_photo_url ? (
            <Image src={property.main_photo_url} alt="" fill sizes="40px" className="object-cover" />
          ) : (
            <Home className="size-5 text-muted-foreground" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-foreground">{property.title}</h2>
          <Link
            href={`/properties/${property.slug}`}
            className="text-xs text-muted-foreground hover:underline"
          >
            {t('chat.viewProperty')}
          </Link>
        </div>
        {recipientAvatarUrl && (
          <div className="relative size-8 shrink-0 overflow-hidden rounded-full bg-muted">
            <Image src={recipientAvatarUrl} alt="" fill sizes="32px" className="object-cover" />
          </div>
        )}
      </header>

      <div
        className="flex flex-1 items-center justify-center bg-muted/50 px-6 py-8"
        data-testid="chat-draft-empty-thread"
      >
        <p className="max-w-xs text-center text-sm text-muted-foreground">
          {recipientName
            ? tBrouillon('newThreadHint', { name: recipientName })
            : tBrouillon('newThreadHintNoName')}
        </p>
      </div>

      <ChatComposerShell
        onSubmit={(e) => void envoyer(e)}
        error={error}
        sendDisabled={pending || content.trim().length === 0}
        sendAriaLabel={t('chat.sendAria')}
      >
        <Textarea
          rows={1}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={t('chat.placeholder')}
          className="min-h-9 resize-none"
          data-testid="chat-draft-textarea"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void envoyer(e);
            }
          }}
        />
      </ChatComposerShell>
    </div>
  );
}
