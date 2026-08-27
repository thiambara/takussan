'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { Download, FileSpreadsheet, FileText, Loader2, ScrollText } from 'lucide-react';
import { EmptyState } from '@/components/feedback';
import {
  DataState,
  DataTable,
  DebouncedSearchInput,
  Pagination,
  StatusBadge,
  type DataTableColumn,
  type StatusTone,
} from '@/components/console';
import { auditSubjectHref, shortSubjectType } from '@/lib/audit-subject-links';
import { formatDate as formatDateIntl } from '@/lib/format';
import type { Locale } from '@/i18n/config';

import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  fetchAuditLogs,
  buildExportUrl,
  type AuditLogFilters,
  type ActivityLogEntry,
} from '@/lib/queries/audit-logs';

const API_URL = process.env.NEXT_PUBLIC_API_URL
  ? process.env.NEXT_PUBLIC_API_URL.replace(/\/api$/, '')
  : 'http://localhost:8002';

const KNOWN_EVENTS = ['created', 'updated', 'deleted', 'exported'] as const;

/**
 * TCK-292 — la DONNÉE porte la clé, le rendu la résout : la liste des types
 * d'objet transporte le FQCN (valeur d'API) et une clé de libellé résolue sous
 * `admin.audit.subjects.*`. Les noms d'événements (`created`, `updated`, …) sont
 * des valeurs d'API affichées telles quelles — elles ne se traduisent pas.
 */
const KNOWN_SUBJECT_TYPES: { key: string; value: string }[] = [
  { key: 'property', value: 'App\\Models\\Property' },
  { key: 'booking', value: 'App\\Models\\Booking' },
  { key: 'lease', value: 'App\\Models\\Lease' },
  { key: 'invoice', value: 'App\\Models\\Invoice' },
  { key: 'customer', value: 'App\\Models\\Customer' },
  { key: 'user', value: 'App\\Models\\User' },
];

const ANY = '__any__';

function today(): string {
  return new Date().toISOString().split('T')[0];
}

function thirtyDaysAgo(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().split('T')[0];
}

/**
 * L'événement d'audit rendu en TON sémantique, jamais en couleur.
 *
 * Les quatre paires de classes qui vivaient ici (`bg-emerald-100`, `bg-blue-100`, `bg-red-100`,
 * `bg-orange-100`) étaient la palette Tailwind brute, et `bg-emerald-100` était l'une des quatre
 * recettes de « succès » que la console portait — aucune n'était le sage de la charte. La couleur
 * se décide désormais dans `StatusBadge`, une fois.
 */
function eventTone(event: string | null): StatusTone {
  switch (event) {
    case 'created': return 'success';
    case 'updated': return 'info';
    case 'deleted': return 'danger';
    case 'exported': return 'attention';
    default: return 'neutral';
  }
}

/**
 * TCK-292 — la locale ACTIVE, plus `fr-FR` en dur. Les options sont celles de
 * l'ancienne version, à l'identique : le rendu français ne bouge pas.
 */
function formatDate(iso: string, locale: Locale): string {
  return formatDateIntl(iso, locale, {
    // `formatDate` pose `dateStyle: 'medium'` par défaut, et Intl REFUSE
    // `dateStyle` mêlé à des champs explicites — on le neutralise.
    dateStyle: undefined,
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function AuditTrail() {
  const t = useTranslations('admin.audit');
  const eventOptions: ReadonlyArray<{ value: string; label: string }> = [
    { value: ANY, label: t('filters.anyAction') },
    ...KNOWN_EVENTS.map((ev) => ({ value: ev, label: ev })),
  ];
  const subjectTypeOptions: ReadonlyArray<{ value: string; label: string }> = [
    { value: ANY, label: t('filters.anySubject') },
    ...KNOWN_SUBJECT_TYPES.map((st) => ({ value: st.value, label: t(`subjects.${st.key}`) })),
  ];
  const columns = useAuditColumns();
  const { token } = useAuth();
  const toast = useToast();

  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo());
  const [dateTo, setDateTo] = useState(today());
  const [event, setEvent] = useState('');
  const [subjectType, setSubjectType] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [exportLoading, setExportLoading] = useState(false);

  const filters: AuditLogFilters = useMemo(() => ({
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    event: event || undefined,
    subject_type: subjectType || undefined,
    search: search || undefined,
    page,
    per_page: 50,
  }), [dateFrom, dateTo, event, subjectType, search, page]);

  const { data, isLoading, isFetching, isError } = useQuery({
    queryKey: ['audit-logs', filters],
    queryFn: () => fetchAuditLogs(token ?? '', filters),
    enabled: Boolean(token),
  });

  const logs = data?.data ?? [];
  const meta = data?.meta;

  const handleExport = useCallback(async (format: 'csv' | 'xlsx') => {
    if (!token) return;
    setExportLoading(true);

    toast.add({
      title: t('export.pending'),
      type: 'info',
    });

    try {
      const exportFilters: AuditLogFilters = {
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        event: event || undefined,
        subject_type: subjectType || undefined,
        search: search || undefined,
      };

      const url = buildExportUrl(API_URL, format, exportFilters);

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });

      if (res.status === 202) {
        toast.add({
          title: t('export.largeTitle'),
          description: t('export.largeBody'),
          type: 'info',
        });
        return;
      }

      if (!res.ok) {
        toast.add({ title: t('export.error'), type: 'error' });
        return;
      }

      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;

      const disposition = res.headers.get('Content-Disposition') ?? '';
      const match = /filename="?([^";\n]+)"?/.exec(disposition);
      a.download = match?.[1] ?? `audit-trail.${format}`;

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch {
      toast.add({ title: t('export.error'), type: 'error' });
    } finally {
      setExportLoading(false);
    }
  }, [token, dateFrom, dateTo, event, subjectType, search, toast, t]);

  return (
    <div className="space-y-4">
      {/* ─── Sticky filter bar ─────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-background/95 p-4 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">{t('filters.from')}</label>
          <DatePicker
            value={dateFrom}
            max={dateTo || today()}
            onValueChange={(value) => { setDateFrom(value); setPage(1); }}
            buttonClassName="h-9"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">{t('filters.to')}</label>
          <DatePicker
            value={dateTo}
            min={dateFrom}
            max={today()}
            onValueChange={(value) => { setDateTo(value); setPage(1); }}
            buttonClassName="h-9"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">{t('filters.action')}</label>
          <Select
            value={event || ANY}
            onValueChange={(next) => { setEvent(next === ANY ? '' : (next ?? '')); setPage(1); }}
            items={eventOptions}
          >
            <SelectTrigger className="h-9" aria-label={t('filters.actionAria')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {eventOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">{t('filters.subject')}</label>
          <Select
            value={subjectType || ANY}
            onValueChange={(next) => { setSubjectType(next === ANY ? '' : (next ?? '')); setPage(1); }}
            items={subjectTypeOptions}
          >
            <SelectTrigger className="h-9" aria-label={t('filters.subjectAria')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {subjectTypeOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="audit-search">
            {t('filters.search')}
          </label>
          {/*
            TCK-376 — chaque frappe changeait la clé de requête, sur des pages de 50 lignes :
            dix caractères tapés valaient dix requêtes. Le `setPage(1)` reste, et il reste sur
            les CINQ filtres — poser un filtre depuis la page 7 rend une file vide qui dit
            « aucun résultat » alors que la réponse est page 1.
          */}
          <DebouncedSearchInput
            id="audit-search"
            className="w-56"
            value={search}
            onCommit={(next) => { setSearch(next); setPage(1); }}
            placeholder={t('filters.searchPlaceholder')}
            aria-label={t('filters.searchAria')}
            busy={isFetching}
          />
        </div>

        {/*
          TCK-376 — ce menu était un `<div>` piloté par un `useState` d'ouverture. Ni `Escape`,
          ni fermeture au clic extérieur, ni `aria-expanded`, ni navigation au clavier : ouvert,
          il restait ouvert. `ui/dropdown-menu` (base-ui) était déjà employé deux fichiers plus
          loin et apporte les quatre — ils ne se réimplémentent pas à la main.
        */}
        <div className="ml-auto flex items-end">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="default" size="sm" disabled={exportLoading} className="gap-1.5" />}
            >
              {exportLoading
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Download className="h-4 w-4" />}
              {t('export.label')}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              {/*
                TCK-371 — l'anneau explicite est REPRIS des deux `<button>` que ce menu remplace.
                Sa règle exempte les primitives `ui/` (elles portent un `data-slot`), mais ici
                l'exemption ferait PERDRE une mesure : `DropdownMenuItem` pose `outline-none` et
                ne signale le focus que par `data-highlighted:bg-card` — un changement de FOND,
                pas un anneau. Sans ces classes, l'indication retombe sur la règle globale
                `* { outline-ring/50 }` de globals.css, mesurée à 2,12:1 sur `--card` : sous les
                3:1 qu'exige WCAG 1.4.11. Le jeton est donc PLEIN, jamais `/50` — c'est la
                conclusion que la re-mesure de TCK-371 a produite, et elle vaut pour le code neuf.
              */}
              <DropdownMenuItem
                onClick={() => handleExport('csv')}
                className="focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
              >
                <FileText className="h-4 w-4 text-muted-foreground" />
                CSV
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleExport('xlsx')}
                className="focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
              >
                <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                Excel (XLSX)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ─── Table ─────────────────────────────────────────────────────── */}
      <DataState
        loading={isLoading}
        error={isError ? t('error') : null}
        skeletonRows={8}
        skeletonRowClassName="h-11"
      >
        <DataTable
          caption={t('tableCaption')}
          columns={columns}
          rows={logs}
          rowKey={(log) => log.id}
          emptyState={(
            <EmptyState
              icon={<ScrollText className="size-8" aria-hidden="true" />}
              title={t('empty_title')}
              description={t('empty_description')}
            />
          )}
        />
      </DataState>

      {/* ─── Pagination ────────────────────────────────────────────────── */}
      {meta && meta.last_page > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>{t('entries', { count: meta.total, total: String(meta.total) })}</span>
          <Pagination page={page} lastPage={meta.last_page} onChange={setPage} />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Les colonnes du journal.
 *
 * Elles vivent dans un composant plutôt qu'au module : `useLocale()` et `useTranslations()` sont
 * des hooks, et la date de chaque ligne se formate dans la locale active. L'ancienne version
 * appelait `useLocale()` DANS le composant de ligne — un hook par ligne, cinquante par page.
 */
function useAuditColumns(): readonly DataTableColumn<ActivityLogEntry>[] {
  const t = useTranslations('admin.audit');
  const locale = useLocale() as Locale;

  return [
    {
      id: 'date',
      header: t('columns.date'),
      className: 'whitespace-nowrap tabular-nums text-muted-foreground',
      cell: (log) => formatDate(log.created_at, locale),
    },
    {
      id: 'user',
      header: t('columns.user'),
      cell: (log) => (
        <>
          <span className="font-medium text-foreground">
            {log.causer?.name ?? log.causer?.email ?? 'system'}
          </span>
          {log.causer?.email && log.causer.name ? (
            <p className="text-xs text-muted-foreground">{log.causer.email}</p>
          ) : null}
        </>
      ),
    },
    {
      id: 'action',
      header: t('columns.action'),
      cell: (log) => <StatusBadge label={log.event ?? '—'} tone={eventTone(log.event)} />,
    },
    {
      id: 'subject',
      header: t('columns.subject'),
      cell: (log) => <AuditSubjectCell log={log} />,
    },
    {
      id: 'description',
      header: t('columns.description'),
      // La troncature se pose dans la CELLULE, jamais dans `className` : celui-ci va aussi sur
      // le `<th>`, et surtout `DataTable` impose `whitespace-normal` à chaque cellule. `truncate`
      // et `whitespace-*` sont deux familles distinctes pour twMerge — les deux survivent, et
      // `.whitespace-normal` est émise APRÈS `.truncate` dans la feuille Tailwind : l'ellipse
      // exige `white-space: nowrap`, elle ne s'appliquait donc plus du tout.
      cell: (log) => (
        <span className="block max-w-xs truncate text-muted-foreground">
          {log.description ?? '—'}
        </span>
      ),
    },
  ];
}

/**
 * La cellule « Objet » — un lien quand le dépôt a un écran pour cet objet, du texte sinon.
 *
 * ## Pourquoi ce n'est pas un ternaire dans la table de colonnes
 *
 * Parce qu'il y a **trois** cas et non deux, et qu'un ternaire les aurait aplatis :
 *
 * 1. pas de `subject_type` du tout → `—` ;
 * 2. un objet dont le type a un écran → un lien vers cet écran ;
 * 3. un objet dont le type n'en a pas (`Invoice`, `User`, et quatorze autres types audités) →
 *    **le même texte qu'avant**, jamais un lien mort.
 *
 * Le cas 3 est celui que la direction UX du ticket nomme : *le lien ne promet que ce qu'il peut
 * tenir*. C'est aussi le seul que la résolution par convention (`Property` → `/properties`)
 * aurait cassé, en envoyant sur un 404.
 */
function AuditSubjectCell({ log }: { readonly log: ActivityLogEntry }) {
  const court = shortSubjectType(log.subject_type);
  if (!court) return <>—</>;

  const href = auditSubjectHref(log.subject_type, log.subject_id);
  const contenu = (
    <>
      {court}{' '}
      {log.subject_id ? <span className="text-muted-foreground">#{log.subject_id}</span> : null}
    </>
  );

  if (!href) return <span className="text-foreground">{contenu}</span>;

  return (
    <Link
      href={href}
      className="text-foreground underline decoration-dotted underline-offset-4 hover:decoration-solid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      {contenu}
    </Link>
  );
}
