'use client';

/**
 * TCK-258 — Sheet/drawer that posts to
 * `POST /api/agencies/{agencyId}/agents/invite` and refreshes the team
 * listing on success.
 *
 * Mirrors the `<InviteOwnerSheet>` pattern from TCK-256 — fully
 * controlled (parent owns `open` / `onOpenChange`), validation errors
 * surfaced inline, 409 / 403 mapped to friendly toasts.
 *
 * Visibility of the trigger button is the caller's responsibility
 * (gated on `agency.kind === 'standard'` and the `manage_team`
 * permission). The backend re-checks both rules via
 * {@see App\Policies\AgentProfilePolicy}.
 */

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/context/AuthContext';
import { ApiError } from '@/lib/api';
import {
  inviteAgent,
  type InviteAgentPayload,
  type InvitationSummary,
  type InvitedRole,
} from '@/lib/queries/team';
import type { ApiResponse } from '@/types/api';

export type InviteAgentModalProps = {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly agencyId: number;
};

type FormState = {
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  role: InvitedRole;
};

const EMPTY_FORM: FormState = {
  email: '',
  first_name: '',
  last_name: '',
  phone: '',
  role: 'agent',
};

export function InviteAgentModal({
  open,
  onOpenChange,
  agencyId,
}: InviteAgentModalProps) {
  const t = useTranslations('team.invite');
  const toast = useToast();
  const queryClient = useQueryClient();
  const { token } = useAuth();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const mutation = useMutation<ApiResponse<InvitationSummary>, ApiError, InviteAgentPayload>({
    mutationFn: (payload) => {
      if (!token) throw new ApiError(401, { message: 'no token' });
      return inviteAgent(token, agencyId, payload);
    },
    onSuccess: async () => {
      toast.add({ title: t('toasts.success_title'), type: 'success' });
      setForm(EMPTY_FORM);
      setFieldErrors({});
      onOpenChange(false);
      await queryClient.invalidateQueries({ queryKey: ['team', agencyId] });
    },
    onError: (error) => {
      if (error.status === 422 && error.validationErrors) {
        setFieldErrors(error.validationErrors);
        return;
      }
      const description =
        error.status === 409
          ? t('errors.already_member')
          : error.status === 403
            ? t('errors.forbidden')
            : error.displayMessage;
      toast.add({ title: t('toasts.error_title'), description, type: 'error' });
    },
  });

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (fieldErrors[key as string]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[key as string];
        return next;
      });
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending) return;

    const payload: InviteAgentPayload = {
      email: form.email.trim(),
      role: form.role,
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      phone: form.phone.trim() || null,
    };
    mutation.mutate(payload);
  }

  function fieldError(key: string): string | undefined {
    return fieldErrors[key]?.[0];
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) setFieldErrors({});
      }}
    >
      <SheetContent
        side="right"
        className="w-full max-w-md sm:max-w-lg overflow-y-auto p-6"
      >
        <SheetHeader className="mb-6">
          <SheetTitle>{t('title')}</SheetTitle>
          <SheetDescription>{t('subtitle')}</SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="invite-agent-email">{t('fields.email')}</Label>
            <Input
              id="invite-agent-email"
              type="email"
              autoComplete="off"
              required
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
              aria-invalid={!!fieldError('email')}
            />
            {fieldError('email') ? (
              <p className="text-xs text-destructive">{fieldError('email')}</p>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="invite-agent-first">{t('fields.first_name')}</Label>
              <Input
                id="invite-agent-first"
                required
                value={form.first_name}
                onChange={(e) => update('first_name', e.target.value)}
                aria-invalid={!!fieldError('first_name')}
              />
              {fieldError('first_name') ? (
                <p className="text-xs text-destructive">{fieldError('first_name')}</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-agent-last">{t('fields.last_name')}</Label>
              <Input
                id="invite-agent-last"
                required
                value={form.last_name}
                onChange={(e) => update('last_name', e.target.value)}
                aria-invalid={!!fieldError('last_name')}
              />
              {fieldError('last_name') ? (
                <p className="text-xs text-destructive">{fieldError('last_name')}</p>
              ) : null}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="invite-agent-phone">{t('fields.phone')}</Label>
            <Input
              id="invite-agent-phone"
              type="tel"
              autoComplete="off"
              value={form.phone}
              onChange={(e) => update('phone', e.target.value)}
              placeholder="+221 77 000 00 00"
              aria-invalid={!!fieldError('phone')}
            />
            {fieldError('phone') ? (
              <p className="text-xs text-destructive">{fieldError('phone')}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="invite-agent-role">{t('fields.role')}</Label>
            <Select
              value={form.role}
              onValueChange={(value) => update('role', (value ?? 'agent') as InvitedRole)}
              items={[
                { value: 'agent', label: t('roles.agent') },
                { value: 'agent_senior', label: t('roles.agent_senior') },
                { value: 'agent_manager', label: t('roles.agent_manager') },
              ]}
            >
              <SelectTrigger
                id="invite-agent-role"
                className="w-full"
                aria-invalid={!!fieldError('role')}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="agent">{t('roles.agent')}</SelectItem>
                <SelectItem value="agent_senior">{t('roles.agent_senior')}</SelectItem>
                <SelectItem value="agent_manager">{t('roles.agent_manager')}</SelectItem>
              </SelectContent>
            </Select>
            {fieldError('role') ? (
              <p className="text-xs text-destructive">{fieldError('role')}</p>
            ) : null}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              {t('cta.cancel')}
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? t('cta.submitting') : t('cta.submit')}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
