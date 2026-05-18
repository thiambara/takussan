'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { postAgencyAction } from '@/lib/queries/super-admin';
import type { AdminAgency } from '@/types/super-admin';
import { Button, buttonVariants } from '@/components/ui/button';
import { ConfirmActionDialog } from './ConfirmActionDialog';

const STATUS_LABEL: Record<string, string> = {
  active: 'Active',
  inactive: 'Inactive',
  suspended: 'Suspendue',
};

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-900',
  inactive: 'bg-stone-200 text-stone-800',
  suspended: 'bg-red-100 text-red-900',
};

interface AgencyModerationCardProps {
  agency: AdminAgency;
}

type Action = 'verify' | 'suspend' | 'unverify';

const ACTION_META: Record<Action, { title: string; description: string; phrase: string; label: string; destructive?: boolean }> = {
  verify: {
    title: 'Vérifier l’agence',
    description: 'L’agence passera en statut Active et sera marquée comme vérifiée.',
    phrase: 'VERIFIER',
    label: 'Vérifier',
  },
  suspend: {
    title: 'Suspendre l’agence',
    description: 'L’agence sera bloquée. Ses utilisateurs perdent l’accès aux fonctionnalités produits.',
    phrase: 'SUSPENDRE',
    label: 'Suspendre',
    destructive: true,
  },
  unverify: {
    title: 'Retirer la vérification',
    description: 'L’agence reviendra en statut Inactive et perdra son badge vérifié.',
    phrase: 'DEVERIFIER',
    label: 'Déverifier',
    destructive: true,
  },
};

export function AgencyModerationCard({ agency }: AgencyModerationCardProps) {
  const [pending, setPending] = useState<Action | null>(null);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (action: Action) => postAgencyAction(agency.id, action),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['super-admin', 'agencies'] });
      await queryClient.invalidateQueries({ queryKey: ['super-admin', 'system-metrics'] });
      setPending(null);
    },
    onError: () => setPending(null),
  });

  const status = agency.status ?? 'inactive';
  const meta = pending ? ACTION_META[pending] : null;

  return (
    <article
      data-testid={`agency-card-${agency.id}`}
      className="space-y-3 rounded-xl bg-white p-4 ring-1 ring-stone-200"
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
              className="size-11 rounded-md border border-stone-200 object-cover"
            />
          ) : (
            <div className="flex size-11 items-center justify-center rounded-md bg-stone-100 text-sm font-semibold text-stone-700">
              {agency.name.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-stone-900">
              <Link className="hover:text-amber-700" href={`/super-admin/agencies/${agency.id}`}>
                {agency.name}
              </Link>
            </h3>
            <p className="truncate text-xs text-stone-500">/{agency.slug}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[status] ?? STATUS_BADGE.inactive}`}>
            {STATUS_LABEL[status] ?? status}
          </span>
          {agency.is_verified ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
              Vérifiée
            </span>
          ) : null}
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-2 text-xs text-stone-600 lg:grid-cols-3">
        <div>
          <dt className="font-semibold text-stone-700">Email</dt>
          <dd className="truncate">{agency.email ?? '—'}</dd>
        </div>
        <div>
          <dt className="font-semibold text-stone-700">License</dt>
          <dd>{agency.license_number ?? '—'}</dd>
        </div>
        <div>
          <dt className="font-semibold text-stone-700">Membres</dt>
          <dd className="tabular-nums">{agency.members_count}</dd>
        </div>
        <div>
          <dt className="font-semibold text-stone-700">Biens</dt>
          <dd className="tabular-nums">{agency.properties_count}</dd>
        </div>
        <div>
          <dt className="font-semibold text-stone-700">Créée le</dt>
          <dd>{formatDate(agency.created_at)}</dd>
        </div>
        <div>
          <dt className="font-semibold text-stone-700">Dernière activité</dt>
          <dd>{formatDate(agency.last_activity_at)}</dd>
        </div>
      </dl>

      <div className="flex flex-wrap gap-2">
        <Link className={buttonVariants({ size: 'sm', variant: 'outline' })} href={`/super-admin/agencies/${agency.id}`}>
          Ouvrir
        </Link>
        <Button size="sm" variant="default" onClick={() => setPending('verify')} disabled={mutation.isPending}>
          Vérifier
        </Button>
        <Button size="sm" variant="destructive" onClick={() => setPending('suspend')} disabled={mutation.isPending}>
          Suspendre
        </Button>
        <Button size="sm" variant="outline" onClick={() => setPending('unverify')} disabled={mutation.isPending}>
          Déverifier
        </Button>
      </div>

      {meta ? (
        <ConfirmActionDialog
          open={pending !== null}
          onOpenChange={(open) => !open && setPending(null)}
          title={meta.title}
          description={meta.description}
          confirmPhrase={meta.phrase}
          confirmLabel={meta.label}
          destructive={meta.destructive}
          pending={mutation.isPending}
          onConfirm={() => pending && mutation.mutate(pending)}
        />
      ) : null}
    </article>
  );
}

function formatDate(value: string | null): string {
  if (!value) return '—';

  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}
