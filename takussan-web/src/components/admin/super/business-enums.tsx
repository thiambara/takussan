'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Edit3, Plus, Power } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  deleteBusinessEnumValue,
  patchBusinessEnumValue,
  postBusinessEnumValue,
} from '@/lib/queries/super-admin';
import type { BusinessEnum, BusinessEnumValue } from '@/types/super-admin';
import type { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

export function EnumList({
  enums,
  selectedKey,
  onSelect,
}: {
  enums: BusinessEnum[];
  selectedKey: string;
  onSelect: (key: string) => void;
}) {
  return (
    <nav className="rounded-xl bg-white p-2 ring-1 ring-stone-200" aria-label="Enums éditables">
      {enums.map((item) => (
        <Button
          key={item.key}
          type="button"
          variant={selectedKey === item.key ? 'default' : 'ghost'}
          className="mb-1 h-auto w-full justify-start whitespace-normal px-3 py-2 text-left"
          onClick={() => onSelect(item.key)}
        >
          <span>
            <span className="block">{item.name}</span>
            <span className="block text-xs opacity-75">{item.values.length} valeurs</span>
          </span>
        </Button>
      ))}
    </nav>
  );
}

export function EnumValueTable({
  item,
  onEdit,
  onAdd,
}: {
  item: BusinessEnum;
  onEdit: (value: BusinessEnumValue) => void;
  onAdd: () => void;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const deactivate = useMutation({
    mutationFn: (value: string) => deleteBusinessEnumValue(item.key, value),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'business-enums'] });
    },
    onError: (err: ApiError) => setError(err.displayMessage),
  });

  return (
    <section className="rounded-xl bg-white ring-1 ring-stone-200">
      <div className="flex flex-col gap-3 border-b border-stone-200 p-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="font-display text-xl font-semibold text-stone-950">{item.name}</h2>
          <p className="mt-1 text-sm text-stone-600">{item.description}</p>
        </div>
        <Button type="button" onClick={onAdd}>
          <Plus className="size-4" aria-hidden="true" />
          Ajouter une valeur
        </Button>
      </div>
      {error ? (
        <div className="m-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-900 ring-1 ring-red-200" role="alert">
          {error}
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-stone-200 text-xs sm:text-sm">
          <thead className="bg-stone-50 text-left text-xs font-semibold uppercase text-stone-500">
            <tr>
              <th className="px-2 py-2 sm:px-4">Valeur</th>
              <th className="px-2 py-2 sm:px-4">FR</th>
              <th className="px-2 py-2 sm:px-4">EN</th>
              <th className="px-2 py-2 sm:px-4">WO</th>
              <th className="px-2 py-2 sm:px-4">Usage</th>
              <th className="px-2 py-2 sm:px-4"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {item.values.map((value) => (
              <tr key={value.value} className={cn(!value.is_active && 'opacity-55')}>
                <td className="px-2 py-2 font-mono text-xs sm:px-4 sm:py-3">{value.value}</td>
                <td className="px-2 py-2 sm:px-4 sm:py-3">{value.labels.fr}</td>
                <td className="px-2 py-2 sm:px-4 sm:py-3">{value.labels.en}</td>
                <td className="px-2 py-2 sm:px-4 sm:py-3">{value.labels.wo}</td>
                <td className="px-2 py-2 sm:px-4 sm:py-3">
                  <Badge variant={value.usage_count > 0 ? 'secondary' : 'outline'}>
                    {value.usage_count}
                  </Badge>
                </td>
                <td className="px-2 py-2 sm:px-4 sm:py-3">
                  <div className="flex justify-end gap-1">
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={`Modifier ${value.value}`} onClick={() => onEdit(value)}>
                      <Edit3 className="size-4" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Désactiver ${value.value}`}
                      onClick={() => deactivate.mutate(value.value)}
                      disabled={deactivate.isPending || !value.is_active}
                    >
                      <Power className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function EnumValueDialog({
  enumKey,
  value,
  open,
  onOpenChange,
}: {
  enumKey: string;
  value: BusinessEnumValue | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <EnumValueDialogForm
        key={`${enumKey}:${value?.value ?? 'new'}:${open ? 'open' : 'closed'}`}
        enumKey={enumKey}
        value={value}
        onOpenChange={onOpenChange}
      />
    </Dialog>
  );
}

function EnumValueDialogForm({
  enumKey,
  value,
  onOpenChange,
}: {
  enumKey: string;
  value: BusinessEnumValue | null;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [rawValue, setRawValue] = useState(value?.value ?? '');
  const [fr, setFr] = useState(value?.labels.fr ?? '');
  const [en, setEn] = useState(value?.labels.en ?? '');
  const [wo, setWo] = useState(value?.labels.wo ?? '');
  const [error, setError] = useState<string | null>(null);
  const editing = value !== null;

  const mutation = useMutation({
    mutationFn: () => editing
      ? patchBusinessEnumValue(enumKey, value.value, { labels: { fr, en, wo } })
      : postBusinessEnumValue(enumKey, { value: rawValue, labels: { fr, en, wo }, is_active: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'business-enums'] });
      onOpenChange(false);
    },
    onError: (err: ApiError) => setError(err.displayMessage),
  });

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{editing ? 'Modifier la valeur' : 'Ajouter une valeur'}</DialogTitle>
      </DialogHeader>
      <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-950 ring-1 ring-amber-200">
        <AlertTriangle className="mr-2 inline size-4" aria-hidden="true" />
        Les statuts techniques et rôles ne sont pas éditables ici.
      </div>
      <div className="space-y-3">
        <label className="block text-sm font-medium">
          <span className="mb-1 block">Valeur</span>
          <Input value={rawValue} onChange={(event) => setRawValue(event.target.value)} disabled={editing} />
        </label>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="block text-sm font-medium">
            <span className="mb-1 block">FR</span>
            <Input value={fr} onChange={(event) => setFr(event.target.value)} required />
          </label>
          <label className="block text-sm font-medium">
            <span className="mb-1 block">EN</span>
            <Input value={en} onChange={(event) => setEn(event.target.value)} />
          </label>
          <label className="block text-sm font-medium">
            <span className="mb-1 block">WO</span>
            <Input value={wo} onChange={(event) => setWo(event.target.value)} />
          </label>
        </div>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Annuler
        </Button>
        <Button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending || fr.trim() === '' || rawValue.trim() === ''}>
          Enregistrer
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
