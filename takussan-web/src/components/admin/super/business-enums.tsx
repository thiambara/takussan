'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Edit3 } from 'lucide-react';
import { DataTable, type DataTableColumn } from '@/components/console';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { WarningBanner } from '@/components/ui/warning-banner';
import { patchBusinessEnumValue } from '@/lib/queries/super-admin';
import type { BusinessEnum, BusinessEnumValue } from '@/types/super-admin';
import type { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

export function EnumList({
  enums,
  selectedKey,
  onSelect,
}: {
  enums: BusinessEnum[];
  selectedKey: string;
  onSelect: (key: string) => void;
}) {
  const t = useTranslations('superAdmin.enums');
  return (
    <nav className="rounded-xl bg-card p-2 ring-1 ring-border" aria-label={t('navLabel')}>
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
            <span className="block text-xs">{t('valuesCount', { count: item.values.length })}</span>
          </span>
        </Button>
      ))}
    </nav>
  );
}

export function EnumValueTable({
  item,
  onEdit,
}: {
  item: BusinessEnum;
  onEdit: (value: BusinessEnumValue) => void;
}) {
  const t = useTranslations('superAdmin.enums');

  const columns: DataTableColumn<BusinessEnumValue>[] = [
    { id: 'value', header: t('value'), className: 'font-mono text-xs', cell: (value) => value.value },
    { id: 'fr', header: t('localeFr'), cell: (value) => value.labels.fr },
    { id: 'en', header: t('localeEn'), cell: (value) => value.labels.en },
    { id: 'wo', header: t('localeWo'), cell: (value) => value.labels.wo },
    {
      id: 'usage',
      header: t('usage'),
      cell: (value) => (
        <Badge variant={value.usage_count > 0 ? 'secondary' : 'outline'} className="tabular-nums">{value.usage_count}</Badge>
      ),
    },
    {
      id: 'actions',
      header: t('actions'),
      headerSrOnly: true,
      align: 'end',
      cell: (value) => (
        <div className="flex justify-end gap-1">
          <Button type="button" variant="ghost" size="icon-sm" aria-label={t('editValueAria', { value: value.value })} onClick={() => onEdit(value)}>
            <Edit3 className="size-4" aria-hidden="true" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <section className="overflow-hidden rounded-xl bg-card ring-1 ring-border">
      {/* Aucun bouton d'ajout : la liste vit dans l'enum PHP (ADR-0007), et une valeur ajoutée
        ici était refusée en 422 à la création d'un bien (P66.01, TCK-1055). */}
      <div className="border-b border-border p-4">
        <h2 className="font-display text-xl font-semibold text-foreground">{item.name}</h2>
        <p className="mt-1 text-pretty text-sm text-muted-foreground">{item.description}</p>
      </div>
      <DataTable
        // La table de valeurs est la plus dense de la console (six colonnes, dont trois locales) :
        // c'est le seul écran qui réclame la variante compacte, et c'est pour ça qu'elle existe.
        density="compact"
        className="rounded-none ring-0"
        caption={t('tableCaption', { name: item.name })}
        columns={columns}
        rows={item.values}
        rowKey={(value) => value.value}
        rowProps={(value) => ({ className: cn(!value.is_active && 'opacity-55') })}
      />
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
      {value ? (
        <EnumValueDialogForm
          key={`${enumKey}:${value.value}:${open ? 'open' : 'closed'}`}
          enumKey={enumKey}
          value={value}
          onOpenChange={onOpenChange}
        />
      ) : null}
    </Dialog>
  );
}

function EnumValueDialogForm({
  enumKey,
  value,
  onOpenChange,
}: {
  enumKey: string;
  value: BusinessEnumValue;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('superAdmin.enums');
  const tCommon = useTranslations('common');
  const messageErreur = useMessageErreurApi();
  const queryClient = useQueryClient();
  const [fr, setFr] = useState(value.labels.fr);
  const [en, setEn] = useState(value.labels.en);
  const [wo, setWo] = useState(value.labels.wo);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => patchBusinessEnumValue(enumKey, value.value, { labels: { fr, en, wo } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'business-enums'] });
      onOpenChange(false);
    },
    onError: (err: ApiError) => setError(messageErreur(err)),
  });

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{t('editValue')}</DialogTitle>
      </DialogHeader>
      <WarningBanner
        className="rounded-md px-3 py-2"
        icon={<AlertTriangle className="size-4" aria-hidden="true" />}
      >
        {t('warning')}
      </WarningBanner>
      <div className="space-y-3">
        <label className="block text-sm font-medium">
          <span className="mb-1 block">{t('value')}</span>
          <Input value={value.value} disabled />
        </label>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="block text-sm font-medium">
            <span className="mb-1 block">{t('localeFr')}</span>
            <Input value={fr} onChange={(event) => setFr(event.target.value)} required />
          </label>
          <label className="block text-sm font-medium">
            <span className="mb-1 block">{t('localeEn')}</span>
            <Input value={en} onChange={(event) => setEn(event.target.value)} />
          </label>
          <label className="block text-sm font-medium">
            <span className="mb-1 block">{t('localeWo')}</span>
            <Input value={wo} onChange={(event) => setWo(event.target.value)} />
          </label>
        </div>
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          {tCommon('actions.cancel')}
        </Button>
        <Button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending || fr.trim() === ''}>
          {tCommon('actions.save')}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
