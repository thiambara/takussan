'use client';

import { useEffect } from 'react';
import { Controller } from 'react-hook-form';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { addAgencyMember, type AgencyMemberRole } from '@/lib/queries/agency-members';
import { useApiForm } from '@/hooks/useApiForm';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const ROLE_KEYS = ['agent', 'agency_admin'] as const;

/**
 * TCK-292 — le schéma vit DANS ce composant client, `useTranslations` y est donc
 * appelable : le message de validation se résout à la construction du schéma
 * plutôt que d'être figé en français au niveau du module.
 */
const buildSchema = (emailMessage: string) =>
  z.object({
    email: z.string().email(emailMessage),
    role: z.enum(['agent', 'agency_admin']),
  });

type FormValues = z.infer<ReturnType<typeof buildSchema>>;

interface InviteMemberDialogProps {
  readonly agencyId: number;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSuccess?: () => void;
}

export function InviteMemberDialog({
  agencyId,
  open,
  onOpenChange,
  onSuccess,
}: InviteMemberDialogProps) {
  const t = useTranslations('admin.inviteMember');
  const tCommon = useTranslations('common.actions');
  const { token } = useAuth();
  const schema = buildSchema(t('emailInvalid'));
  const roleOptions = ROLE_KEYS.map((k) => ({ value: k, label: t(`roles.${k}`) }));

  const { form, handleSubmit, isSubmitting, globalError } = useApiForm<
    FormValues,
    unknown
  >({
    schema,
    defaultValues: { email: '', role: 'agent' },
    onSubmit: async (values) => {
      return addAgencyMember(
        agencyId,
        { email: values.email, role: values.role as AgencyMemberRole },
        token ?? '',
      );
    },
    onSuccess: () => {
      onSuccess?.();
      onOpenChange(false);
      form.reset();
    },
  });

  useEffect(() => {
    if (!open) form.reset();
  }, [open, form]);

  const {
    register,
    control,
    formState: { errors },
  } = form;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="invite-email" className="text-xs font-semibold text-app-ink">
              {t('email')}
            </label>
            <input
              id="invite-email"
              type="email"
              autoComplete="email"
              placeholder={t('emailPlaceholder')}
              className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              {...register('email')}
            />
            {errors.email ? (
              <p className="mt-1 text-xs text-destructive" role="alert">
                {errors.email.message}
              </p>
            ) : null}
          </div>
          <div>
            <label htmlFor="invite-role" className="text-xs font-semibold text-app-ink">
              {t('role')}
            </label>
            <Controller
              control={control}
              name="role"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(value) => field.onChange(value ?? 'agent')}
                  items={roleOptions}
                >
                  <SelectTrigger id="invite-role" className="mt-1 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {globalError ? (
            <p className="text-sm text-destructive" role="alert">
              {globalError}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              {tCommon('cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
              {t('submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
