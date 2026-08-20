'use client';

import { useCallback, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ErrorState } from '@/components/feedback';
import { CapabilityMatrix } from './CapabilityMatrix';
import { useSyncRoleCapabilities, useUpdateAgencyRole } from '@/lib/queries/agency-roles';
import { useCapabilityCatalogue } from '@/lib/queries/capabilities';
import type { AgencyRole, CapabilityValue } from '@/types/agency-role';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

interface AgencyRoleEditorProps {
  readonly agencyId: number;
  readonly role: AgencyRole;
  /** `false` → matrice et champs en lecture seule (pas de `roles.edit_custom`). */
  readonly canEdit: boolean;
}

/** Deux listes de capacités portent-elles le même ensemble ? L'ordre ne compte pas. */
function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((v) => set.has(v));
}

/**
 * TCK-279 (AC11) — panneau droit de `/admin/roles`.
 *
 * ## Deux requêtes, deux boutons, une seule intention — et pourquoi
 *
 * L'API sépare l'identité du rôle (`PATCH .../roles/{r}`) de ses capacités
 * (`PUT .../roles/{r}/capabilities`, un *remplacement en bloc*). Cet écran
 * les présente comme une seule action « Enregistrer », et n'envoie **que ce
 * qui a changé** : éditer un nom ne rejoue pas le sync des capacités.
 *
 * Ce n'est pas une optimisation. Le sync purge le cache de capacités du rôle
 * (`AgencyRoleCapabilityCache`) et réécrit le pivot pour tous les profils
 * attachés ; le déclencher sur une correction de faute de frappe ferait payer
 * à des utilisateurs tiers un geste qui ne les concerne pas.
 *
 * ## Un rôle système s'affiche entièrement, et ne s'enregistre pas
 *
 * `AgencyRolePolicy::update` refuse `is_system` **avant** de regarder la
 * capacité : il n'existe aucun utilisateur pour qui ce formulaire aboutirait.
 * Le montrer en lecture seule est donc l'état honnête — et c'est ce qu'on
 * veut voir pour décider quoi cloner.
 */
export function AgencyRoleEditor({ agencyId, role, canEdit }: AgencyRoleEditorProps) {
  const t = useTranslations('admin.roles');
  const tCommon = useTranslations('common.actions');
  const messageErreur = useMessageErreurApi();

  const readOnly = role.is_system || !canEdit;

  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description ?? '');
  const [capabilities, setCapabilities] = useState<CapabilityValue[]>([
    ...(role.capabilities ?? []),
  ]);
  const [saved, setSaved] = useState(false);

  /**
   * Le rôle sélectionné peut changer sans que ce composant soit démonté (la
   * liste est à côté, pas au-dessus). Sans resynchronisation, l'éditeur
   * afficherait les brouillons du rôle PRÉCÉDENT sur le rôle courant — et un
   * « Enregistrer » les y écrirait.
   *
   * Ajusté PENDANT LE RENDU, pas dans un effet. C'est le patron que React
   * documente pour « un état dérivé d'une prop qui change » : le rendu est
   * rejoué immédiatement avec les bonnes valeurs, sans que le DOM ait
   * jamais porté les anciennes. Un `useEffect` peindrait d'abord l'écran
   * faux — et `react-hooks/set-state-in-effect` le refuse pour cette raison.
   */
  const [syncedRoleId, setSyncedRoleId] = useState(role.id);
  if (syncedRoleId !== role.id) {
    setSyncedRoleId(role.id);
    setName(role.name);
    setDescription(role.description ?? '');
    setCapabilities([...(role.capabilities ?? [])]);
    setSaved(false);
  }

  const catalogueQuery = useCapabilityCatalogue();
  const updateRole = useUpdateAgencyRole(agencyId, role.id);
  const syncCapabilities = useSyncRoleCapabilities(agencyId, role.id);

  const identityDirty =
    name.trim() !== role.name || description.trim() !== (role.description ?? '');
  const capabilitiesDirty = !sameSet(capabilities, role.capabilities ?? []);
  const dirty = identityDirty || capabilitiesDirty;
  const isPending = updateRole.isPending || syncCapabilities.isPending;

  const reset = useCallback(() => {
    setName(role.name);
    setDescription(role.description ?? '');
    setCapabilities([...(role.capabilities ?? [])]);
    setSaved(false);
  }, [role]);

  const save = useCallback(async () => {
    setSaved(false);
    if (identityDirty) {
      await updateRole.mutateAsync({
        name: name.trim(),
        description: description.trim() === '' ? null : description.trim(),
      });
    }
    if (capabilitiesDirty) {
      await syncCapabilities.mutateAsync({ capabilities });
    }
    setSaved(true);
  }, [
    identityDirty,
    capabilitiesDirty,
    updateRole,
    syncCapabilities,
    name,
    description,
    capabilities,
  ]);

  const error = useMemo(
    () => updateRole.error ?? syncCapabilities.error ?? null,
    [updateRole.error, syncCapabilities.error],
  );

  return (
    <section className="space-y-6" data-testid="agency-role-editor">
      {role.is_system ? (
        <p
          className="flex items-start gap-2 rounded-xl border border-border bg-app-surface-2/50 px-4 py-3 text-sm text-app-ink-muted"
          data-testid="agency-role-system-notice"
        >
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {t('editor.system_notice')}
        </p>
      ) : null}

      <div className="space-y-4 rounded-xl border border-border bg-app-surface-1 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-app-ink-muted">
          {t('editor.details_heading')}
        </h2>
        <div className="space-y-2">
          <Label htmlFor="agency-role-name">{t('editor.name_label')}</Label>
          <Input
            id="agency-role-name"
            value={name}
            disabled={readOnly || isPending}
            placeholder={t('editor.name_placeholder')}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="agency-role-description">{t('editor.description_label')}</Label>
          <Textarea
            id="agency-role-description"
            rows={2}
            value={description}
            disabled={readOnly || isPending}
            placeholder={t('editor.description_placeholder')}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-app-ink-muted">
            {t('editor.capabilities_heading')}
          </h2>
          <p className="mt-1 text-xs text-app-ink-muted">{t('editor.capabilities_hint')}</p>
        </div>

        {catalogueQuery.isLoading ? (
          <div className="h-40 animate-pulse rounded-xl bg-muted" aria-hidden="true" />
        ) : catalogueQuery.isError || !catalogueQuery.data ? (
          <ErrorState
            message={messageErreur(catalogueQuery.error, t('errors.load'))}
            onRetry={() => void catalogueQuery.refetch()}
            retryLabel={tCommon('retry')}
          />
        ) : (
          <CapabilityMatrix
            catalogue={catalogueQuery.data.data}
            value={capabilities}
            onChange={setCapabilities}
            readOnly={readOnly}
          />
        )}
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {messageErreur(error)}
        </p>
      ) : null}
      {saved && !dirty ? (
        <p className="text-sm text-accent" role="status">
          {t('editor.saved')}
        </p>
      ) : null}

      {readOnly ? null : (
        <div className="flex items-center gap-2">
          <Button disabled={!dirty || isPending || name.trim() === ''} onClick={() => void save()}>
            {isPending ? (
              <Loader2 className="mr-1 size-4 animate-spin" aria-hidden="true" />
            ) : null}
            {isPending ? t('editor.saving') : t('editor.save')}
          </Button>
          {dirty ? (
            <Button variant="ghost" disabled={isPending} onClick={reset}>
              {t('editor.reset')}
            </Button>
          ) : null}
        </div>
      )}
    </section>
  );
}
