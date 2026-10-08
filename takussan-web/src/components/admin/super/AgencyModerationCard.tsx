'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { postAgencyAction, type AgencyModerationAction } from '@/lib/queries/super-admin';
import type { AdminAgency } from '@/types/super-admin';
import { Button, buttonVariants } from '@/components/ui/button';
import { ConfirmActionDialog } from './ConfirmActionDialog';
import { AVEC_MOTIF, GESTE_DE_TRANSITION, transitionsDeModeration } from './agency-moderation';
import { usePlatformAbilities } from './PlatformAbilitiesProvider';
import { StatusBadge, type StatusTone } from '@/components/console';
import { DATE_COURTE, useFormatteurs } from '@/lib/format/useFormatteurs';

/** TCK-292 — la donnée porte la CLÉ, le rendu la résout (`superAdmin.agencyStatus.*`). */
const STATUS_KEY: Record<string, string> = {
  active: 'active',
  inactive: 'inactive',
  suspended: 'suspended',
};

/** Le statut de l'agence → le ton du DS. La couleur se décide dans `StatusBadge`, pas ici. */
const STATUS_TONES: Record<string, StatusTone> = {
  active: 'success',
  inactive: 'neutral',
  suspended: 'danger',
};

interface AgencyModerationCardProps {
  agency: AdminAgency;
}

type Action = AgencyModerationAction;

type ActionMeta = { title: string; description: string; phrase: string; label: string; destructive?: boolean };

/**
 * TCK-292 — fabrique plutôt que table figée : les libellés viennent du dictionnaire, la phrase de
 * confirmation reste un jeton technique (elle est comparée à la frappe, elle ne se traduit pas).
 */
function actionMeta(t: (key: string) => string): Record<Action, ActionMeta> {
  return {
    verify: {
      title: t('actions.verify.title'),
      description: t('actions.verify.description'),
      phrase: 'VERIFIER',
      label: t('actions.verify.label'),
    },
    suspend: {
      title: t('actions.suspend.title'),
      description: t('actions.suspend.description'),
      phrase: 'SUSPENDRE',
      label: t('actions.suspend.label'),
      destructive: true,
    },
    unverify: {
      title: t('actions.unverify.title'),
      description: t('actions.unverify.description'),
      phrase: 'DEVERIFIER',
      label: t('actions.unverify.label'),
      destructive: true,
    },
    reinstate: {
      title: t('actions.reinstate.title'),
      description: t('actions.reinstate.description'),
      phrase: 'LEVER',
      label: t('actions.reinstate.label'),
    },
  };
}

/** Le rendu de chaque bouton : `suspend` est le seul geste rouge, `unverify` le seul en retrait. */
const VARIANTES: Record<Action, 'default' | 'destructive' | 'outline'> = {
  verify: 'default',
  suspend: 'destructive',
  unverify: 'outline',
  reinstate: 'default',
};

export function AgencyModerationCard({ agency }: AgencyModerationCardProps) {
  const t = useTranslations('superAdmin.agencyCard');
  const tStatus = useTranslations('superAdmin.agencyStatus');
  const fmt = useFormatteurs();
  const [pending, setPending] = useState<Action | null>(null);
  const queryClient = useQueryClient();

  const { can } = usePlatformAbilities();

  const mutation = useMutation({
    mutationFn: ({ action, reason }: { action: Action; reason: string }) =>
      postAgencyAction(agency.id, action, reason || undefined),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['super-admin', 'agencies'] });
      await queryClient.invalidateQueries({ queryKey: ['super-admin', 'system-metrics'] });
      setPending(null);
    },
    // TCK-600 — l'échec reste affiché DANS la modale : la fermer sur erreur (ce que faisait
    // `onError: () => setPending(null)`) avalait le refus de l'API sans un mot.
  });

  const status = agency.status ?? 'inactive';
  const statusKey = STATUS_KEY[status];
  const metas = actionMeta(t);
  const meta = pending ? metas[pending] : null;
  // Seules les transitions qui changent quelque chose, et que le niveau de l'opérateur permet.
  const transitions = transitionsDeModeration(agency).filter((action) => can(GESTE_DE_TRANSITION[action]));

  return (
    <article
      data-testid={`agency-card-${agency.id}`}
      className="space-y-3 rounded-xl bg-card p-4 ring-1 ring-border"
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-3">
          {agency.logo_url ? (
            <Image
              src={agency.logo_url}
              alt=""
              width={44}
              height={44}
              unoptimized
              className="size-11 rounded-md border border-border object-cover"
            />
          ) : (
            <div className="flex size-11 items-center justify-center rounded-md bg-muted text-sm font-semibold text-muted-foreground">
              {agency.name.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <h3 className="truncate font-display text-base font-semibold text-foreground">
              <Link className="rounded-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href={`/super-admin/agencies/${agency.id}`}>
                {agency.name}
              </Link>
            </h3>
            <p className="truncate text-xs text-muted-foreground">/{agency.slug}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge
            tone={STATUS_TONES[status] ?? 'neutral'}
            label={statusKey ? tStatus(statusKey) : status}
          />
          {/* `attention` est l'ocre de l'avertissement : une agence vérifiée n'est pas une alerte. */}
          {agency.is_verified ? <StatusBadge tone="info" label={t('verified')} /> : null}
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-muted-foreground xl:grid-cols-3">
        <div>
          <dt className="font-semibold text-muted-foreground">{t('email')}</dt>
          <dd className="truncate">{agency.email ?? '—'}</dd>
        </div>
        <div>
          <dt className="font-semibold text-muted-foreground">{t('license')}</dt>
          <dd className="truncate">{agency.license_number ?? '—'}</dd>
        </div>
        <div>
          <dt className="font-semibold text-muted-foreground">{t('members')}</dt>
          <dd className="tabular-nums">{agency.members_count}</dd>
        </div>
        <div>
          <dt className="font-semibold text-muted-foreground">{t('properties')}</dt>
          <dd className="tabular-nums">{agency.properties_count}</dd>
        </div>
        <div>
          <dt className="font-semibold text-muted-foreground">{t('createdAt')}</dt>
          <dd className="tabular-nums">{fmt.date(agency.created_at, DATE_COURTE)}</dd>
        </div>
        <div>
          <dt className="font-semibold text-muted-foreground">{t('lastActivity')}</dt>
          <dd className="tabular-nums">{fmt.date(agency.last_activity_at, DATE_COURTE)}</dd>
        </div>
      </dl>

      <div className="flex flex-wrap gap-2">
        <Link className={buttonVariants({ size: 'sm', variant: 'outline' })} href={`/super-admin/agencies/${agency.id}`}>
          {t('open')}
        </Link>
        {transitions.map((action) => (
          <Button
            key={action}
            size="sm"
            variant={VARIANTES[action]}
            onClick={() => setPending(action)}
            disabled={mutation.isPending}
          >
            {metas[action].label}
          </Button>
        ))}
      </div>

      {meta ? (
        <ConfirmActionDialog
          open={pending !== null}
          onOpenChange={(open) => {
            if (!open) {
              setPending(null);
              mutation.reset();
            }
          }}
          title={meta.title}
          description={meta.description}
          confirmPhrase={meta.phrase}
          confirmLabel={meta.label}
          destructive={meta.destructive}
          pending={mutation.isPending}
          reason={pending && AVEC_MOTIF.has(pending) ? { label: t('reasonLabel') } : undefined}
          error={mutation.error}
          onConfirm={(reason) => pending && mutation.mutate({ action: pending, reason })}
        />
      ) : null}
    </article>
  );
}
