'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { StatusBadge } from '@/components/console';
import { DataTable, type DataTableColumn } from '@/components/console/DataTable';
import { ErrorState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import type { ApiError } from '@/lib/api';
import { avecGardeDoubleFacteur } from '@/lib/double-facteur';
import { equivalentXofIa, lireSaisieMontantIa } from '@/lib/format/montant-ia';
import { fetchAdminAiProviders, fetchAdminAiUsages, patchAdminAiUsage } from '@/lib/queries/super-admin';
import type { AdminAiUsagesResponse, AiUsageRow } from '@/types/super-admin';
import { useMontantIa } from './useMontantIa';

const SANS_FORCAGE = '';

export function AiUsagesPanel() {
  const t = useTranslations('superAdmin.pages.ai.usages');
  const tShared = useTranslations('superAdmin.pages.shared');
  const tCommon = useTranslations('common');
  const montant = useMontantIa();
  const messageErreur = useMessageErreurApi();
  const garde = useGardeDoubleFacteur();
  const queryClient = useQueryClient();
  const [edited, setEdited] = useState<AiUsageRow | null>(null);
  const query = useQuery<AdminAiUsagesResponse, ApiError>({ queryKey: ['super-admin', 'ai', 'usages'], queryFn: fetchAdminAiUsages });
  const providers = useQuery({ queryKey: ['super-admin', 'ai', 'providers'], queryFn: fetchAdminAiProviders });
  const patch = useMutation({
    mutationFn: ({ key, payload }: { key: string; payload: Parameters<typeof patchAdminAiUsage>[1] }) =>
      avecGardeDoubleFacteur(() => patchAdminAiUsage(key, payload), garde),
    onSuccess: (data) => {
      queryClient.setQueryData(['super-admin', 'ai', 'usages'], data);
      setEdited(null);
    },
  });
  const erreur = patch.isError ? messageErreur(patch.error, t('updateFailed')) : null;

  if (query.isLoading) return <Skeleton className="h-64 rounded-xl" />;
  if (query.isError) {
    return <ErrorState message={`${tShared('loadError')} ${messageErreur(query.error)}`} onRetry={() => void query.refetch()} retryLabel={tCommon('actions.retry')} />;
  }

  const taux = query.data?.meta.usd_to_xof;
  const options = (providers.data?.data ?? []).flatMap((p) => p.models.map((m) => ({ value: `${p.key}/${m}`, label: `${p.legal_name} · ${m}` })));
  const columns: DataTableColumn<AiUsageRow>[] = [
    { id: 'key', header: t('key'), cell: (row) => <code className="text-sm">{row.key}</code> },
    {
      id: 'model',
      header: t('model'),
      cell: (row) => (
        <span>
          {row.chain[0] ? `${row.chain[0].provider} · ${row.chain[0].model}` : '—'}
          {row.forced ? <span className="ml-1 text-muted-foreground">({t('forced')})</span> : null}
        </span>
      ),
    },
    {
      id: 'budget',
      header: t('budget'),
      align: 'end',
      cell: (row) => <span className="tabular-nums">{`${montant(row.spent_today_usd, taux)} / ${row.daily_budget_usd === null ? t('noBudget') : montant(row.daily_budget_usd, taux)}`}</span>,
    },
    {
      id: 'state',
      header: t('state'),
      cell: (row) => <StatusBadge label={row.enabled ? t('enabled') : t('disabled')} tone={row.enabled ? 'success' : 'danger'} />,
    },
    {
      id: 'actions',
      header: t('settings'),
      headerSrOnly: true,
      align: 'end',
      cell: (row) => (
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" disabled={patch.isPending} onClick={() => patch.mutate({ key: row.key, payload: { enabled: !row.enabled } })}>
            {row.enabled ? t('disable') : t('enable')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { patch.reset(); setEdited(row); }}>{t('settings')}</Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      {erreur && !edited ? <p className="text-sm text-destructive" role="alert">{erreur}</p> : null}
      <DataTable caption={t('caption')} columns={columns} rows={query.data?.data ?? []} rowKey={(row) => row.key} />
      {edited ? (
        <UsageSettingsDialog
          row={edited}
          taux={taux}
          options={options}
          optionsError={providers.isError ? t('providersLoadError', { message: messageErreur(providers.error) }) : null}
          pending={patch.isPending}
          error={erreur}
          onClose={() => { patch.reset(); setEdited(null); }}
          onSave={(payload) => patch.mutate({ key: edited.key, payload })}
        />
      ) : null}
    </div>
  );
}

function UsageSettingsDialog({ row, taux, options, optionsError, pending, error, onClose, onSave }: {
  row: AiUsageRow;
  taux: string | undefined;
  options: { value: string; label: string }[];
  optionsError: string | null;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (payload: Parameters<typeof patchAdminAiUsage>[1]) => void;
}) {
  const t = useTranslations('superAdmin.pages.ai.usages');
  const forcageInitial = row.forced ? `${row.forced.provider}/${row.forced.model}` : SANS_FORCAGE;
  const [forced, setForced] = useState(forcageInitial);
  // `daily_budget_usd` est le plafond EFFECTIF : le défaut du code quand rien n'est posé. Pré-remplir le
  // champ avec lui et le renvoyer à chaque enregistrement épinglerait le défaut en surcharge ; on ne
  // montre donc que la surcharge réelle, et on n'envoie le plafond que s'il a été touché.
  const surcharge = row.daily_budget_usd !== null && row.daily_budget_usd !== row.default_daily_budget_usd;
  const montant = useMontantIa();
  const [budget, setBudget] = useState(surcharge ? (row.daily_budget_usd ?? '') : '');
  const [budgetTouched, setBudgetTouched] = useState(false);
  // Une chaîne décimale et non un nombre (ADR-0086) : `null` ici refuse la saisie, `''` retire le plafond.
  const plafondLu = budget.trim() === '' ? null : lireSaisieMontantIa(budget);
  const saisieInvalide = budget.trim() !== '' && plafondLu === null;
  const equivalent = equivalentXofIa(plafondLu, taux);
  const items = [{ value: SANS_FORCAGE, label: t('noForcedModel') }, ...options];

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="grid-cols-[minmax(0,1fr)]">
        <DialogHeader><DialogTitle className="pr-6 break-all">{row.key}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label id="forced-model">{t('forcedModel')}</Label>
            <Select value={forced} onValueChange={(v) => setForced(v ?? SANS_FORCAGE)} items={items}>
              <SelectTrigger className="h-10 w-full min-w-0" aria-labelledby="forced-model"><SelectValue /></SelectTrigger>
              <SelectContent>{items.map((o) => <SelectItem key={o.value || 'role'} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
            {optionsError ? <p className="text-sm text-destructive" role="alert">{optionsError}</p> : null}
          </div>
          <div className="space-y-1">
            <Label htmlFor="daily-budget">{t('dailyBudget')}</Label>
            <Input
              id="daily-budget"
              inputMode="decimal"
              autoComplete="off"
              value={budget}
              placeholder={row.default_daily_budget_usd ?? undefined}
              aria-invalid={saisieInvalide}
              aria-describedby="daily-budget-hint"
              onChange={(e) => { setBudget(e.target.value); setBudgetTouched(true); }}
            />
            <p id="daily-budget-hint" className="text-xs text-muted-foreground">
              {row.default_daily_budget_usd === null ? t('budgetNoDefaultHint') : t('budgetDefaultHint', { default: montant(row.default_daily_budget_usd, taux) })}
            </p>
            {equivalent !== null ? <p className="text-xs text-muted-foreground">{t('budgetEquivalent', { xof: equivalent })}</p> : null}
            {saisieInvalide ? <p className="text-sm text-destructive" role="alert">{t('budgetInvalid')}</p> : null}
          </div>
        </div>
        {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('cancel')}</Button>
          <Button
            disabled={pending || saisieInvalide}
            onClick={() => {
              const [provider, ...model] = forced.split('/');
              onSave({
                // Seulement s'il a changé : un forçage retiré ou sorti de la configuration n'empêche pas d'abaisser le plafond.
                ...(forced !== forcageInitial ? {
                  forced_provider: forced === SANS_FORCAGE ? null : provider,
                  forced_model: forced === SANS_FORCAGE ? null : model.join('/'),
                } : {}),
                ...(budgetTouched ? { daily_budget_usd: plafondLu } : {}),
              });
            }}
          >
            {t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
