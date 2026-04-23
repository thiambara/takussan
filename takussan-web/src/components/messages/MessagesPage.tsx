'use client';

import { useState } from 'react';
import { ConversationList } from './ConversationList';
import { ChatView } from './ChatView';

/**
 * Two-pane messaging layout: conversation list on the left, active chat on
 * the right. Selection is held locally — deep-linking (URL-driven) can be
 * added later without changing the API surface.
 */
export function MessagesPage() {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  return (
    <div className="grid h-[calc(100vh-12rem)] grid-cols-[320px_1fr] overflow-hidden rounded-xl border border-stone-200 bg-white">
      <aside className="border-r border-stone-200 overflow-y-auto">
        <ConversationList selectedId={selectedId} onSelect={setSelectedId} />
      </aside>
      <section className="flex flex-col overflow-hidden">
        {selectedId ? (
          <ChatView conversationId={selectedId} />
        ) : (
          <div className="flex flex-1 items-center justify-center bg-stone-50 p-8 text-center text-sm text-stone-500">
            Sélectionnez une conversation pour afficher les messages.
          </div>
        )}
      </section>
    </div>
  );
}
