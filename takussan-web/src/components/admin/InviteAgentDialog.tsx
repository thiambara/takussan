'use client';

import { useEffect } from 'react';
import { Controller } from 'react-hook-form';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { inviteAgencyAgent } from '@/lib/queries/agency-invitations';
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

/**
 * TCK-392 — inviter par e-mail quelqu'un qui **n'a pas de compte Takussan**.
 *
 * Ce chemin manquait entièrement à l'écran. `/admin/team` n'exposait que
 * {@link InviteMemberDialog}, qui appelle `POST /api/agencies/{id}/members` et
 * **exige un `User` déjà inscrit** (`abort_if($target === null, 422,
 * 'user_not_found_by_email')`) : aucune ligne `invitations` n'était jamais
 * écrite depuis cet écran, alors que le bouton disait « Inviter ». Un admin
 * d'agence ne pouvait donc pas faire entrer dans son équipe quelqu'un qui
 * n'était pas déjà sur la plateforme.
 *
 * L'endpoint, lui, existait depuis TCK-258 et n'avait **aucun appelant**.
 *
 * ## Les rôles offerts ici ne sont pas ceux de l'autre dialogue
 *
 * `AgentInvitationService::ALLOWED_ROLES` vaut `agent`, `agent_senior`,
 * `agent_manager`. `agency_admin` en est délibérément absent (TCK-209) et le
 * reste : le générique `POST /api/invitations` l'accepte, mais son acceptation
 * ne crée **aucun profil** (`InvitationService::finalizeAccept()` ne bascule que
 * l'`invitable`), si bien que l'invité obtiendrait un compte accepté et aucun
 * accès — pire que le refus actuel. L'écran le dit au lieu de le taire, et
 * renvoie vers le seul chemin qui existe (`admin.inviteAgent.adminNote`).
 */
const ROLE_KEYS = ['agent', 'agent_senior', 'agent_manager'] as const;

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
  const schema = buildSchema(t('emailInvalid'), t('required'));
  const roleOptions = ROLE_KEYS.map((k) => ({ value: k, label: t(`roles.${k}`) }));

  const { form, handleSubmit, isSubmitting, globalError } = useApiForm<FormValues, unknown>({
    schema,
    defaultValues: { first_name: '', last_name: '', email: '', phone: '', role: 'agent' },
    onSubmit: async (values) =>
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
              <input
                id="invite-agent-first-name"
                type="text"
                autoComplete="given-name"
                className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                {...register('first_name')}
              />
              {errors.first_name ? (
                <p className="mt-1 text-xs text-destructive" role="alert">
                  {errors.first_name.message}
                </p>
              ) : null}
            </div>
            <div>
              <label htmlFor="invite-agent-last-name" className="text-xs font-semibold text-foreground">
                {t('lastName')}
              </label>
              <input
                id="invite-agent-last-name"
                type="text"
                autoComplete="family-name"
                className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                {...register('last_name')}
              />
              {errors.last_name ? (
                <p className="mt-1 text-xs text-destructive" role="alert">
                  {errors.last_name.message}
                </p>
              ) : null}
            </div>
          </div>

          <div>
            <label htmlFor="invite-agent-email" className="text-xs font-semibold text-foreground">
              {t('email')}
            </label>
            <input
              id="invite-agent-email"
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
            <label htmlFor="invite-agent-phone" className="text-xs font-semibold text-foreground">
              {t('phone')}
            </label>
            <input
              id="invite-agent-phone"
              type="tel"
              autoComplete="tel"
              className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              {...register('phone')}
            />
            {errors.phone ? (
              <p className="mt-1 text-xs text-destructive" role="alert">
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
            <p className="mt-1 text-xs text-muted-foreground">{t('adminNote')}</p>
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
