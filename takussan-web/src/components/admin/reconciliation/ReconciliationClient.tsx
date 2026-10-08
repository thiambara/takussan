'use client';

import { useTranslations } from 'next-intl';

import { ErrorState } from '@/components/feedback';
import { Skeleton } from '@/components/ui/skeleton';
import { useCsvMapping } from '@/lib/queries/reconciliation';

import { CsvMappingForm } from './CsvMappingForm';
import { ImportStatementForm } from './ImportStatementForm';
import { StatementsList } from './StatementsList';

/**
 * TCK-593 (Partie 4) — l'écran de rapprochement bancaire de l'agence : importer un relevé, suivre
 * les relevés importés, régler la lecture des CSV.
 */
export function ReconciliationClient({ agencyId }: { readonly agencyId: number }) {
  const t = useTranslations('admin.reconciliation');
  const tCommon = useTranslations('common');
  const mapping = useCsvMapping(agencyId);

  return (
    <div className="space-y-6">
      <section aria-labelledby="rapprochement-import" className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <h2 id="rapprochement-import" className="mb-3 font-display text-base font-semibold text-foreground">
          {t('import.title')}
        </h2>
        <ImportStatementForm agencyId={agencyId} />
      </section>

      <section aria-labelledby="rapprochement-releves">
        <h2 id="rapprochement-releves" className="mb-3 font-display text-base font-semibold text-foreground">
          {t('list.title')}
        </h2>
        <StatementsList agencyId={agencyId} />
      </section>

      <section aria-labelledby="rapprochement-mapping" className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <h2 id="rapprochement-mapping" className="font-display text-base font-semibold text-foreground">
          {t('mapping.title')}
        </h2>
        <p className="mb-3 text-sm text-muted-foreground">{t('mapping.description')}</p>
        {mapping.isLoading ? (
          <Skeleton className="h-48 rounded-lg" />
        ) : mapping.isError || !mapping.data ? (
          <ErrorState
            message={t('mapping.error')}
            onRetry={() => void mapping.refetch()}
            retryLabel={tCommon('actions.retry')}
          />
        ) : (
          <CsvMappingForm
            key={mapping.dataUpdatedAt}
            agencyId={agencyId}
            initial={mapping.data.data}
          />
        )}
      </section>
    </div>
  );
}
