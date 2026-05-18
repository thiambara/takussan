'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Info, ShieldAlert, X } from 'lucide-react';
import { useLocale } from 'next-intl';
import { dismissAnnouncement, fetchActiveAnnouncements, localizedAnnouncementText } from '@/lib/queries/announcements';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { Announcement, AnnouncementsResponse } from '@/types/super-admin';

const SEVERITY_CLASS: Record<Announcement['severity'], string> = {
  info: 'border-stone-300 bg-stone-900 text-stone-50',
  success: 'border-emerald-300 bg-emerald-900 text-emerald-50',
  warning: 'border-amber-300 bg-amber-800 text-amber-50',
  critical: 'border-red-300 bg-red-900 text-red-50',
};

const ICONS = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  critical: ShieldAlert,
};

export function GlobalAnnouncementBanner() {
  const locale = useLocale();
  const queryClient = useQueryClient();
  const query = useQuery<AnnouncementsResponse>({
    queryKey: ['announcements', 'active'],
    queryFn: fetchActiveAnnouncements,
    staleTime: 60_000,
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: dismissAnnouncement,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['announcements', 'active'] }),
  });

  const announcement = query.data?.data?.[0];
  if (!announcement) return null;

  const copy = localizedAnnouncementText(announcement, locale);
  const Icon = ICONS[announcement.severity];
  const canDismiss = announcement.severity !== 'critical';

  return (
    <div className={cn('border-b px-4 py-3 shadow-sm', SEVERITY_CLASS[announcement.severity])}>
      <div className="mx-auto flex max-w-7xl items-start gap-3">
        <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-semibold">{copy.title}</p>
          <p className="mt-0.5 text-sm opacity-90">{copy.body}</p>
        </div>
        {canDismiss ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 text-current hover:bg-white/10"
            aria-label="Masquer l'annonce"
            onClick={() => mutation.mutate(announcement.id)}
            disabled={mutation.isPending}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
