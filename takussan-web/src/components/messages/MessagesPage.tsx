'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePropertyConversation } from '@/lib/queries/conversations';
import { ConversationList } from './ConversationList';
import { ChatView } from './ChatView';
import { PropertyDraftChatView } from './PropertyDraftChatView';
import { NewGroupDialog } from './NewGroupDialog';

/**
 * Two-pane messaging layout: conversation list on the left, active chat on
 * the right. Selection is held locally; the initial value can be seeded
 * from a `?conversation=ID` query param (TCK-274) so the floating chat
 * widget can deep-link into this page (mobile FAB, "Manage group" link).
 *
 * TCK-500 — second point d'entrée : `?property=<slug>`, posé par la fiche d'un bien EN DESSOUS
 * du point de rupture `md`, où le panneau flottant ne tient pas. La page résout elle-même le
 * bien et ouvre soit le fil existant, soit un fil qui n'existe pas encore avec son brouillon.
 *
 * ⚠️ **L'URL ne porte que le slug, jamais le texte du message.** Le brouillon est reconstruit
 * ICI, dans la locale de la page. Un `?draft=<texte>` aurait été plus simple à écrire et aurait
 * laissé n'importe qui forger un lien qui pré-remplit une phrase dans le composeur d'un tiers.
 */
export function MessagesPage() {
  const t = useTranslations('messaging');
  const searchParams = useSearchParams();
  const initialId = (() => {
    const raw = searchParams?.get('conversation');
    if (!raw) return null;
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : null;
  })();
  const propertySlug = searchParams?.get('property') || null;

  const [selectedId, setSelectedId] = useState<number | null>(initialId);
  const [groupOpen, setGroupOpen] = useState(false);
  /**
   * Le brouillon s'efface dès que l'utilisateur choisit autre chose. Un booléen plutôt qu'une
   * recopie de la résolution : dériver au rendu évite les deux sources de vérité qui se
   * désynchronisent — et le `setState` dans un effet que la règle `react-hooks` refuse.
   */
  const [brouillonEcarte, setBrouillonEcarte] = useState(false);

  const { data: resolution } = usePropertyConversation(propertySlug);
  const bien = resolution?.data ?? null;

  const brouillon =
    !brouillonEcarte && bien && bien.can_message && bien.conversation_id === null ? bien : null;
  // Un choix explicite dans la liste l'emporte toujours sur ce que l'URL avait amené.
  const conversationAffichee = selectedId ?? bien?.conversation_id ?? null;

  function choisir(id: number): void {
    setBrouillonEcarte(true);
    setSelectedId(id);
  }

  return (
    <div className="grid h-[calc(100vh-12rem)] grid-cols-[320px_1fr] overflow-hidden rounded-xl border border-border bg-card">
      <aside className="flex flex-col border-r border-border">
        <div className="flex items-center justify-between border-b border-border p-2">
          <h2 className="text-sm font-semibold text-muted-foreground">{t('listHeading')}</h2>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setGroupOpen(true)}
            data-testid="new-group-button"
          >
            <Plus className="mr-1 size-4" aria-hidden />
            {t('newGroup')}
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <ConversationList selectedId={conversationAffichee} onSelect={choisir} />
        </div>
      </aside>
      <section className="flex flex-col overflow-hidden">
        {brouillon ? (
          <PropertyDraftChatView
            property={brouillon.property}
            recipientName={brouillon.recipient?.name ?? null}
            recipientAvatarUrl={brouillon.recipient?.avatar_url ?? null}
            onCreated={choisir}
          />
        ) : conversationAffichee ? (
          <ChatView conversationId={conversationAffichee} />
        ) : (
          <div className="flex flex-1 items-center justify-center bg-muted/50 p-8 text-center text-sm text-muted-foreground">
            {t('emptyState')}
          </div>
        )}
      </section>
      <NewGroupDialog
        open={groupOpen}
        onClose={() => setGroupOpen(false)}
        onCreated={choisir}
      />
    </div>
  );
}
