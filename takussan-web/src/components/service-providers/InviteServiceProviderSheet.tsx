'use client';

/**
 * TCK-260 — Sheet/drawer that posts to
 * `POST /api/agencies/{agencyId}/service-providers/invite` and refreshes
 * the carnet prestataires listing on success.
 *
 * Le Sheet est entièrement contrôlé (parent owns `open` / `onOpenChange`)
 * pour qu'il puisse être déclenché aussi bien depuis le carnet
 * (`/app/maintenance/providers`) que depuis le formulaire de demande de
 * maintenance (TCK-261 réutilisera l'instance avec `prefilledTrades`,
 * `prefilledZones`, et `fromMaintenanceRequestId`).
 *
 * La visibilité du trigger est sous la responsabilité du parent (gated
 * sur `agency.kind` et la permission `invite_service_provider`). Le
 * backend re-vérifie via {@see App\Policies\Profiles\ServiceProviderProfilePolicy}.
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
  inviteServiceProvider,
  type InviteServiceProviderPayload,
  type InviteServiceProviderResponse,
} from '@/lib/queries/service-providers';
import { MAINTENANCE_CATEGORIES } from '@/types/maintenance';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

export type InviteServiceProviderSheetProps = {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly agencyId: number;
  /**
   * Pré-remplissage déclenché depuis le formulaire de demande de
   * maintenance — les métiers/zones de la demande sont propagés à
   * l'invitation pour gagner deux clics côté agent.
   */
  readonly prefilledTrades?: readonly string[];
  readonly prefilledZones?: readonly string[];
  readonly fromMaintenanceRequestId?: number;
  /**
   * Callback fired with the freshly-created invitation — utilisé par le
   * formulaire de maintenance (TCK-261) pour pré-sélectionner le
   * prestataire qu'on vient d'inviter.
   */
  readonly onInvited?: (response: InviteServiceProviderResponse) => void;
};

type FormState = {
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  trades: string[];
  intervention_zones: string[];
};

const DEFAULT_ZONES = [
  'Dakar',
  'Thiès',
  'Mbour',
  'Saint-Louis',
  'Kaolack',
  'Ziguinchor',
];

function emptyForm(
  prefilledTrades?: readonly string[],
  prefilledZones?: readonly string[],
): FormState {
  return {
    email: '',
    first_name: '',
    last_name: '',
    phone: '',
    trades: prefilledTrades ? [...prefilledTrades] : [],
    intervention_zones: prefilledZones ? [...prefilledZones] : [],
  };
}

export function InviteServiceProviderSheet({
  open,
  onOpenChange,
  agencyId,
  prefilledTrades,
  prefilledZones,
  fromMaintenanceRequestId,
  onInvited,
}: InviteServiceProviderSheetProps) {
  const tErr = useTranslations('errors');
  const t = useTranslations('serviceProviders.invite');
  const tCategories = useTranslations('serviceProviders.invite.trades');
  const messageErreur = useMessageErreurApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { token } = useAuth();
  const [form, setForm] = useState<FormState>(() =>
    emptyForm(prefilledTrades, prefilledZones),
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const mutation = useMutation<
    InviteServiceProviderResponse,
    ApiError,
    InviteServiceProviderPayload
  >({
    mutationFn: (payload) => {
      if (!token) {
        throw new ApiError(401, { message: tErr('missingToken') });
      }
      return inviteServiceProvider(token, agencyId, payload);
    },
    onSuccess: async (response) => {
      const otherAgency = response.meta?.existing_sp_other_agency === true;
      toast.add({
        title: t('toasts.success_title'),
        description: otherAgency
          ? t('toasts.existing_other_agency')
          : undefined,
        type: 'success',
      });
      setForm(emptyForm(prefilledTrades, prefilledZones));
      setFieldErrors({});
      onOpenChange(false);
      onInvited?.(response);
      await queryClient.invalidateQueries({
        queryKey: ['service-providers', agencyId],
      });
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
            : messageErreur(error);
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

  function toggleTrade(value: string) {
    setForm((prev) => ({
      ...prev,
      trades: prev.trades.includes(value)
        ? prev.trades.filter((t) => t !== value)
        : [...prev.trades, value],
    }));
  }

  function toggleZone(value: string) {
    setForm((prev) => ({
      ...prev,
      intervention_zones: prev.intervention_zones.includes(value)
        ? prev.intervention_zones.filter((z) => z !== value)
        : [...prev.intervention_zones, value],
    }));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending) return;

    const payload: InviteServiceProviderPayload = {
      email: form.email.trim(),
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      phone: form.phone.trim() || null,
      trades: form.trades,
      intervention_zones: form.intervention_zones,
      ...(fromMaintenanceRequestId !== undefined
        ? { metadata: { from_maintenance_request_id: fromMaintenanceRequestId } }
        : {}),
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
            <Label htmlFor="invite-sp-email">{t('fields.email')}</Label>
            <Input
              id="invite-sp-email"
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
              <Label htmlFor="invite-sp-first">{t('fields.first_name')}</Label>
              <Input
                id="invite-sp-first"
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
              <Label htmlFor="invite-sp-last">{t('fields.last_name')}</Label>
              <Input
                id="invite-sp-last"
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
            <Label htmlFor="invite-sp-phone">{t('fields.phone')}</Label>
            <Input
              id="invite-sp-phone"
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
              {t('fields.trades')}
            </legend>
            <div className="flex flex-wrap gap-2">
              {MAINTENANCE_CATEGORIES.map((cat) => {
                const active = form.trades.includes(cat);
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => toggleTrade(cat)}
                    className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                      active
                        ? 'border-app-topbar bg-app-topbar text-white'
                        : 'border-app-surface-2 bg-app-surface-1 text-app-ink-muted hover:border-app-topbar/50'
                    }`}
                  >
                    {tCategories(cat)}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-stone-900">
              {t('fields.intervention_zones')}
            </legend>
            <div className="flex flex-wrap gap-2">
              {DEFAULT_ZONES.map((zone) => {
                const active = form.intervention_zones.includes(zone);
                return (
                  <button
                    key={zone}
                    type="button"
                    onClick={() => toggleZone(zone)}
                    className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                      active
                        ? 'border-app-topbar bg-app-topbar text-white'
                        : 'border-app-surface-2 bg-app-surface-1 text-app-ink-muted hover:border-app-topbar/50'
                    }`}
                  >
                    {zone}
                  </button>
                );
              })}
            </div>
          </fieldset>

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
