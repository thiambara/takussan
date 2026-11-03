'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { UserCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/context/AuthContext';
import { useCan } from '@/hooks/useCan';
import { ApiError } from '@/lib/api';
import { AGENT_CRM_QUERY_KEY, fetchAgencyAgents, setCustomerPrimaryContact } from '@/lib/queries/agent-crm';
import type { CustomerRelationship } from '@/types/customer';

/** Valeur repère de « aucun agent choisi » : une valeur vide n'est pas une option du Select. */
const AUCUN_AGENT = '__none__';

interface CustomerReferentProps {
  readonly customerId: number;
  readonly agencyId: number | null | undefined;
  readonly relationships: readonly CustomerRelationship[];
}

/**
 * TCK-591 §8 — désigner le référent du client depuis sa fiche (`POST …/primary-contact`, capacité
 * `crm.assign`, cible = personnel de l'agence). La liste des agents n'est lisible que par
 * l'administration : un 403 laisse « Me désigner » seul, sans erreur affichée. Un refus du geste
 * lui-même, en revanche, se dit — avec la prose de l'API.
 */
export function CustomerReferent({ customerId, agencyId, relationships }: CustomerReferentProps) {
  const t = useTranslations('agentCrm.referent');
  const { token, user } = useAuth();
  const router = useRouter();
  const [target, setTarget] = useState('');

  const current = relationships.find((r) => r.is_primary && r.relationship_type === 'agent_client');

  // TCK-1873 (P189.04) — l'API exige `crm.assign` dans l'agence du client
  // (`SetPrimaryContactCustomerRequest`, TCK-591) : sans elle, ni « Me désigner » ni « Désigner »,
  // et la liste des agents, qui ne nourrit que le sélecteur, n'est pas demandée.
  const { can: peutDesigner } = useCan('crm.assign', agencyId ?? undefined, !!agencyId);

  const agents = useQuery({
    queryKey: AGENT_CRM_QUERY_KEY.staff(agencyId ?? 0),
    queryFn: () => fetchAgencyAgents(token ?? '', agencyId ?? 0),
    enabled: !!token && !!agencyId && peutDesigner,
    retry: false,
  });

  const designate = useMutation<void, ApiError, number>({
    mutationFn: (userId) => setCustomerPrimaryContact(token ?? '', customerId, userId),
    onSuccess: () => {
      setTarget('');
      router.refresh();
    },
  });

  const others = (agents.data ?? []).filter((a) => a.id !== current?.user_id);
  const optionsAgent = [
    { value: AUCUN_AGENT, label: t('pick') },
    ...others.map((a) => ({ value: String(a.id), label: a.name })),
  ];

  return (
    <section aria-labelledby="customer-referent" className="space-y-2 rounded-xl bg-card p-4 text-sm">
      <h2 id="customer-referent" className="flex items-center gap-2 font-semibold text-foreground">
        <UserCheck className="size-4" aria-hidden="true" />
        {t('title')}
      </h2>
      <p className="text-muted-foreground">
        {current ? (current.user?.name ?? t('someone')) : t('none')}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {peutDesigner && user && current?.user_id !== user.id ? (
          <Button type="button" size="sm" variant="outline" disabled={designate.isPending} onClick={() => designate.mutate(user.id)}>
            {t('me')}
          </Button>
        ) : null}
        {peutDesigner && others.length > 0 ? (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (target) designate.mutate(Number(target));
            }}
          >
            <label htmlFor="referent-target" className="sr-only">{t('pick')}</label>
            <Select
              value={target === '' ? AUCUN_AGENT : target}
              onValueChange={(next) => {
                if (next === null) return;
                setTarget(next === AUCUN_AGENT ? '' : next);
              }}
              items={optionsAgent}
            >
              <SelectTrigger id="referent-target" className="min-w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {optionsAgent.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit" size="sm" disabled={!target || designate.isPending}>
              {t('designate')}
            </Button>
          </form>
        ) : null}
      </div>
      {designate.error ? (
        <p role="alert" className="text-destructive">{designate.error.proseServeur ?? t('failed')}</p>
      ) : null}
    </section>
  );
}
