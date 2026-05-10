'use client';

/**
 * TCK-256 — Sheet/drawer that posts to
 * `POST /api/agencies/{agencyId}/owners/invite` and refreshes the owners
 * listing on success.
 *
 * The sheet is fully controlled (parent owns `open` / `onOpenChange`) so
 * it can be triggered from anywhere — the `/app/owners` "Add owner" CTA
 * *and* the property creation form's "Invite a new owner" option both
 * mount the same instance.
 *
 * The visibility of the trigger button is the caller's responsibility
 * (gated on `agency.kind === 'standard'` and the `invite_owner`
 * permission). Once the sheet is open, the backend re-checks both rules
 * via {@see App\Policies\OwnerProfilePolicy} so an evaded UI gate still
 * yields a 403.
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
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/context/AuthContext';
import { ApiError } from '@/lib/api';
import {
  inviteOwner,
  type InviteOwnerPayload,
  type InvitationSummary,
} from '@/lib/queries/owners';
import type { ApiResponse } from '@/types/api';

export type InviteOwnerSheetProps = {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly agencyId: number;
  /**
   * Optional callback fired with the freshly-created invitation. Property-
   * creation form uses it to auto-select the just-invited owner in its
   * dropdown without waiting for the next page load.
   */
  readonly onInvited?: (invitation: InvitationSummary) => void;
};

type FormState = {
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  owner_type: 'individual' | 'company';
  company_name: string;
};

const EMPTY_FORM: FormState = {
  email: '',
  first_name: '',
  last_name: '',
  phone: '',
  owner_type: 'individual',
  company_name: '',
};

export function InviteOwnerSheet({
  open,
  onOpenChange,
  agencyId,
  onInvited,
}: InviteOwnerSheetProps) {
  const t = useTranslations('owners.invite');
  const toast = useToast();
  const queryClient = useQueryClient();
  const { token } = useAuth();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const mutation = useMutation<ApiResponse<InvitationSummary>, ApiError, InviteOwnerPayload>({
    mutationFn: (payload) => {
      if (!token) {
        throw new ApiError(401, { message: 'no token' });
      }
      return inviteOwner(token, agencyId, payload);
    },
    onSuccess: async (response) => {
      toast.add({ title: t('toasts.success_title'), type: 'success' });
      setForm(EMPTY_FORM);
      setFieldErrors({});
      onOpenChange(false);
      onInvited?.(response.data);
      await queryClient.invalidateQueries({ queryKey: ['owners', agencyId] });
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
    if (fieldErrors[key]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending) return;

    const payload: InviteOwnerPayload = {
      email: form.email.trim(),
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      phone: form.phone.trim() || null,
      owner_type: form.owner_type,
      company_name:
        form.owner_type === 'company' ? form.company_name.trim() || null : null,
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
        if (!nextOpen) {
          setFieldErrors({});
        }
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
            <Label htmlFor="invite-owner-email">{t('fields.email')}</Label>
            <Input
              id="invite-owner-email"
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
              <Label htmlFor="invite-owner-first">{t('fields.first_name')}</Label>
              <Input
                id="invite-owner-first"
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
              <Label htmlFor="invite-owner-last">{t('fields.last_name')}</Label>
              <Input
                id="invite-owner-last"
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
            <Label htmlFor="invite-owner-phone">{t('fields.phone')}</Label>
            <Input
              id="invite-owner-phone"
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

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-stone-900">
              {t('fields.owner_type')}
            </legend>
            <div className="flex gap-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="owner_type"
                  value="individual"
                  checked={form.owner_type === 'individual'}
                  onChange={() => update('owner_type', 'individual')}
                />
                {t('owner_types.individual')}
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="owner_type"
                  value="company"
                  checked={form.owner_type === 'company'}
                  onChange={() => update('owner_type', 'company')}
                />
                {t('owner_types.company')}
              </label>
            </div>
          </fieldset>

          {form.owner_type === 'company' ? (
            <div className="space-y-1.5">
              <Label htmlFor="invite-owner-company">
                {t('fields.company_name')}
              </Label>
              <Input
                id="invite-owner-company"
                required
                value={form.company_name}
                onChange={(e) => update('company_name', e.target.value)}
                aria-invalid={!!fieldError('company_name')}
              />
              {fieldError('company_name') ? (
                <p className="text-xs text-destructive">
                  {fieldError('company_name')}
                </p>
              ) : null}
            </div>
          ) : null}

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
