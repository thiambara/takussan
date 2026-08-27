'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConversationList } from './ConversationList';
import { ChatView } from './ChatView';
import { NewGroupDialog } from './NewGroupDialog';

/**
 * Two-pane messaging layout: conversation list on the left, active chat on
 * the right. Selection is held locally; the initial value can be seeded
 * from a `?conversation=ID` query param (TCK-274) so the floating chat
 * widget can deep-link into this page (mobile FAB, "Manage group" link).
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
  const [selectedId, setSelectedId] = useState<number | null>(initialId);
  const [groupOpen, setGroupOpen] = useState(false);

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
          <ConversationList selectedId={selectedId} onSelect={setSelectedId} />
        </div>
      </aside>
      <section className="flex flex-col overflow-hidden">
        {selectedId ? (
          <ChatView conversationId={selectedId} />
        ) : (
          <div className="flex flex-1 items-center justify-center bg-muted/50 p-8 text-center text-sm text-muted-foreground">
            {t('emptyState')}
          </div>
        )}
      </section>
      <NewGroupDialog
        open={groupOpen}
        onClose={() => setGroupOpen(false)}
        onCreated={(id) => setSelectedId(id)}
      />
    </div>
  );
}
