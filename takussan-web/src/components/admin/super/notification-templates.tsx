'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { patchNotificationTemplate, previewNotificationTemplate } from '@/lib/queries/super-admin';
import type {
  NotificationTemplateChannel,
  NotificationTemplateDetail,
  NotificationTemplateLocale,
} from '@/types/super-admin';
import type { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

const CHANNELS: NotificationTemplateChannel[] = ['email', 'sms', 'push'];
const LOCALES: NotificationTemplateLocale[] = ['fr', 'en', 'wo'];

export function NotificationEventList({
  items,
  selected,
  onSelect,
}: {
  items: NotificationTemplateDetail[];
  selected: string;
  onSelect: (event: string) => void;
}) {
  const t = useTranslations('superAdmin.templates');
  const events = useMemo(() => {
    const map = new Map<string, NotificationTemplateDetail>();
    for (const item of items) if (!map.has(item.event)) map.set(item.event, item);
    return Array.from(map.values());
  }, [items]);

  return (
    <nav className="rounded-xl bg-white p-2 ring-1 ring-stone-200" aria-label={t('eventsNav')}>
      {events.map((item) => (
        <Button
          key={item.event}
          type="button"
          variant={selected === item.event ? 'default' : 'ghost'}
          className="mb-1 h-auto w-full justify-start whitespace-normal px-3 py-2 text-left"
          onClick={() => onSelect(item.event)}
        >
          <span>
            <span className="block">{item.name}</span>
            <span className="block text-xs opacity-75">{item.domain}</span>
          </span>
        </Button>
      ))}
    </nav>
  );
}

export function TemplateEditor({
  detail,
  onChannelSelect,
}: {
  detail: NotificationTemplateDetail;
  onChannelSelect: (channel: NotificationTemplateChannel) => void;
}) {
  const t = useTranslations('superAdmin.templates');
  const tCommon = useTranslations('common');
  const messageErreur = useMessageErreurApi();
  const queryClient = useQueryClient();
  const [locale, setLocale] = useState<NotificationTemplateLocale>('fr');
  const [templates, setTemplates] = useState(detail.templates);
  const [isActive, setIsActive] = useState(detail.is_active);
  const [preview, setPreview] = useState<{ subject: string; body: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => patchNotificationTemplate(detail.event, detail.channel, { templates, is_active: isActive }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'notification-templates'] });
    },
    onError: (err: ApiError) => setError(messageErreur(err)),
  });

  const previewMutation = useMutation({
    mutationFn: () => previewNotificationTemplate(detail.event, detail.channel, locale),
    onSuccess: (data) => setPreview(data.data),
    onError: (err: ApiError) => setError(messageErreur(err)),
  });

  const current = templates[locale];
  const smsSegments = detail.channel === 'sms' ? Math.ceil((current.body.length || 1) / 160) : null;

  return (
    <section className="rounded-xl bg-white ring-1 ring-stone-200">
      <div className="flex flex-col gap-3 border-b border-stone-200 p-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="font-display text-xl font-semibold text-stone-950">{detail.name}</h2>
          <p className="mt-1 text-sm text-stone-600">{detail.event}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {detail.placeholders.map((placeholder) => (
              <Badge key={placeholder} variant="outline">{`{{ ${placeholder} }}`}</Badge>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant={isActive ? 'default' : 'outline'} onClick={() => setIsActive((v) => !v)}>
            {isActive ? t('active') : t('inactive')}
          </Button>
          <Button type="button" variant="outline" onClick={() => previewMutation.mutate()}>
            <Eye className="size-4" aria-hidden="true" />
            {t('preview')}
          </Button>
          <Button type="button" onClick={() => save.mutate()} disabled={save.isPending}>
            <Save className="size-4" aria-hidden="true" />
            {tCommon('actions.save')}
          </Button>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="flex flex-wrap gap-2">
          {CHANNELS.map((value) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={value === detail.channel ? 'default' : 'outline'}
              onClick={() => onChannelSelect(value)}
            >
              {value.toUpperCase()}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {LOCALES.map((value) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={locale === value ? 'default' : 'outline'}
              onClick={() => setLocale(value)}
            >
              {value.toUpperCase()}
            </Button>
          ))}
        </div>
        {detail.channel === 'email' ? (
          <label className="block text-sm font-medium">
            <span className="mb-1 block">{t('subject')}</span>
            <Input
              value={current.subject ?? ''}
              onChange={(event) => setTemplates((prev) => ({
                ...prev,
                [locale]: { ...prev[locale], subject: event.target.value },
              }))}
            />
          </label>
        ) : null}
        <label className="block text-sm font-medium">
          <span className="mb-1 flex items-center justify-between">
            {t('body')}
            {smsSegments ? <span className={cn('text-xs', smsSegments > 6 && 'text-destructive')}>{t('smsSegments', { count: smsSegments })}</span> : null}
          </span>
          <Textarea
            rows={detail.channel === 'email' ? 12 : 6}
            value={current.body}
            onChange={(event) => setTemplates((prev) => ({
              ...prev,
              [locale]: { ...prev[locale], body: event.target.value },
            }))}
          />
        </label>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
      <TemplatePreviewDialog preview={preview} onOpenChange={(open) => !open && setPreview(null)} />
    </section>
  );
}

export function TemplatePreviewDialog({
  preview,
  onOpenChange,
}: {
  preview: { subject: string; body: string } | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('superAdmin.templates');
  return (
    <Dialog open={preview !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('previewTitle')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 rounded-lg bg-stone-50 p-4 text-sm">
          {preview?.subject ? <p className="font-semibold text-stone-950">{preview.subject}</p> : null}
          <p className="whitespace-pre-wrap text-stone-700">{preview?.body}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
