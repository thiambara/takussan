'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FlaskConical, Save, Settings2 } from 'lucide-react';
import { DataTable, StatusBadge, type DataTableColumn } from '@/components/console';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { overrideAdminFeatureFlag, patchAdminFeatureFlag } from '@/lib/queries/super-admin';
import type { AdminFeatureFlag } from '@/types/super-admin';
import type { ApiError } from '@/lib/api';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

/**
 * TCK-292 — valeur d'EXEMPLE composée d'identifiants de rôle de l'API (`agency_admin`, `agent`).
 * Ce n'est pas du texte affiché à traduire : le traduire produirait un exemple qui ne correspond
 * à aucune valeur acceptée par le back.
 */
const ROLE_SLUGS_PLACEHOLDER = 'agency_admin,agent';

export function FeatureFlagTable({ flags }: { flags: AdminFeatureFlag[] }) {
  const t = useTranslations('superAdmin.featureFlags');
  const [editing, setEditing] = useState<AdminFeatureFlag | null>(null);

  const columns: DataTableColumn<AdminFeatureFlag>[] = [
    {
      id: 'flag',
      header: t('colFlag'),
      cell: (flag) => (
        <>
          <p className="font-medium text-foreground">{flag.label}</p>
          <p className="text-xs text-muted-foreground">{flag.key}</p>
        </>
      ),
    },
    {
      id: 'state',
      header: t('colState'),
      cell: (flag) => (
        <StatusBadge
          tone={flag.enabled ? 'success' : 'neutral'}
          label={flag.enabled ? t('enabled') : t('disabled')}
        />
      ),
    },
    {
      id: 'segments',
      header: t('colSegments'),
      className: 'text-muted-foreground',
      cell: (flag) =>
        flag.segments.rollout_percentage ? `${flag.segments.rollout_percentage}%` : t('global'),
    },
    {
      id: 'actions',
      header: t('colActions'),
      headerSrOnly: true,
      align: 'end',
      cell: (flag) => (
        <div className="flex justify-end gap-2">
          <SessionOverrideToggle flag={flag} />
          <Button type="button" variant="outline" onClick={() => setEditing(flag)}>
            <Settings2 className="size-4" aria-hidden="true" />
            {t('configure')}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <section>
      <DataTable
        caption={t('tableCaption')}
        columns={columns}
        rows={flags}
        rowKey={(flag) => flag.key}
      />
      <FeatureFlagSegmentDialog key={editing?.key ?? 'none'} flag={editing} open={editing !== null} onOpenChange={(open) => !open && setEditing(null)} />
    </section>
  );
}

export function FeatureFlagSegmentDialog({
  flag,
  open,
  onOpenChange,
}: {
  flag: AdminFeatureFlag | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('superAdmin.featureFlags');
  const tCommon = useTranslations('common');
  const messageErreur = useMessageErreurApi();
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(flag?.enabled ?? false);
  const [roles, setRoles] = useState((flag?.segments.roles ?? []).join(','));
  const [rollout, setRollout] = useState(String(flag?.segments.rollout_percentage ?? 0));
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => patchAdminFeatureFlag(flag!.key, {
      enabled,
      segments: {
        roles: roles.split(',').map((role) => role.trim()).filter(Boolean),
        rollout_percentage: Number(rollout),
      },
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'feature-flags'] });
      setError(null);
      onOpenChange(false);
    },
    onError: (err: ApiError) => setError(messageErreur(err)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{flag ? t('configureFlag', { label: flag.label }) : t('configureGeneric')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Button type="button" variant={enabled ? 'default' : 'outline'} onClick={() => setEnabled((value) => !value)}>
            {enabled ? t('enabledGlobally') : t('disabledGlobally')}
          </Button>
          <label className="block space-y-1.5">
            <Label htmlFor="flag-roles">{t('targetRoles')}</Label>
            <Input id="flag-roles" value={roles} onChange={(event) => setRoles(event.target.value)} placeholder={ROLE_SLUGS_PLACEHOLDER} />
          </label>
          <label className="block space-y-1.5">
            <Label htmlFor="flag-rollout">{t('rollout')}</Label>
            <Input id="flag-rollout" type="number" min={0} max={100} value={rollout} onChange={(event) => setRollout(event.target.value)} />
          </label>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {tCommon('actions.cancel')}
          </Button>
          <Button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            <Save className="size-4" aria-hidden="true" />
            {tCommon('actions.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SessionOverrideToggle({ flag }: { flag: AdminFeatureFlag }) {
  const t = useTranslations('superAdmin.featureFlags');
  const [enabled, setEnabled] = useState(false);
  const mutation = useMutation({
    mutationFn: () => overrideAdminFeatureFlag(flag.key, !enabled),
    onSuccess: (response) => setEnabled(response.data.enabled),
  });

  return (
    <Button type="button" variant={enabled ? 'default' : 'ghost'} onClick={() => mutation.mutate()} disabled={mutation.isPending}>
      <FlaskConical className="size-4" aria-hidden="true" />
      {enabled ? t('testing') : t('test')}
    </Button>
  );
}
