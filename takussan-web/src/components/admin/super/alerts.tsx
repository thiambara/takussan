'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Send, Settings2, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  createAlertRule,
  deleteAlertRule,
  patchAlertRule,
  testAlertRule,
} from '@/lib/queries/super-admin';
import type { AlertRule } from '@/types/super-admin';
import type { ApiError } from '@/lib/api';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

/**
 * TCK-292 — valeurs d'EXEMPLE techniques : noms de canaux de l'API, adresse et URL d'exemple.
 * Ce n'est pas du texte affiché à traduire — un exemple traduit ne correspondrait plus à ce que
 * le back accepte.
 */
const CHANNELS_PLACEHOLDER = 'email,slack,discord';
const EMAIL_PLACEHOLDER = 'ops@example.com';
const WEBHOOK_PLACEHOLDER = 'https://hooks.slack.com/...';

export function AlertRuleTable({ rules, catalogue }: { rules: AlertRule[]; catalogue: Record<string, string> }) {
  const t = useTranslations('superAdmin.alerts');
  const tCommon = useTranslations('common');
  const [editing, setEditing] = useState<AlertRule | null>(null);
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: deleteAlertRule,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['super-admin', 'alert-rules'] }),
  });

  return (
    <section className="rounded-xl bg-white ring-1 ring-stone-200">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-stone-200 text-sm">
          <thead className="bg-stone-50 text-left text-xs font-semibold uppercase text-stone-500">
            <tr>
              <th className="px-4 py-2">{t('colEvent')}</th>
              <th className="px-4 py-2">{t('colChannels')}</th>
              <th className="px-4 py-2">{t('colFailures')}</th>
              <th className="px-4 py-2"><span className="sr-only">{t('colActions')}</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rules.map((rule) => (
              <tr key={rule.id}>
                <td className="px-4 py-3">
                  <p className="font-medium text-stone-950">{rule.label}</p>
                  <p className="text-xs text-stone-500">{rule.event}</p>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {rule.channels.map((channel) => <Badge key={channel} variant="outline">{channel}</Badge>)}
                  </div>
                </td>
                <td className="px-4 py-3">{rule.failure_count}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <AlertTestButton ruleId={rule.id} />
                    <Button type="button" variant="outline" onClick={() => setEditing(rule)}>
                      <Settings2 className="size-4" aria-hidden="true" />
                      {t('edit')}
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => remove.mutate(rule.id)}>
                      <Trash2 className="size-4" aria-hidden="true" />
                      {tCommon('actions.delete')}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <AlertRuleDialog key={editing?.id ?? 'none'} rule={editing} catalogue={catalogue} open={editing !== null} onOpenChange={(open) => !open && setEditing(null)} />
    </section>
  );
}

export function AlertRuleDialog({
  rule,
  catalogue,
  open,
  onOpenChange,
}: {
  rule: AlertRule | null;
  catalogue: Record<string, string>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('superAdmin.alerts');
  const tCommon = useTranslations('common');
  const messageErreur = useMessageErreurApi();
  const queryClient = useQueryClient();
  const firstEvent = Object.keys(catalogue)[0] ?? 'super_admin_setting_updated';
  const [event, setEvent] = useState(rule?.event ?? firstEvent);
  const [channels, setChannels] = useState((rule?.channels ?? ['email']).join(','));
  const [emails, setEmails] = useState((rule?.recipients.emails ?? []).join(','));
  const [webhooks, setWebhooks] = useState((rule?.recipients.webhooks ?? []).join(','));
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        event,
        channels: channels.split(',').map((item) => item.trim()).filter(Boolean),
        recipients: {
          emails: emails.split(',').map((item) => item.trim()).filter(Boolean),
          webhooks: webhooks.split(',').map((item) => item.trim()).filter(Boolean),
        },
        is_active: true,
      };
      return rule ? patchAlertRule(rule.id, payload) : createAlertRule(payload);
    },
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'alert-rules'] });
      onOpenChange(false);
    },
    onError: (err: ApiError) => setError(messageErreur(err)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{rule ? t('editRule') : t('newRule')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block space-y-1.5">
            <Label htmlFor="alert-event">{t('colEvent')}</Label>
            <Input id="alert-event" value={event} onChange={(e) => setEvent(e.target.value)} list="alert-events" />
            <datalist id="alert-events">
              {Object.entries(catalogue).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </datalist>
          </label>
          <label className="block space-y-1.5">
            <Label htmlFor="alert-channels">{t('colChannels')}</Label>
            <Input id="alert-channels" value={channels} onChange={(e) => setChannels(e.target.value)} placeholder={CHANNELS_PLACEHOLDER} />
          </label>
          <label className="block space-y-1.5">
            <Label htmlFor="alert-emails">{t('emails')}</Label>
            <Input id="alert-emails" value={emails} onChange={(e) => setEmails(e.target.value)} placeholder={EMAIL_PLACEHOLDER} />
          </label>
          <label className="block space-y-1.5">
            <Label htmlFor="alert-webhooks">{t('webhooks')}</Label>
            <Input id="alert-webhooks" value={webhooks} onChange={(e) => setWebhooks(e.target.value)} placeholder={WEBHOOK_PLACEHOLDER} />
          </label>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{tCommon('actions.cancel')}</Button>
          <Button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {tCommon('actions.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AlertTestButton({ ruleId }: { ruleId: number }) {
  const t = useTranslations('superAdmin.alerts');
  const [queued, setQueued] = useState(false);
  const mutation = useMutation({
    mutationFn: () => testAlertRule(ruleId),
    onSuccess: () => setQueued(true),
  });

  return (
    <Button type="button" variant={queued ? 'default' : 'ghost'} onClick={() => mutation.mutate()} disabled={mutation.isPending}>
      <Send className="size-4" aria-hidden="true" />
      {queued ? t('testSent') : t('test')}
    </Button>
  );
}
