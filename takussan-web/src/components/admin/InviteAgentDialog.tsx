'use client';

import { useEffect } from 'react';
import { Controller } from 'react-hook-form';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { inviteAgencyAgent } from '@/lib/queries/agency-invitations';
import { avecGardeDoubleFacteur } from '@/lib/double-facteur';
import { useGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { useApiForm } from '@/hooks/useApiForm';
import { useCan } from '@/hooks/useCan';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

/**
 * TCK-392 — inviter par e-mail quelqu'un, avec ou sans compte Takussan.
 *
 * L'endpoint `agents/invite` existait depuis TCK-258 et n'avait **aucun appelant** : l'équipe
 * n'exposait qu'un rattachement direct, sans ligne `invitations`.
 *
 * TCK-2365 (P242.01, décision du porteur du 2026-10-25) — c'est désormais le SEUL chemin d'entrée
 * dans l'équipe : `POST /api/agencies/{id}/members`, qui faisait d'un compte existant un agent actif
 * sans accord, est retirée, et le dialogue « Ajouter un compte existant » avec elle. Un compte
 * existant reçoit l'invitation à son adresse et l'accepte après s'être connecté.
 *
 * ## Deux rôles
 *
 * `AgentInvitationService::ALLOWED_ROLES` vaut `agent` et `agency_admin`. P234.01 (TCK-2280) :
 * « Agent senior » et « Responsable d'équipe » étaient offerts et jamais appliqués ; le rôle se
 * réaffecte après l'acceptation (`/app/agency/roles`). « Administrateur » n'est proposé qu'à qui
 * porte `team.assign_role` : l'API juge l'invitation d'un administrateur comme le changement de
 * rôle (TCK-1498, TCK-2205).
 */
const ROLE_KEYS = ['agent', 'agency_admin'] as const;

const buildSchema = (emailMessage: string, requiredMessage: string) =>
  z.object({
    first_name: z.string().trim().min(1, requiredMessage).max(80),
    last_name: z.string().trim().min(1, requiredMessage).max(80),
    email: z.string().email(emailMessage),
    phone: z.string().trim().max(30).optional(),
    role: z.enum(ROLE_KEYS),
  });

type FormValues = z.infer<ReturnType<typeof buildSchema>>;

interface InviteAgentDialogProps {
  readonly agencyId: number;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSuccess?: () => void;
}

export function InviteAgentDialog({
  agencyId,
  open,
  onOpenChange,
  onSuccess,
}: InviteAgentDialogProps) {
  const t = useTranslations('admin.inviteAgent');
  const tCommon = useTranslations('common.actions');
  const { token } = useAuth();
  // TCK-761 (P15.04) — inviter un agent exige la 2FA de l'admin (`AgentInvitationController`) :
  // `useApiForm` ne connaît pas la garde, l'appel lui est donc confié ici.
  const garde = useGardeDoubleFacteur();
  const schema = buildSchema(t('emailInvalid'), t('required'));
  const { can: canAssignRole } = useCan('team.assign_role', agencyId, open);
  const roleOptions = ROLE_KEYS
    .filter((k) => k !== 'agency_admin' || canAssignRole)
    .map((k) => ({ value: k, label: t(`roles.${k}`) }));

  const { form, handleSubmit, isSubmitting, globalError } = useApiForm<FormValues, unknown>({
    schema,
    defaultValues: { first_name: '', last_name: '', email: '', phone: '', role: 'agent' },
    onSubmit: async (values) =>
      avecGardeDoubleFacteur(
        () =>
          inviteAgencyAgent(
            agencyId,
            {
              email: values.email,
              role: values.role,
              first_name: values.first_name,
              last_name: values.last_name,
              // Une chaîne vide n'est pas « pas de téléphone » : la règle backend est
              // `nullable`, pas `nullable|string|min:0`.
              phone: values.phone?.trim() ? values.phone.trim() : null,
            },
            token ?? '',
          ),
        garde,
      ),
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
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="invite-agent-first-name" className="text-xs font-semibold text-foreground">
                {t('firstName')}
              </label>
              <Input
                id="invite-agent-first-name"
                type="text"
                autoComplete="given-name"
                className="mt-1"
                aria-invalid={errors.first_name ? true : undefined}
                aria-describedby={errors.first_name ? 'invite-agent-first-name-error' : undefined}
                {...register('first_name')}
              />
              {errors.first_name ? (
                <p id="invite-agent-first-name-error" className="mt-1 text-xs text-destructive" role="alert">
                  {errors.first_name.message}
                </p>
              ) : null}
            </div>
            <div>
              <label htmlFor="invite-agent-last-name" className="text-xs font-semibold text-foreground">
                {t('lastName')}
              </label>
              <Input
                id="invite-agent-last-name"
                type="text"
                autoComplete="family-name"
                className="mt-1"
                aria-invalid={errors.last_name ? true : undefined}
                aria-describedby={errors.last_name ? 'invite-agent-last-name-error' : undefined}
                {...register('last_name')}
              />
              {errors.last_name ? (
                <p id="invite-agent-last-name-error" className="mt-1 text-xs text-destructive" role="alert">
                  {errors.last_name.message}
                </p>
              ) : null}
            </div>
          </div>

          <div>
            <label htmlFor="invite-agent-email" className="text-xs font-semibold text-foreground">
              {t('email')}
            </label>
            <Input
              id="invite-agent-email"
              type="email"
              autoComplete="email"
              placeholder={t('emailPlaceholder')}
              className="mt-1"
                aria-invalid={errors.email ? true : undefined}
                aria-describedby={errors.email ? 'invite-agent-email-error' : undefined}
              {...register('email')}
            />
            {errors.email ? (
              <p id="invite-agent-email-error" className="mt-1 text-xs text-destructive" role="alert">
                {errors.email.message}
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor="invite-agent-phone" className="text-xs font-semibold text-foreground">
              {t('phone')}
            </label>
            <Input
              id="invite-agent-phone"
              type="tel"
              autoComplete="tel"
              className="mt-1"
                aria-invalid={errors.phone ? true : undefined}
                aria-describedby={errors.phone ? 'invite-agent-phone-error' : undefined}
              {...register('phone')}
            />
            {errors.phone ? (
              <p id="invite-agent-phone-error" className="mt-1 text-xs text-destructive" role="alert">
                {errors.phone.message}
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor="invite-agent-role" className="text-xs font-semibold text-foreground">
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
                  <SelectTrigger id="invite-agent-role" className="mt-1 w-full">
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
