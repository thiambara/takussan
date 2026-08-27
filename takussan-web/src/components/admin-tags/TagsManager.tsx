'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Pencil, Plus, Search, Tags, Trash2 } from 'lucide-react';
import { EmptyState } from '@/components/feedback';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FormError, FormGlobalError } from '@/components/forms';
import { traduireChampsErreurs } from '@/lib/schemas/messages';
import { useTraducteurValidation } from '@/hooks/useApiForm';
import type { Tag, TagType } from '@/types/tag';
import {
  createTagAction,
  deleteTagAction,
  updateTagAction,
} from '@/app/actions/admin-tags';
import {
  normaliseTagForm,
  tagFormSchema,
  tagTypeValues,
  type TagFormValues,
} from '@/lib/schemas/tag';

/**
 * Tag / amenity admin manager — TCK-066.
 *
 * Client component with SSR-sourced initial data. Offers:
 *  - Tab-based filter by type (amenity, feature, label, crm)
 *  - Inline rename
 *  - Modal to create a new tag
 *  - Delete with fallback messaging on 409 (tag attached to properties)
 */

interface TagsManagerProps {
  readonly initialTags: Tag[];
}

/**
 * TCK-292 — la DONNÉE porte la clé, le rendu la résout. Les libellés de type vivent
 * sous `adminTags.types.*` : la table module-level ne peut pas appeler `useTranslations`.
 */

function emptyFormValues(): TagFormValues {
  return { name: '', type: 'amenity', icon: '', color: '', description: '' };
}

export function TagsManager({ initialTags }: TagsManagerProps) {
  const t = useTranslations('adminTags');
  const tCommon = useTranslations('common.actions');
  // À la RACINE du dictionnaire : les clés des schémas sont des chemins absolus (`validation.tag.…`),
  // que `useTranslations('adminTags')` ne peut pas résoudre.
  const tValidation = useTraducteurValidation();
  const [tags, setTags] = useState<Tag[]>(initialTags);
  const [activeType, setActiveType] = useState<TagType | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [rowError, setRowError] = useState<{ id: number; message: string } | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filteredTags = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tags.filter((t) => {
      if (activeType !== 'all' && t.type !== activeType) return false;
      if (q && !t.name.toLowerCase().includes(q) && !t.slug.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [tags, activeType, searchQuery]);

  const beginEdit = useCallback((tag: Tag) => {
    setEditingId(tag.id);
    setEditingName(tag.name);
    setRowError(null);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditingName('');
    setRowError(null);
  }, []);

  const commitEdit = useCallback(
    (tag: Tag) => {
      const trimmed = editingName.trim();
      if (trimmed === '' || trimmed === tag.name) {
        cancelEdit();
        return;
      }
      startTransition(async () => {
        const result = await updateTagAction(tag.id, { name: trimmed });
        if (!result.ok) {
          setRowError({ id: tag.id, message: result.message });
          return;
        }
        setTags((prev) => prev.map((t) => (t.id === tag.id ? (result.data ?? t) : t)));
        cancelEdit();
      });
    },
    [editingName, cancelEdit],
  );

  const handleDelete = useCallback((tag: Tag) => {
    startTransition(async () => {
      const result = await deleteTagAction(tag.id);
      if (!result.ok) {
        if (result.status === 409) {
          setRowError({
            id: tag.id,
            message: t('deleteConflict'),
          });
        } else {
          setRowError({ id: tag.id, message: result.message });
        }
        return;
      }
      setTags((prev) => prev.filter((item) => item.id !== tag.id));
    });
  }, [t]);

  const handleCreate = useCallback(
    async (values: TagFormValues) => {
      setGlobalError(null);
      const parsed = tagFormSchema.safeParse(values);
      if (!parsed.success) {
        // `fieldErrors` porte des CLÉS (`validation.tag.…`), pas des libellés : sans cette
        // résolution, `<FormError>` affiche `validation.tag.nameRequired` (TCK-292, lot L).
        return {
          ok: false as const,
          errors: traduireChampsErreurs(
            parsed.error.flatten().fieldErrors as Record<string, string[]>,
            tValidation,
          ),
        };
      }
      const result = await createTagAction(normaliseTagForm(parsed.data));
      if (!result.ok) {
        setGlobalError(result.message);
        return { ok: false as const, errors: result.errors ?? {} };
      }
      if (result.data) setTags((prev) => [result.data as Tag, ...prev]);
      return { ok: true as const };
    },
    [tValidation],
  );

  return (
    <div className="space-y-6">
      {globalError ? (
        <FormGlobalError>
          <span className="flex items-center justify-between gap-4">
            <span>{globalError}</span>
            <Button
              type="button"
              onClick={() => setGlobalError(null)}
              variant="ghost"
              size="xs"
            >
              {tCommon('close')}
            </Button>
          </span>
        </FormGlobalError>
      ) : null}

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label={t('filterByType')}>
          {(['all', ...tagTypeValues] as const).map((opt) => {
            const active = activeType === opt;
            return (
              <Button
                key={opt}
                role="tab"
                aria-selected={active}
                type="button"
                onClick={() => setActiveType(opt)}
                variant={active ? 'default' : 'outline'}
                size="sm"
                className="rounded-full"
              >
                {t(`types.${opt}`)}
              </Button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              aria-label={t('searchLabel')}
              placeholder={t('searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>
          <Button type="button" onClick={() => setCreateOpen(true)}>
            <Plus aria-hidden="true" />
            <span>{t('new')}</span>
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-input">
        <table className="min-w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">{t('columns.name')}</th>
              <th scope="col" className="px-4 py-3 font-semibold">{t('columns.slug')}</th>
              <th scope="col" className="px-4 py-3 font-semibold">{t('columns.type')}</th>
              <th scope="col" className="px-4 py-3 font-semibold">{t('columns.color')}</th>
              <th scope="col" className="px-4 py-3 font-semibold text-right">{t('columns.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-input">
            {filteredTags.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-0">
                  <EmptyState
                    className="border-0"
                    icon={<Tags className="size-8" aria-hidden="true" />}
                    title={t('empty_title')}
                    description={t('empty_description')}
                  />
                </td>
              </tr>
            ) : (
              filteredTags.map((tag) => {
                const isEditing = editingId === tag.id;
                return (
                  <tr key={tag.id} className="bg-card">
                    <td className="px-4 py-3 font-medium text-foreground">
                      {isEditing ? (
                        <Input
                          autoFocus
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitEdit(tag);
                            if (e.key === 'Escape') cancelEdit();
                          }}
                          aria-label={t('actions.rename', { name: tag.name })}
                        />
                      ) : (
                        tag.name
                      )}
                      {rowError?.id === tag.id ? (
                        <FormError>{rowError.message}</FormError>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{tag.slug}</td>
                    <td className="px-4 py-3 text-xs">{t(`types.${tag.type}`)}</td>
                    <td className="px-4 py-3 text-xs">
                      {tag.color ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            aria-hidden="true"
                            className="inline-block size-3 rounded-full border border-input"
                            style={{ backgroundColor: tag.color }}
                          />
                          <code className="text-[11px]">{tag.color}</code>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isEditing ? (
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => commitEdit(tag)}
                            disabled={isPending}
                          >
                            {tCommon('save')}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={cancelEdit}
                            disabled={isPending}
                          >
                            {tCommon('cancel')}
                          </Button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={t('actions.edit', { name: tag.name })}
                            onClick={() => beginEdit(tag)}
                            disabled={isPending}
                          >
                            <Pencil aria-hidden="true" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={t('actions.delete', { name: tag.name })}
                            onClick={() => handleDelete(tag)}
                            disabled={isPending}
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

      <CreateTagDialog
        open={isCreateOpen}
        onOpenChange={setCreateOpen}
        onSubmit={handleCreate}
      />
    </div>
  );
}

interface CreateTagDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSubmit: (
    values: TagFormValues,
  ) => Promise<{ ok: true } | { ok: false; errors: Record<string, string[]> }>;
}

function CreateTagDialog({ open, onOpenChange, onSubmit }: CreateTagDialogProps) {
  const t = useTranslations('adminTags');
  const tCommon = useTranslations('common.actions');
  const typeOptions: { value: TagType; label: string }[] = tagTypeValues.map(
    (v) => ({ value: v, label: t(`types.${v}`) }),
  );
  const [values, setValues] = useState<TagFormValues>(emptyFormValues());
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [isSubmitting, setSubmitting] = useState(false);

  const handleChange = (field: keyof TagFormValues) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, [field]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const result = await onSubmit(values);
    setSubmitting(false);
    if (result.ok) {
      setValues(emptyFormValues());
      setErrors({});
      onOpenChange(false);
    } else {
      setErrors(result.errors);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setValues(emptyFormValues());
          setErrors({});
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('new')}</DialogTitle>
          <DialogDescription>{t('create.description')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="tag-name" className="mb-1.5 block text-sm font-medium">
              {t('form.name')} <span className="text-destructive">*</span>
            </label>
            <Input
              id="tag-name"
              value={values.name}
              onChange={handleChange('name')}
              placeholder={t('form.namePlaceholder')}
              required
            />
            <FormError>{errors.name?.[0]}</FormError>
          </div>
          <div>
            <label htmlFor="tag-type" className="mb-1.5 block text-sm font-medium">
              {t('form.type')} <span className="text-destructive">*</span>
            </label>
            <Select
              value={values.type}
              onValueChange={(value) => setValues((current) => ({ ...current, type: (value ?? 'amenity') as TagType }))}
              items={typeOptions}
            >
              <SelectTrigger id="tag-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {typeOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormError>{errors.type?.[0]}</FormError>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="tag-icon" className="mb-1.5 block text-sm font-medium">
                {t('form.icon')}
              </label>
              <Input
                id="tag-icon"
                value={values.icon}
                onChange={handleChange('icon')}
                placeholder="wifi"
              />
              <FormError>{errors.icon?.[0]}</FormError>
            </div>
            <div>
              <label htmlFor="tag-color" className="mb-1.5 block text-sm font-medium">
                {t('form.color')}
              </label>
              <Input
                id="tag-color"
                value={values.color}
                onChange={handleChange('color')}
                placeholder="#2563eb"
              />
              <FormError>{errors.color?.[0]}</FormError>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              {tCommon('cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden="true" />
                  <span>{t('create.submitting')}</span>
                </>
              ) : (
                <span>{t('create.submit')}</span>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
