'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ShieldCheck } from 'lucide-react';

import { DataState, PageHeader, Pagination, StatCard } from '@/components/console';
import { EmptyState } from '@/components/feedback';
import { KycDecisionPanel, KycQueueTable } from '@/components/admin/super/kyc-queue';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import type { ApiError } from '@/lib/api';
import { fetchAdminKycQueue } from '@/lib/queries/super-admin';
import type { KycDossier, KycDossierStatus, KycDossiersResponse } from '@/types/super-admin';

/**
 * Les quatre états du dossier (`KycDossierStatus` côté API). Patron « la donnée porte la clé »
 * (TCK-286) : la table est hors composant, donc hors de portée de `useTranslations`.
 *
 * Il n'y a **pas** d'option « tous » : `filter[status]` du back prend une valeur, et la file par
 * défaut est celle des dossiers à instruire — c'est le seul état où une décision est possible.
 */
const STATUTS: readonly KycDossierStatus[] = ['submitted', 'pending', 'verified', 'rejected'];

const STATUT_PAR_DEFAUT: KycDossierStatus = 'submitted';

const PAR_PAGE = 20;

function statutDepuisUrl(valeur: string | null): KycDossierStatus {
  return STATUTS.includes(valeur as KycDossierStatus) ? (valeur as KycDossierStatus) : STATUT_PAR_DEFAUT;
}

export default function SuperAdminKycPage() {
  const t = useTranslations('superAdmin.pages.kyc');
  const tStatus = useTranslations('kyc.status');
  const messageErreur = useMessageErreurApi();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState<KycDossier | null>(null);

  /*
   * TCK-362 (AC5) — le filtre et la page vivent dans l'URL, pas dans un `useState`.
   *
   * C'est la seule forme qui rende la vue partageable ET rejouée au rechargement : un état React
   * se perd au F5, et deux opérateurs qui s'échangent « regarde les rejetés » s'échangeraient une
   * URL qui n'affiche pas les rejetés.
   */
  const statut = statutDepuisUrl(searchParams?.get('filter[status]') ?? null);
  const page = Number.parseInt(searchParams?.get('page') ?? '1', 10) || 1;

  const params = useMemo(() => ({ status: statut, page, perPage: PAR_PAGE }), [statut, page]);

  const query = useQuery<KycDossiersResponse, ApiError>({
    queryKey: ['super-admin', 'kyc', 'queue', params],
    queryFn: () => fetchAdminKycQueue(params),
    staleTime: 15_000,
  });

  /*
   * Le compteur des dossiers À INSTRUIRE, et non le total de la page courante.
   *
   * Il vit sous le même préfixe `['super-admin', 'kyc']` que la file : la décision les invalide
   * tous les deux d'un seul appel (AC4). Une requête distincte plutôt que `meta.total` parce que
   * ce chiffre doit rester juste quand l'opérateur regarde les vérifiés — c'est précisément là
   * qu'il a besoin de savoir combien reste à faire. `per_page=1` : seul `meta.total` est lu.
   */
  const countQuery = useQuery<KycDossiersResponse, ApiError>({
    queryKey: ['super-admin', 'kyc', 'count', STATUT_PAR_DEFAUT],
    queryFn: () => fetchAdminKycQueue({ status: STATUT_PAR_DEFAUT, perPage: 1 }),
    staleTime: 15_000,
  });

  const dossiers = query.data?.data ?? [];
  const meta = query.data?.meta;

  const majUrl = useCallback(
    (mutation: (params: URLSearchParams) => void) => {
      const next = new URLSearchParams(searchParams?.toString() ?? '');
      mutation(next);
      const qs = next.toString();
      router.replace(qs ? `?${qs}` : '?');
    },
    [router, searchParams],
  );

  const changeStatut = (valeur: KycDossierStatus) => {
    setSelected(null);
    majUrl((next) => {
      next.set('filter[status]', valeur);
      next.delete('page');
    });
  };

  const changePage = (valeur: number) => {
    setSelected(null);
    majUrl((next) => next.set('page', String(valeur)));
  };

  const optionsStatut = STATUTS.map((valeur) => ({ value: valeur, label: tStatus(valeur) }));

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t('statPending')}
          value={countQuery.data?.meta.total ?? 0}
          loading={countQuery.isLoading}
          icon={<ShieldCheck className="size-4" aria-hidden="true" />}
        />
        <StatCard
          label={t('statFiltered', { status: tStatus(statut) })}
          value={meta?.total ?? 0}
          loading={query.isLoading}
        />
      </div>

      <div className="grid gap-2 md:grid-cols-3">
        <Select
          value={statut}
          onValueChange={(valeur) => changeStatut((valeur ?? STATUT_PAR_DEFAUT) as KycDossierStatus)}
          items={optionsStatut}
        >
          <SelectTrigger aria-label={t('statusAria')} className="h-10 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {optionsStatut.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataState
        data-testid="kyc-loading"
        loading={query.isLoading}
        error={query.isError ? messageErreur(query.error, t('error')) : null}
        isEmpty={dossiers.length === 0}
        skeletonRowClassName="h-16"
        onRetry={() => query.refetch()}
        retryLabel={t('retry')}
        emptyState={
          <EmptyState
            icon={<ShieldCheck className="size-8" aria-hidden="true" />}
            title={t('emptyTitle')}
            description={t('emptyDescription')}
          />
        }
      >
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <KycQueueTable
              dossiers={dossiers}
              selectedId={selected?.id ?? null}
              onSelect={setSelected}
            />
            <Pagination
              page={meta?.current_page ?? page}
              lastPage={meta?.last_page ?? 1}
              onChange={changePage}
            />
          </div>
          {/*
            `key` — et pas un effet de remise à zéro : passer d'un dossier à l'autre doit vider le
            motif saisi. Cf. le docblock de `KycDecisionPanel`.
          */}
          <KycDecisionPanel
            key={selected?.id ?? 'aucun'}
            dossier={selected}
            onDone={() => setSelected(null)}
          />
        </div>
      </DataState>
    </div>
  );
}
