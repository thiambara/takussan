'use client';

import { useTranslations } from 'next-intl';
import { DataTable, type DataTableColumn } from '@/components/console';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { BusinessEnum, BusinessEnumValue } from '@/types/super-admin';
import { cn } from '@/lib/utils';

/**
 * La console des enums métier est en LECTURE SEULE (angle 66 des pistes). La liste vit dans l'enum
 * PHP (ADR-0007) et les libellés affichés dans les dictionnaires du front (principe n° 5) : ce que
 * la console écrivait n'était lu ni par l'écriture d'un bien ni par aucun rendu. Ajout (TCK-1055),
 * désactivation (TCK-1056) et édition des libellés (TCK-1057) ont été retirés.
 */
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

export function EnumValueTable({ item }: { item: BusinessEnum }) {
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
  ];

  return (
    <section className="overflow-hidden rounded-xl bg-card ring-1 ring-border">
      <div className="border-b border-border p-4">
        <h2 className="font-display text-xl font-semibold text-foreground">{item.name}</h2>
        <p className="mt-1 text-pretty text-sm text-muted-foreground">{item.description}</p>
      </div>
      <DataTable
        // La table de valeurs est la plus dense de la console (cinq colonnes, dont trois locales) :
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
