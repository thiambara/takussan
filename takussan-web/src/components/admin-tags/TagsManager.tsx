'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';
import { Loader2, Pencil, Plus, Search, Trash2 } from 'lucide-react';

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
import { FormError, FormGlobalError } from '@/components/forms';
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

const TAG_TYPE_LABELS: Record<TagType | 'all', string> = {
  all: 'Tous',
  amenity: 'Commodités',
  feature: 'Caractéristiques',
  label: 'Étiquettes',
  crm: 'CRM',
};

const TAG_TYPE_OPTIONS: { value: TagType; label: string }[] = tagTypeValues.map(
  (v) => ({ value: v, label: TAG_TYPE_LABELS[v] }),
);

function emptyFormValues(): TagFormValues {
  return { name: '', type: 'amenity', icon: '', color: '', description: '' };
}

export function TagsManager({ initialTags }: TagsManagerProps) {
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
            message:
              'Ce tag est utilisé par un ou plusieurs biens. Envisagez de le renommer ou de le retirer des biens concernés avant suppression.',
          });
        } else {
          setRowError({ id: tag.id, message: result.message });
        }
        return;
      }
      setTags((prev) => prev.filter((t) => t.id !== tag.id));
    });
  }, []);

  const handleCreate = useCallback(
    async (values: TagFormValues) => {
      setGlobalError(null);
      const parsed = tagFormSchema.safeParse(values);
      if (!parsed.success) {
        return {
          ok: false as const,
          errors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
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
    [],
  );

  return (
    <div className="space-y-6">
      {globalError ? (
        <FormGlobalError>
          <span className="flex items-center justify-between gap-4">
            <span>{globalError}</span>
            <button
              type="button"
              onClick={() => setGlobalError(null)}
              className="text-xs underline"
            >
              Fermer
            </button>
          </span>
        </FormGlobalError>
      ) : null}

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Filtrer par type">
          {(['all', ...tagTypeValues] as const).map((opt) => {
            const active = activeType === opt;
            return (
              <button
                key={opt}
                role="tab"
                aria-selected={active}
                type="button"
                onClick={() => setActiveType(opt)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-input text-muted-foreground hover:bg-muted'
                }`}
              >
                {TAG_TYPE_LABELS[opt]}
              </button>
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
              aria-label="Rechercher un tag"
              placeholder="Rechercher…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>
          <Button type="button" onClick={() => setCreateOpen(true)}>
            <Plus aria-hidden="true" />
            <span>Nouveau tag</span>
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-input">
        <table className="min-w-full text-sm">
          <thead className="bg-app-surface-2 text-left text-xs uppercase tracking-wider text-app-ink-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">Nom</th>
              <th scope="col" className="px-4 py-3 font-semibold">Slug</th>
              <th scope="col" className="px-4 py-3 font-semibold">Type</th>
              <th scope="col" className="px-4 py-3 font-semibold">Couleur</th>
              <th scope="col" className="px-4 py-3 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-input">
            {filteredTags.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-app-ink-muted">
                  Aucun tag pour cette recherche.
                </td>
              </tr>
            ) : (
              filteredTags.map((tag) => {
                const isEditing = editingId === tag.id;
                return (
                  <tr key={tag.id} className="bg-app-surface-1">
                    <td className="px-4 py-3 font-medium text-app-ink">
                      {isEditing ? (
                        <Input
                          autoFocus
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitEdit(tag);
                            if (e.key === 'Escape') cancelEdit();
                          }}
                          aria-label={`Renommer ${tag.name}`}
                        />
                      ) : (
                        tag.name
                      )}
                      {rowError?.id === tag.id ? (
                        <FormError>{rowError.message}</FormError>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-xs text-app-ink-muted">{tag.slug}</td>
                    <td className="px-4 py-3 text-xs">{TAG_TYPE_LABELS[tag.type]}</td>
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
                        <span className="text-app-ink-muted">—</span>
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
                            Enregistrer
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={cancelEdit}
                            disabled={isPending}
                          >
                            Annuler
                          </Button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={`Modifier ${tag.name}`}
                            onClick={() => beginEdit(tag)}
                            disabled={isPending}
                          >
                            <Pencil aria-hidden="true" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={`Supprimer ${tag.name}`}
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
  const [values, setValues] = useState<TagFormValues>(emptyFormValues());
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [isSubmitting, setSubmitting] = useState(false);

  const handleChange = (field: keyof TagFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
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
          <DialogTitle>Nouveau tag</DialogTitle>
          <DialogDescription>
            Le slug est généré automatiquement à partir du libellé et ne pourra plus
            être modifié.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="tag-name" className="mb-1.5 block text-sm font-medium">
              Libellé <span className="text-destructive">*</span>
            </label>
            <Input
              id="tag-name"
              value={values.name}
              onChange={handleChange('name')}
              placeholder="ex : Piscine"
              required
            />
            <FormError>{errors.name?.[0]}</FormError>
          </div>
          <div>
            <label htmlFor="tag-type" className="mb-1.5 block text-sm font-medium">
              Type <span className="text-destructive">*</span>
            </label>
            <select
              id="tag-type"
              value={values.type}
              onChange={handleChange('type')}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              required
            >
              {TAG_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <FormError>{errors.type?.[0]}</FormError>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="tag-icon" className="mb-1.5 block text-sm font-medium">
                Icône (nom Lucide)
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
                Couleur (hex)
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
              Annuler
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden="true" />
                  <span>Création…</span>
                </>
              ) : (
                <span>Créer le tag</span>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
