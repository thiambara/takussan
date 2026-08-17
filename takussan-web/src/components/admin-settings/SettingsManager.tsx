'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Pencil, Plus, Save, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { EmptyState } from '@/components/feedback';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FormError, FormGlobalError, FormSuccess } from '@/components/forms';
import { renderSettingValue } from '@/lib/queries/settings';
import {
  parseSettingRawValue,
  settingScopeValues,
  stringifySettingValue,
  type SettingFormValues,
} from '@/lib/schemas/setting';
import {
  deleteSettingAction,
  updateSettingAction,
  upsertSettingAction,
} from '@/app/actions/admin-settings';
import type { Setting, SettingScope } from '@/types/setting';

/**
 * Global settings manager — TCK-068.
 *
 * Displays settings grouped by scope, allows inline editing of the value
 * and exposes a modal for adding a new key. Secrets are not stored here
 * (they live in `Integration.credentials`) so we can display values freely.
 */

interface SettingsManagerProps {
  readonly initialSettings: Setting[];
  readonly canManageGlobal: boolean;
}

const SCOPE_LABELS: Record<SettingScope, string> = {
  global: 'Globaux',
  agency: 'Agence',
};

const SENSITIVE_KEYS = new Set(['maintenance_mode', 'feature_flags']);

export function SettingsManager({ initialSettings, canManageGlobal }: SettingsManagerProps) {
  const t = useTranslations('adminSettings.settings');
  const [settings, setSettings] = useState<Setting[]>(initialSettings);
  const [scopeFilter, setScopeFilter] = useState<'all' | SettingScope>('all');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [rowError, setRowError] = useState<{ id: number; message: string } | null>(null);
  const [banner, setBanner] = useState<{ kind: 'success' | 'error'; message: string } | null>(
    null,
  );
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const visible = useMemo(() => {
    if (scopeFilter === 'all') return settings;
    return settings.filter((s) => s.scope === scopeFilter);
  }, [settings, scopeFilter]);

  const beginEdit = useCallback((setting: Setting) => {
    setEditingId(setting.id);
    setEditingValue(stringifySettingValue(setting.value));
    setRowError(null);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditingValue('');
    setRowError(null);
  }, []);

  const commitEdit = useCallback(
    (setting: Setting) => {
      if (SENSITIVE_KEYS.has(setting.key)) {
        const ok = window.confirm(
          `Le paramètre « ${setting.key} » a un impact global. Confirmer la modification ?`,
        );
        if (!ok) return;
      }
      const payload = parseSettingRawValue(editingValue);
      startTransition(async () => {
        const result = await updateSettingAction(setting.id, payload);
        if (!result.ok) {
          setRowError({ id: setting.id, message: result.message });
          return;
        }
        setSettings((prev) =>
          prev.map((s) => (s.id === setting.id ? (result.data ?? s) : s)),
        );
        setBanner({ kind: 'success', message: `Paramètre « ${setting.key} » mis à jour.` });
        cancelEdit();
      });
    },
    [editingValue, cancelEdit],
  );

  const handleDelete = useCallback((setting: Setting) => {
    const ok = window.confirm(`Supprimer le paramètre « ${setting.key} » ?`);
    if (!ok) return;
    startTransition(async () => {
      const result = await deleteSettingAction(setting.id);
      if (!result.ok) {
        setRowError({ id: setting.id, message: result.message });
        return;
      }
      setSettings((prev) => prev.filter((s) => s.id !== setting.id));
      setBanner({ kind: 'success', message: `Paramètre « ${setting.key} » supprimé.` });
    });
  }, []);

  const handleCreate = useCallback(
    async (
      values: SettingFormValues,
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      const parsedValue = parseSettingRawValue(values.value);
      const result = await upsertSettingAction({
        key: values.key.trim(),
        scope: values.scope,
        value: parsedValue,
      });
      if (!result.ok) return { ok: false as const, error: result.message };
      if (result.data) {
        setSettings((prev) => {
          const existingIdx = prev.findIndex((s) => s.id === result.data?.id);
          if (existingIdx >= 0) {
            const next = [...prev];
            next[existingIdx] = result.data as Setting;
            return next;
          }
          return [result.data as Setting, ...prev];
        });
      }
      setBanner({ kind: 'success', message: `Paramètre « ${values.key} » enregistré.` });
      return { ok: true as const };
    },
    [],
  );

  return (
    <div className="space-y-6">
      {banner?.kind === 'success' ? (
        <FormSuccess>
          <span className="flex items-center justify-between gap-4">
            <span>{banner.message}</span>
            <button type="button" onClick={() => setBanner(null)} className="text-xs underline">
              Fermer
            </button>
          </span>
        </FormSuccess>
      ) : null}
      {banner?.kind === 'error' ? (
        <FormGlobalError>{banner.message}</FormGlobalError>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filtrer par portée">
          {(['all', 'global', 'agency'] as const).map((opt) => {
            const active = scopeFilter === opt;
            return (
              <button
                key={opt}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setScopeFilter(opt)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-input text-muted-foreground hover:bg-muted'
                }`}
              >
                {opt === 'all' ? 'Tous' : SCOPE_LABELS[opt as SettingScope]}
              </button>
            );
          })}
        </div>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          <Plus aria-hidden="true" />
          <span>Nouveau paramètre</span>
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-input">
        <table className="min-w-full text-sm">
          <thead className="bg-app-surface-2 text-left text-xs uppercase tracking-wider text-app-ink-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">Clé</th>
              <th scope="col" className="px-4 py-3 font-semibold">Portée</th>
              <th scope="col" className="px-4 py-3 font-semibold">Valeur</th>
              <th scope="col" className="px-4 py-3 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-input">
            {visible.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-0">
                  <EmptyState
                    className="border-0"
                    icon={<SlidersHorizontal className="size-8" aria-hidden="true" />}
                    title={t('empty_title')}
                    description={t('empty_description')}
                  />
                </td>
              </tr>
            ) : (
              visible.map((setting) => {
                const isEditing = editingId === setting.id;
                const canEdit = setting.scope === 'global' ? canManageGlobal : true;
                return (
                  <tr key={setting.id} className="bg-app-surface-1 align-top">
                    <td className="px-4 py-3 font-mono text-xs">{setting.key}</td>
                    <td className="px-4 py-3 text-xs">
                      <span className="rounded-full bg-muted px-2 py-0.5">
                        {SCOPE_LABELS[setting.scope]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {isEditing ? (
                        <Textarea
                          value={editingValue}
                          onChange={(e) => setEditingValue(e.target.value)}
                          rows={3}
                          className="font-mono text-xs"
                        />
                      ) : (
                        <code className="whitespace-pre-wrap break-all text-xs">
                          {renderSettingValue(setting.value)}
                        </code>
                      )}
                      {rowError?.id === setting.id ? (
                        <FormError>{rowError.message}</FormError>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isEditing ? (
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => commitEdit(setting)}
                            disabled={isPending}
                          >
                            <Save aria-hidden="true" />
                            <span>Enregistrer</span>
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={cancelEdit}
                            disabled={isPending}
                          >
                            <X aria-hidden="true" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={`Modifier ${setting.key}`}
                            onClick={() => beginEdit(setting)}
                            disabled={!canEdit || isPending}
                          >
                            <Pencil aria-hidden="true" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={`Supprimer ${setting.key}`}
                            onClick={() => handleDelete(setting)}
                            disabled={!canEdit || isPending}
                          >
                            <Trash2 aria-hidden="true" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <CreateSettingDialog
        open={isCreateOpen}
        onOpenChange={setCreateOpen}
        onSubmit={handleCreate}
        canManageGlobal={canManageGlobal}
      />
    </div>
  );
}

interface CreateSettingDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly canManageGlobal: boolean;
  readonly onSubmit: (
    values: SettingFormValues,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
}

function CreateSettingDialog({
  open,
  onOpenChange,
  canManageGlobal,
  onSubmit,
}: CreateSettingDialogProps) {
  const [values, setValues] = useState<SettingFormValues>({
    key: '',
    scope: canManageGlobal ? 'global' : 'agency',
    value: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (values.key.trim() === '') {
      setError('La clé est requise.');
      return;
    }
    setSubmitting(true);
    const result = await onSubmit(values);
    setSubmitting(false);
    if (result.ok) {
      setValues({ key: '', scope: canManageGlobal ? 'global' : 'agency', value: '' });
      onOpenChange(false);
    } else {
      setError(result.error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nouveau paramètre</DialogTitle>
          <DialogDescription>
            Les paramètres acceptent n’importe quelle valeur JSON. Les scalaires simples
            (texte, nombre, booléen) sont encapsulés automatiquement.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {error ? <FormGlobalError>{error}</FormGlobalError> : null}
          <div>
            <label htmlFor="setting-key" className="mb-1.5 block text-sm font-medium">
              Clé <span className="text-destructive">*</span>
            </label>
            <Input
              id="setting-key"
              value={values.key}
              onChange={(e) => setValues((v) => ({ ...v, key: e.target.value }))}
              placeholder="ex : maintenance_mode"
              required
            />
          </div>
          <div>
            <label htmlFor="setting-scope" className="mb-1.5 block text-sm font-medium">
              Portée <span className="text-destructive">*</span>
            </label>
            <Select
              value={values.scope}
              onValueChange={(value) => setValues((v) => ({ ...v, scope: (value ?? v.scope) as SettingScope }))}
              items={settingScopeValues.map((s) => ({ value: s, label: SCOPE_LABELS[s] }))}
            >
              <SelectTrigger id="setting-scope" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {settingScopeValues.map((s) => (
                  <SelectItem key={s} value={s} disabled={s === 'global' && !canManageGlobal}>
                    {SCOPE_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label htmlFor="setting-value" className="mb-1.5 block text-sm font-medium">
              Valeur
            </label>
            <Textarea
              id="setting-value"
              value={values.value}
              onChange={(e) => setValues((v) => ({ ...v, value: e.target.value }))}
              rows={4}
              placeholder={'true  •  42  •  "bonjour"  •  {"enabled": true}'}
              className="font-mono text-xs"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden="true" />
                  <span>Enregistrement…</span>
                </>
              ) : (
                <span>Enregistrer</span>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
