'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { StatusBadge } from '@/components/console';
import { DataTable, type DataTableColumn } from '@/components/console/DataTable';
import { ErrorState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import type { ApiError } from '@/lib/api';
import { avecGardeDoubleFacteur } from '@/lib/double-facteur';
import { fetchAdminAiProviders, testAdminAiProvider } from '@/lib/queries/super-admin';
import type { AdminAiProvidersResponse, AiProvider, AiProviderTestResponse } from '@/types/super-admin';
import { ERREURS_APPEL_IA } from './codes-erreur-appel';

/** Les refus de la passerelle qu'écrit `AiProviderController::test` dans `error_code` ; les échecs d'appel sont dans `ERREURS_APPEL_IA`. */
const ERREURS_CONNUES: Record<string, string> = {
  'ai.role_unassigned': 'roleUnassigned',
  'ai.providers_unavailable': 'providersUnavailable',
  'ai.refused.kill_switch': 'refusedKillSwitch',
  'ai.refused.budget': 'refusedBudget',
  'ai.refused.forbidden': 'refused',
  'ai.refused.sensitive_data': 'refused',
  'ai.refused.data_class': 'refused',
};

/** TCK-2385 (ADR-0076 §3) — une clé est présente ou non, et se teste. Aucun champ pour la saisir. */
export function AiProvidersPanel() {
  const t = useTranslations('superAdmin.pages.ai.providers');
  const tShared = useTranslations('superAdmin.pages.shared');
  const tCommon = useTranslations('common');
  const tAppel = useTranslations('superAdmin.pages.ai.callErrors');
  const messageErreur = useMessageErreurApi();
  const garde = useGardeDoubleFacteur();
  const [results, setResults] = useState<Record<string, AiProviderTestResponse['data']>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const query = useQuery<AdminAiProvidersResponse, ApiError>({ queryKey: ['super-admin', 'ai', 'providers'], queryFn: fetchAdminAiProviders });
  const test = useMutation({
    mutationFn: (key: string) => avecGardeDoubleFacteur(() => testAdminAiProvider(key), garde),
    onMutate: (key) => setErrors((current) => ({ ...current, [key]: '' })),
    onSuccess: (response, key) => setResults((current) => ({ ...current, [key]: response.data })),
    // Un refus de l'API (clé absente, modèle sans tarif) porte son message localisé : on l'affiche.
    onError: (error, key) => {
      setResults((current) => {
        const { [key]: _retire, ...reste } = current;
        return reste;
      });
      setErrors((current) => ({ ...current, [key]: messageErreur(error, t('testError')) }));
    },
  });

  const libelleEchec = (code: string | null) => {
    if (code && ERREURS_CONNUES[code]) return t(`testErrors.${ERREURS_CONNUES[code]}`);
    if (code && ERREURS_APPEL_IA[code]) return tAppel(ERREURS_APPEL_IA[code]);
    return t('testFailed');
  };

  if (query.isLoading) return <Skeleton className="h-40 rounded-xl" />;
  if (query.isError) {
    return <ErrorState message={`${tShared('loadError')} ${messageErreur(query.error)}`} onRetry={() => void query.refetch()} retryLabel={tCommon('actions.retry')} />;
  }

  const columns: DataTableColumn<AiProvider>[] = [
    { id: 'name', header: t('name'), cell: (row) => <span className="font-medium">{row.legal_name}</span> },
    { id: 'key', header: t('key'), cell: (row) => <StatusBadge label={row.key_present ? t('keyPresent') : t('keyMissing')} tone={row.key_present ? 'success' : 'attention'} /> },
    { id: 'models', header: t('models'), cell: (row) => row.models.join(', ') },
    {
      id: 'test',
      header: t('test'),
      headerSrOnly: true,
      align: 'end',
      cell: (row) => {
        const result = results[row.key];
        const error = errors[row.key];
        return (
          <div className="flex flex-col items-end gap-1">
            <Button size="sm" variant="outline" disabled={!row.key_present || test.isPending} onClick={() => test.mutate(row.key)}>{t('test')}</Button>
            {result ? (
              result.ok ? (
                <span className="text-sm text-muted-foreground">{t('testOk', { model: result.model, duration: result.duration_ms ?? 0 })}</span>
              ) : (
                <span className="flex flex-col items-end text-sm text-destructive">
                  <span>{libelleEchec(result.error_code)}</span>
                  {result.error_code && !ERREURS_CONNUES[result.error_code] && !ERREURS_APPEL_IA[result.error_code] ? <span className="text-xs text-muted-foreground">{t('testErrorCode', { code: result.error_code })}</span> : null}
                </span>
              )
            ) : null}
            {error ? <span className="text-sm text-destructive" role="alert">{error}</span> : null}
          </div>
        );
      },
    },
  ];

  return <DataTable caption={t('caption')} columns={columns} rows={query.data?.data ?? []} rowKey={(row) => row.key} />;
}
