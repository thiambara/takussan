'use client';

import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Loader2, NotebookPen, Pin, Send } from 'lucide-react';
import { EmptyState } from '@/components/feedback';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { createCustomerNoteAction } from '@/app/actions/dashboard-customers';
import { formatDateTime } from '@/lib/format';
import type { Locale } from '@/i18n/config';
import type { CustomerNote } from '@/types/customer';
import { cn } from '@/lib/utils';

/**
 * Chronological note timeline — TCK-042.
 *
 * AC : notes horodatées, non modifiables après création. The timeline sorts
 * newest-first; pinned notes float to the top.
 */

interface CustomerNotesTimelineProps {
  readonly customerId: number;
  readonly notes: CustomerNote[];
}

export function CustomerNotesTimeline({
  customerId,
  notes,
}: CustomerNotesTimelineProps) {
  const router = useRouter();
  const locale = useLocale() as Locale;
  const t = useTranslations('crm.customerDetail.notes');
  const [body, setBody] = useState('');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = body.trim();
    if (trimmed.length === 0) {
      setError(t('emptyBody'));
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createCustomerNoteAction(customerId, trimmed);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setBody('');
      router.refresh();
    });
  };

  const sorted = [...notes].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return (
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  });

  return (
    <section className="space-y-4">
      <form onSubmit={submit} className="space-y-2 rounded-xl bg-app-surface-1 p-4">
        <label
          htmlFor="customer-note-body"
          className="text-sm font-medium text-app-ink"
        >
          {t('add')}
        </label>
        <Textarea
          id="customer-note-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          maxLength={5000}
          placeholder={t('placeholder')}
          disabled={pending}
        />
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end">
          <Button type="submit" disabled={pending || body.trim().length === 0}>
            {pending ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <Send aria-hidden="true" />
            )}
            {t('publish')}
          </Button>
        </div>
      </form>

      {sorted.length === 0 ? (
        <EmptyState
          icon={<NotebookPen className="size-8" aria-hidden="true" />}
          title={t('empty_title')}
          description={t('empty_description')}
        />
      ) : (
        <ol className="space-y-3">
          {sorted.map((note) => (
            <li
              key={note.id}
              className={cn(
                'rounded-xl bg-app-surface-1 p-4',
                note.pinned && 'ring-1 ring-primary/30',
              )}
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-xs text-app-ink-muted">
                  {note.author_name ? `${note.author_name} · ` : ''}
                  {formatDateTime(note.created_at, locale)}
                </p>
                {note.pinned ? (
                  <Pin className="size-3 text-primary" aria-label={t('pinnedAria')} />
                ) : null}
              </div>
              <p className="whitespace-pre-line text-sm text-app-ink">{note.body}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
