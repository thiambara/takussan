'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
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
import { ApiError } from '@/lib/api';
import { avecGardeDoubleFacteur } from '@/lib/double-facteur';
import { formaterTarifIa, lireSaisieMontantIa } from '@/lib/format/montant-ia';
import { deleteAdminAiModel, fetchAdminAiModels, fetchAdminAiProviders, patchAdminAiModel, postAdminAiModel } from '@/lib/queries/super-admin';
import type { AdminAiModelsResponse, AiCatalogueModel, AiModelPrices, AiModelRole, AiModelUses } from '@/types/super-admin';

const TARIFS = ['input', 'output', 'cache_read', 'cache_write'] as const;
const TARIFS_VIDES: AiModelPrices = { input: '', output: '', cache_read: '', cache_write: '' };

/** Un retrait refusé (`AiModelController`) : l'API nomme ce qui emploie encore le modèle. */
function emploisDe(error: unknown): AiModelUses | null {
  if (!(error instanceof ApiError) || error.status !== 409 || typeof error.data !== 'object' || error.data === null) return null;
  const { code, uses } = error.data as { code?: unknown; uses?: AiModelUses };
  return code === 'ai.model_in_use' && uses ? uses : null;
}

/** Une ligne de la console se modifie ; un modèle de la configuration se corrige en créant la sienne, qui l'emporte. */
function ecrire(entree: AiCatalogueModel, changement: Partial<AiModelPrices> & { active?: boolean }): Promise<AdminAiModelsResponse> {
  if (entree.id !== null) return patchAdminAiModel(entree.id, changement);
  const { provider, model, input, output, cache_read, cache_write } = entree;
  return postAdminAiModel({ provider, model, input, output, cache_read, cache_write, ...changement });
}

/** TCK-2448 (ADR-0085 §1) — ajouter un modèle d'un fournisseur déclaré, corriger son tarif, le retirer. Sans déploiement. */
export function AiModelsPanel() {
  const t = useTranslations('superAdmin.pages.ai.models');
  const tRoles = useTranslations('superAdmin.pages.ai.roles.names');
  const tShared = useTranslations('superAdmin.pages.shared');
  const tCommon = useTranslations('common');
  const messageErreur = useMessageErreurApi();
  const garde = useGardeDoubleFacteur();
  const queryClient = useQueryClient();
  const [dialogue, setDialogue] = useState<{ entree: AiCatalogueModel | null } | null>(null);
  const [retour, setRetour] = useState<AiCatalogueModel | null>(null);
  const models = useQuery<AdminAiModelsResponse, ApiError>({ queryKey: ['super-admin', 'ai', 'models'], queryFn: fetchAdminAiModels });
  const providers = useQuery({ queryKey: ['super-admin', 'ai', 'providers'], queryFn: fetchAdminAiProviders });

  const apres = (data: AdminAiModelsResponse) => {
    queryClient.setQueryData(['super-admin', 'ai', 'models'], data);
    // Les menus de modèles des chaînes, des usages et de l'évaluation lisent la liste des fournisseurs.
    void queryClient.invalidateQueries({ queryKey: ['super-admin', 'ai', 'providers'] });
    void queryClient.invalidateQueries({ queryKey: ['super-admin', 'ai', 'roles'] });
  };
  const etat = useMutation({
    mutationFn: ({ entree, active, revenir }: { entree: AiCatalogueModel; active?: boolean; revenir?: boolean }) =>
      avecGardeDoubleFacteur(() => (revenir && entree.id !== null ? deleteAdminAiModel(entree.id) : ecrire(entree, { active })), garde),
    onSuccess: apres,
  });
  const enregistrer = useMutation({
    mutationFn: ({ entree, provider, model, prix }: { entree: AiCatalogueModel | null; provider: string; model: string; prix: AiModelPrices }) =>
      avecGardeDoubleFacteur(() => (entree ? ecrire(entree, prix) : postAdminAiModel({ provider, model, ...prix })), garde),
    onSuccess: (data) => {
      apres(data);
      setDialogue(null);
    },
  });

  if (models.isLoading) return <Skeleton className="h-40 rounded-xl" />;
  if (models.isError) {
    return <ErrorState message={`${tShared('loadError')} ${messageErreur(models.error)}`} onRetry={() => void models.refetch()} retryLabel={tCommon('actions.retry')} />;
  }

  const emplois = emploisDe(etat.error);
  const noms = (liste: string[]) => liste.join(', ');
  const nomsDesRoles = (roles: string[]) => roles.map((role) => tRoles(role as AiModelRole));
  const nomsDesEmplois = (uses: AiModelUses) => noms([...new Set([...nomsDesRoles(uses.roles), ...uses.usages, ...nomsDesRoles(uses.fallback_roles)])]);
  const entrees = models.data?.data ?? [];
  const fournisseurs = providers.data?.data ?? [];

  const columns: DataTableColumn<AiCatalogueModel>[] = [
    { id: 'model', header: t('model'), cell: (row) => <code className="text-sm break-all">{row.model}</code> },
    ...TARIFS.map((tarif): DataTableColumn<AiCatalogueModel> => ({
      id: tarif,
      header: t(`prices.${tarif}`),
      align: 'end',
      cell: (row) => <span className="tabular-nums">{formaterTarifIa(row[tarif])}</span>,
    })),
    {
      id: 'origin',
      header: t('origin'),
      cell: (row) => <StatusBadge label={row.origin === 'console' ? t('originConsole') : t('originConfig')} tone="neutral" />,
    },
    {
      id: 'state',
      header: t('state'),
      cell: (row) => (
        <div className="space-y-1">
          <StatusBadge label={row.active ? t('active') : t('withdrawn')} tone={row.active ? 'success' : 'neutral'} />
          {row.uses ? <p className="min-w-48 text-xs whitespace-normal text-destructive">{t('withdrawnInUse', { names: nomsDesEmplois(row.uses) })}</p> : null}
        </div>
      ),
    },
    {
      id: 'actions',
      header: t('actions'),
      headerSrOnly: true,
      align: 'end',
      cell: (row) => (
        <div className="flex justify-end gap-2">
          {row.in_config && row.id !== null ? (
            <Button size="sm" variant="ghost" disabled={etat.isPending} onClick={() => setRetour(row)} aria-label={t('revertModel', { model: row.model })}>{t('revert')}</Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={() => { enregistrer.reset(); setDialogue({ entree: row }); }} aria-label={t('editModel', { model: row.model })}>{t('edit')}</Button>
          <Button size="sm" variant="outline" disabled={etat.isPending} onClick={() => etat.mutate({ entree: row, active: !row.active })} aria-label={t(row.active ? 'withdrawModel' : 'restoreModel', { model: row.model })}>
            {row.active ? t('withdraw') : t('restore')}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <section aria-labelledby="ai-models-title" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 id="ai-models-title" className="text-base font-semibold">{t('title')}</h2>
          <p className="text-sm text-muted-foreground">{t('description')}</p>
        </div>
        <Button size="sm" variant="outline" disabled={fournisseurs.length === 0} onClick={() => { enregistrer.reset(); setDialogue({ entree: null }); }}>
          <Plus className="size-4" aria-hidden="true" /> {t('add')}
        </Button>
      </div>

      {etat.isError ? (
        <div className="space-y-0.5 text-sm text-destructive" role="alert">
          {emplois ? (
            <>
              <p>{t('inUse')}</p>
              {emplois.roles.length > 0 ? <p>{t('inUseRoles', { names: noms(emplois.roles.map((role) => tRoles(role as AiModelRole))) })}</p> : null}
              {emplois.usages.length > 0 ? <p>{t('inUseUsages', { names: noms(emplois.usages) })}</p> : null}
              {emplois.fallback_roles.length > 0 ? <p>{t('inUseFallback', { names: noms(emplois.fallback_roles.map((role) => tRoles(role as AiModelRole))) })}</p> : null}
            </>
          ) : <p>{messageErreur(etat.error, t('updateFailed'))}</p>}
        </div>
      ) : null}

      {[...new Set(entrees.map((entree) => entree.provider))].map((provider) => {
        const nom = fournisseurs.find((f) => f.key === provider)?.legal_name ?? provider;
        return (
          <div key={provider} className="space-y-2">
            <h3 className="text-sm font-medium">{nom}</h3>
            <DataTable
              caption={t('caption', { provider: nom })}
              columns={columns}
              rows={entrees.filter((entree) => entree.provider === provider)}
              rowKey={(row) => row.model}
              rowProps={(row) => (row.active ? {} : { className: row.uses ? undefined : 'opacity-60', 'data-withdrawn': true })}
              density="compact"
            />
          </div>
        );
      })}

      {retour ? (
        <Dialog open onOpenChange={(open) => { if (!open) setRetour(null); }}>
          <DialogContent className="grid-cols-[minmax(0,1fr)]">
            <DialogHeader><DialogTitle className="pr-6 break-all">{t('revertTitle', { model: retour.model })}</DialogTitle></DialogHeader>
            <p className="text-sm">{t(retour.active ? 'revertConfirm' : 'revertConfirmWithdrawn')}</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRetour(null)}>{t('cancel')}</Button>
              <Button onClick={() => { etat.mutate({ entree: retour, revenir: true }); setRetour(null); }}>{t('revert')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      {dialogue ? (
        <ModelDialog
          entree={dialogue.entree}
          fournisseurs={fournisseurs.map((f) => ({ value: f.key, label: f.legal_name }))}
          pending={enregistrer.isPending}
          error={enregistrer.isError ? messageErreur(enregistrer.error, t('updateFailed')) : null}
          onClose={() => setDialogue(null)}
          onSave={(provider, model, prix) => enregistrer.mutate({ entree: dialogue.entree, provider, model, prix })}
        />
      ) : null}
    </section>
  );
}

function ModelDialog({ entree, fournisseurs, pending, error, onClose, onSave }: {
  entree: AiCatalogueModel | null;
  fournisseurs: { value: string; label: string }[];
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (provider: string, model: string, prix: AiModelPrices) => void;
}) {
  const t = useTranslations('superAdmin.pages.ai.models');
  const [provider, setProvider] = useState(entree?.provider ?? fournisseurs[0]?.value ?? '');
  const [model, setModel] = useState(entree?.model ?? '');
  const [saisies, setSaisies] = useState<AiModelPrices>(entree ? { input: entree.input, output: entree.output, cache_read: entree.cache_read, cache_write: entree.cache_write } : TARIFS_VIDES);
  const lus = TARIFS.map((tarif) => lireSaisieMontantIa(saisies[tarif]));
  const complet = model.trim() !== '' && provider !== '' && lus.every((lu) => lu !== null);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="grid-cols-[minmax(0,1fr)]">
        <DialogHeader><DialogTitle className="pr-6 break-all">{entree ? t('editTitle', { model: entree.model }) : t('addTitle')}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {entree ? null : (
            <>
              <div className="space-y-1">
                <Label id="model-provider">{t('provider')}</Label>
                <Select value={provider} onValueChange={(v) => v && setProvider(v)} items={fournisseurs}>
                  <SelectTrigger className="h-10 w-full min-w-0" aria-labelledby="model-provider"><SelectValue /></SelectTrigger>
                  <SelectContent>{fournisseurs.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="model-identifier">{t('identifier')}</Label>
                <Input id="model-identifier" value={model} maxLength={255} autoComplete="off" spellCheck={false} aria-describedby="model-identifier-hint" onChange={(e) => setModel(e.target.value)} />
                <p id="model-identifier-hint" className="text-xs text-muted-foreground">{t('identifierHint')}</p>
              </div>
            </>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {TARIFS.map((tarif) => (
              <div key={tarif} className="space-y-1">
                <Label htmlFor={`model-${tarif}`}>{t(`prices.${tarif}`)}</Label>
                <Input
                  id={`model-${tarif}`}
                  inputMode="decimal"
                  autoComplete="off"
                  aria-describedby="model-prices-hint"
                  value={saisies[tarif]}
                  onChange={(e) => setSaisies((courant) => ({ ...courant, [tarif]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <p id="model-prices-hint" className="text-xs text-muted-foreground">{t('pricesHint')}</p>
        </div>
        {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('cancel')}</Button>
          <Button
            disabled={pending || !complet}
            onClick={() => onSave(provider, model.trim(), { input: lus[0] as string, output: lus[1] as string, cache_read: lus[2] as string, cache_write: lus[3] as string })}
          >
            {t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
