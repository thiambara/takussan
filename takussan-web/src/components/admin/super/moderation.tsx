'use client';

import { useCallback, useMemo, useState } from 'react';
import type { ElementType } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, EyeOff, ShieldCheck, Trash2, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { postModerationDecision } from '@/lib/queries/super-admin';
import type {
  AdminModerationItem,
  ModerationDecision,
  ModerationItemStatus,
  ModerationItemType,
} from '@/types/super-admin';
import type { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

const ALL = '__all__';

type AgencyOption = { id: number; name: string };

const TYPE_OPTIONS: Array<{ value: typeof ALL | ModerationItemType; label: string }> = [
  { value: ALL, label: 'Tous' },
  { value: 'property', label: 'Biens' },
  { value: 'review', label: 'Avis' },
];

const STATUS_OPTIONS: Array<{ value: typeof ALL | ModerationItemStatus; label: string }> = [
  { value: ALL, label: 'Tous statuts' },
  { value: 'pending', label: 'En attente' },
  { value: 'flagged', label: 'Signalés' },
];

const SORT_OPTIONS = [
  { value: '-reported_at', label: 'Plus récents' },
  { value: 'reported_at', label: 'Plus anciens' },
];

export function ModerationFilters({ agencies }: { agencies: AgencyOption[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentType = (searchParams.get('filter[type]') as ModerationItemType | null) ?? ALL;
  const currentStatus = (searchParams.get('filter[status]') as ModerationItemStatus | null) ?? ALL;
  const currentAgency = searchParams.get('filter[agency_id]') ?? ALL;
  const currentSort = searchParams.get('sort') ?? '-reported_at';

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === ALL) params.delete(key);
      else params.set(key, value);
      params.delete('page');
      router.replace(`?${params.toString()}`);
    },
    [router, searchParams],
  );

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-white p-4 ring-1 ring-stone-200 md:flex-row md:items-end md:justify-between">
      <div className="flex flex-wrap gap-2" aria-label="Types de modération">
        {TYPE_OPTIONS.map((option) => {
          const active = currentType === option.value;
          return (
            <Button
              key={option.value}
              type="button"
              variant={active ? 'default' : 'outline'}
              onClick={() => updateParam('filter[type]', option.value)}
              aria-pressed={active}
            >
              {option.label}
            </Button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3">
        <FilterSelect
          label="Statut"
          value={currentStatus}
          options={STATUS_OPTIONS}
          onChange={(value) => updateParam('filter[status]', value)}
        />
        <FilterSelect
          label="Agence"
          value={currentAgency}
          options={[
            { value: ALL, label: 'Toutes agences' },
            ...agencies.map((agency) => ({ value: String(agency.id), label: agency.name })),
          ]}
          onChange={(value) => updateParam('filter[agency_id]', value)}
        />
        <FilterSelect
          label="Ancienneté"
          value={currentSort}
          options={SORT_OPTIONS}
          onChange={(value) => updateParam('sort', value)}
        />
      </div>
    </div>
  );
}

export function ModerationQueueTable({
  items,
  selectedId,
  onSelect,
}: {
  items: AdminModerationItem[];
  selectedId: string | null;
  onSelect: (item: AdminModerationItem) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-stone-200">
      <table className="min-w-full divide-y divide-stone-200 text-sm" data-testid="moderation-queue-table">
        <thead className="bg-stone-50 text-left text-xs font-semibold uppercase text-stone-500">
          <tr>
            <th scope="col" className="px-3 py-2">Sujet</th>
            <th scope="col" className="px-3 py-2">Type</th>
            <th scope="col" className="px-3 py-2">Agence</th>
            <th scope="col" className="px-3 py-2">Rapporteur</th>
            <th scope="col" className="px-3 py-2">Raison</th>
            <th scope="col" className="px-3 py-2">Âge</th>
            <th scope="col" className="px-3 py-2"><span className="sr-only">Action</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {items.map((item) => (
            <tr
              key={item.id}
              className={cn(selectedId === item.id ? 'bg-amber-50' : 'hover:bg-stone-50')}
              data-testid={`moderation-item-${item.id}`}
            >
              <td className="px-3 py-3">
                {item.subject ? (
                  <Link href={item.subject.href} className="font-medium text-stone-950 hover:text-primary">
                    {item.subject.title}
                  </Link>
                ) : (
                  <span className="font-medium text-stone-950">Sujet indisponible</span>
                )}
                <p className="mt-0.5 text-xs text-stone-500">{item.subject?.subtitle ?? item.id}</p>
              </td>
              <td className="px-3 py-3">
                <div className="flex flex-col gap-1">
                  <Badge variant={item.type === 'property' ? 'outline' : 'secondary'}>
                    {item.type === 'property' ? 'Bien' : 'Avis'}
                  </Badge>
                  <span className="text-xs text-stone-500">
                    {item.status === 'flagged' ? 'Signalé' : 'En attente'}
                  </span>
                </div>
              </td>
              <td className="px-3 py-3 text-stone-700">{item.agency?.name ?? 'Sans agence'}</td>
              <td className="px-3 py-3">
                <span className="block text-stone-800">{item.reporter?.name ?? 'Anonyme'}</span>
                {item.reporter?.email ? <span className="text-xs text-stone-500">{item.reporter.email}</span> : null}
              </td>
              <td className="max-w-xs px-3 py-3 text-stone-700">
                <span className="line-clamp-2">{item.reason}</span>
              </td>
              <td className="px-3 py-3 text-stone-600">{formatAge(item.reported_at)}</td>
              <td className="px-3 py-3 text-right">
                <Button type="button" variant="outline" size="sm" onClick={() => onSelect(item)}>
                  Traiter
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ModerationDecisionPanel({
  item,
  onDone,
}: {
  item: AdminModerationItem | null;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: ({ decision }: { decision: ModerationDecision }) => {
      if (!item) throw new Error('No item selected');
      return postModerationDecision(item.id, { decision, reason: reason.trim() });
    },
    onSuccess: () => {
      setReason('');
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'moderation'] });
      onDone();
    },
    onError: (err: ApiError) => setError(err.displayMessage),
  });

  const canSubmit = Boolean(item && reason.trim().length > 0 && !mutation.isPending);

  if (!item) {
    return (
      <aside className="rounded-xl bg-white p-5 text-sm text-stone-600 ring-1 ring-stone-200">
        <ShieldCheck className="mb-3 size-5 text-stone-500" aria-hidden="true" />
        Sélectionnez une ligne pour afficher les décisions disponibles.
      </aside>
    );
  }

  const actions: Array<{ decision: ModerationDecision; label: string; icon: ElementType; variant?: 'outline' | 'destructive' | 'default' }> = [
    { decision: 'approve', label: 'Approuver', icon: CheckCircle2, variant: 'default' },
    { decision: 'hide', label: 'Masquer', icon: EyeOff, variant: 'outline' },
    { decision: 'reject', label: 'Rejeter', icon: XCircle, variant: 'outline' },
    { decision: 'remove', label: 'Supprimer', icon: Trash2, variant: 'destructive' },
  ];

  return (
    <aside className="rounded-xl bg-white p-5 ring-1 ring-stone-200" data-testid="moderation-decision-panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
            Décision
          </p>
          <h2 className="mt-1 font-display text-lg font-semibold text-stone-950">
            {item.subject?.title ?? item.id}
          </h2>
        </div>
        <Badge variant={item.status === 'flagged' ? 'destructive' : 'outline'}>
          {item.status === 'flagged' ? 'Signalé' : 'En attente'}
        </Badge>
      </div>

      <div className="mt-4 rounded-lg bg-stone-50 p-3 text-sm text-stone-700">
        {item.reason}
      </div>

      <label className="mt-4 block space-y-2 text-sm font-medium text-stone-800">
        <span>Raison de décision</span>
        <Textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Motif visible dans l'audit"
          rows={4}
        />
      </label>

      {error ? (
        <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-900 ring-1 ring-red-200" role="alert">
          {error}
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-2">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Button
              key={action.decision}
              type="button"
              variant={action.variant}
              disabled={!canSubmit}
              onClick={() => mutation.mutate({ decision: action.decision })}
            >
              <Icon className="size-4" aria-hidden="true" />
              {action.label}
            </Button>
          );
        })}
      </div>
    </aside>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="min-w-40 text-xs font-medium text-stone-600">
      <span className="mb-1 block">{label}</span>
      <Select value={value} onValueChange={(next) => onChange((next ?? ALL) as string)} items={options}>
        <SelectTrigger className="w-full bg-white">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

export function ModerationStats({ items, total }: { items: AdminModerationItem[]; total: number }) {
  const stats = useMemo(() => {
    const properties = items.filter((item) => item.type === 'property').length;
    const reviews = items.filter((item) => item.type === 'review').length;
    const old = items.filter((item) => daysSince(item.reported_at) > 7).length;
    return { properties, reviews, old };
  }, [items]);

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Stat label="Total page" value={total} />
      <Stat label="Biens" value={stats.properties} />
      <Stat label="Avis" value={stats.reviews} />
      {stats.old > 0 ? (
        <div className="sm:col-span-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950 ring-1 ring-amber-200">
          <AlertTriangle className="mr-2 inline size-4" aria-hidden="true" />
          {stats.old} item{stats.old > 1 ? 's' : ''} de cette page attendent depuis plus de 7 jours.
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-stone-200">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-stone-500">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold text-stone-950">{value}</p>
    </div>
  );
}

export function formatAge(value: string | null): string {
  const days = daysSince(value);
  if (days < 0) return '—';
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return '1 jour';
  return `${days} jours`;
}

function daysSince(value: string | null): number {
  if (!value) return -1;
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return -1;
  return Math.floor((Date.now() - timestamp) / 86_400_000);
}
