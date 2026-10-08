'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useAuth } from '@/context/AuthContext';
import { ApiError } from '@/lib/api';
import { AGENT_CRM_QUERY_KEY, fetchMatchingCustomers } from '@/lib/queries/agent-crm';
import { pipelineStageValues } from '@/lib/schemas/customer';
import type { PaginatedResponse } from '@/types/api';
import type { MatchingCustomer } from '@/types/agent-crm';

interface PropertyMatchingCustomersProps {
  readonly propertyId: number;
}

/**
 * TCK-591 §5 — « 4 prospects correspondent » sur la fiche d'un bien, et la liste derrière.
 *
 * Le compte est celui de l'API (`meta.total`), pas celui de la page reçue. Un prospect que
 * l'appelant ne peut pas lire reste COMPTÉ, sans nom ni lien : le cacher ferait mentir le compte,
 * le nommer ferait fuir la fiche d'un collègue. Rien ne s'affiche quand aucun prospect ne
 * correspond, ni quand l'API refuse (le bien n'est pas de ceux que l'appelant travaille).
 */
export function PropertyMatchingCustomers({ propertyId }: PropertyMatchingCustomersProps) {
  const t = useTranslations('agentCrm.propertyMatches');
  const tStage = useTranslations('crm.pipeline.stage');
  const { token } = useAuth();
  const [open, setOpen] = useState(false);

  const query = useQuery<PaginatedResponse<MatchingCustomer>, ApiError>({
    queryKey: AGENT_CRM_QUERY_KEY.matchingCustomers(propertyId),
    queryFn: () => fetchMatchingCustomers(token ?? '', propertyId),
    enabled: !!token,
    retry: false,
  });

  const total = query.data?.meta.total ?? 0;
  if (!query.data || total === 0) return null;
  const rows = query.data.data;

  return (
    <section className="rounded-lg border border-muted bg-card p-3 text-sm" data-testid="property-matching-customers">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-center justify-between gap-2 font-medium"
      >
        <span className="flex items-center gap-2">
          <Users className="size-4" aria-hidden="true" />
          {t('count', { count: total })}
        </span>
        <ChevronDown className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open ? (
        <ul className="mt-2 space-y-1">
          {rows.map((c, i) => (
            <li key={c.id ?? `masque-${i}`} className="flex items-center justify-between gap-2">
              {c.id !== null ? (
                <Link href={`/app/customers/${c.id}`} className="text-primary underline-offset-4 hover:underline">
                  {c.name}
                </Link>
              ) : (
                <span className="text-muted-foreground">{t('hidden')}</span>
              )}
              {c.pipeline_stage && (pipelineStageValues as readonly string[]).includes(c.pipeline_stage) ? (
                <span className="text-xs text-muted-foreground">{tStage(c.pipeline_stage)}</span>
              ) : null}
            </li>
          ))}
          {total > rows.length ? (
            <li className="text-xs text-muted-foreground">{t('more', { count: total - rows.length })}</li>
          ) : null}
        </ul>
      ) : null}
    </section>
  );
}
