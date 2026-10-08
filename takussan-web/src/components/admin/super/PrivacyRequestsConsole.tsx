'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Download, FileCheck2, Inbox, Loader2, Plus } from 'lucide-react';

import {
  DataState,
  DataTable,
  FilterBar,
  Pagination,
  StatusBadge,
  type DataTableColumn,
  type StatusTone,
} from '@/components/console';
import { EmptyState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { useGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import type { ApiError } from '@/lib/api';
import { avecGardeDoubleFacteur } from '@/lib/double-facteur';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import {
  createPrivacyRequest,
  exportPrivacyRequests,
  fetchPrivacyRequests,
  privacyRequestKeys,
  updatePrivacyRequest,
  type PrivacyRequestFilters,
} from '@/lib/queries/privacy-requests';
import type { PaginatedResponse } from '@/types/api';
import {
  PRIVACY_REQUEST_CHANNELS,
  PRIVACY_REQUEST_STATUSES,
  PRIVACY_REQUEST_TYPES,
  type PrivacyRequest,
  type PrivacyRequestChannel,
  type PrivacyRequestStatus,
  type PrivacyRequestType,
} from '@/types/privacy-request';

/**
 * TCK-601 (G) — « Demandes de droits » : le registre des demandes d'accès, de rectification,
 * d'opposition, d'effacement et de portabilité, suivi jusqu'à son échéance.
 *
 * Direction UX du ticket : une vue de suivi SOBRE, lue d'abord par échéance (`sort=due_at`, la
 * plus proche en tête) ; une demande en retard se voit immédiatement — dans sa ligne, et par le
 * compte en tête de page, qui vient de l'API (`filter[overdue]=1`) et non de la page affichée ;
 * l'export du registre est un geste secondaire (`outline`).
 */

const ANY = '__any__';
const PER_PAGE = 25;
/** Les formats que l'API accepte pour la preuve (mêmes `mimes` que les pièces, ADR-0044). */
const PROOF_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.heic,application/pdf,image/jpeg,image/png,image/webp,image/heic';

const STATUS_TONE: Record<PrivacyRequestStatus, StatusTone> = {
  received: 'info',
  in_progress: 'attention',
  answered: 'success',
  rejected: 'neutral',
  withdrawn: 'neutral',
};

function aujourdhui(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const jj = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${jj}`;
}

/** La taille d'un fichier dans la locale active (`Intl`, unité courte) — jamais d'unité écrite en dur. */
function tailleLisible(octets: number, fmt: ReturnType<typeof useFormatteurs>): string {
  if (octets < 1024 * 1024) {
    return fmt.nombre(Math.max(1, Math.round(octets / 1024)), {
      style: 'unit', unit: 'kilobyte', unitDisplay: 'short', maximumFractionDigits: 0,
    });
  }
  return fmt.nombre(octets / (1024 * 1024), {
    style: 'unit', unit: 'megabyte', unitDisplay: 'short', maximumFractionDigits: 1,
  });
}

export function PrivacyRequestsConsole() {
  const t = useTranslations('superAdmin.privacyRequests');
  const tFiltres = useTranslations('console.filterBar');
  const fmt = useFormatteurs();
  const messageErreur = useMessageErreurApi();
  const toast = useToast();
  const garde = useGardeDoubleFacteur();

  const [status, setStatus] = useState<PrivacyRequestStatus | ''>('');
  const [type, setType] = useState<PrivacyRequestType | ''>('');
  const [overdue, setOverdue] = useState(false);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<PrivacyRequest | null>(null);

  const filters: PrivacyRequestFilters = {
    status: status || undefined,
    type: type || undefined,
    overdue: overdue || undefined,
    page,
    perPage: PER_PAGE,
  };

  const query = useQuery<PaginatedResponse<PrivacyRequest>, ApiError>({
    queryKey: privacyRequestKeys.list(filters),
    queryFn: () => fetchPrivacyRequests(filters),
    staleTime: 10_000,
  });

  // Le compte des demandes en retard, TOUS filtres confondus : il ne dépend pas de la page
  // affichée. `per_page=1` — seul `meta.total` est lu.
  const retards = useQuery<PaginatedResponse<PrivacyRequest>, ApiError>({
    queryKey: privacyRequestKeys.list({ overdue: true, perPage: 1 }),
    queryFn: () => fetchPrivacyRequests({ overdue: true, perPage: 1 }),
    staleTime: 10_000,
  });
  const nombreEnRetard = retards.data?.meta.total ?? 0;

  const exportMutation = useMutation<{ blob: Blob; fileName: string }, ApiError>({
    mutationFn: () => avecGardeDoubleFacteur(() => exportPrivacyRequests(), garde),
    onSuccess: ({ blob, fileName }) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    onError: (err) => {
      toast.add({ title: t('export.error'), description: messageErreur(err), type: 'error' });
    },
  });

  const filtresPoses = status !== '' || type !== '' || overdue;
  const reinitialiser = () => {
    setStatus('');
    setType('');
    setOverdue(false);
    setPage(1);
  };

  const statusOptions = [
    { value: ANY, label: t('filters.anyStatus') },
    ...PRIVACY_REQUEST_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) })),
  ];
  const typeOptions = [
    { value: ANY, label: t('filters.anyType') },
    ...PRIVACY_REQUEST_TYPES.map((v) => ({ value: v, label: t(`type.${v}`) })),
  ];

  const columns: DataTableColumn<PrivacyRequest>[] = [
    {
      id: 'due',
      header: t('columns.due'),
      className: 'whitespace-nowrap tabular-nums',
      cell: (r) => (
        <div className="flex flex-col items-start gap-1">
          <span className={r.is_overdue ? 'font-medium text-destructive' : 'text-foreground'}>
            {fmt.date(r.due_at)}
          </span>
          {r.is_overdue ? <StatusBadge tone="danger" label={t('overdue')} /> : null}
        </div>
      ),
    },
    {
      id: 'type',
      header: t('columns.type'),
      className: 'font-medium text-foreground',
      cell: (r) => t(`type.${r.type}`),
    },
    {
      id: 'requester',
      header: t('columns.requester'),
      cell: (r) => (
        <>
          <span className="text-foreground">{r.requester_name}</span>
          {r.requester_contact ? (
            <p className="text-xs break-all text-muted-foreground">{r.requester_contact}</p>
          ) : null}
        </>
      ),
    },
    {
      id: 'received',
      header: t('columns.received'),
      className: 'whitespace-nowrap tabular-nums text-muted-foreground',
      cell: (r) => (
        <>
          {fmt.date(r.received_at)}
          <p className="text-xs">{t(`channel.${r.channel}`)}</p>
        </>
      ),
    },
    {
      id: 'status',
      header: t('columns.status'),
      cell: (r) => (
        <StatusBadge tone={STATUS_TONE[r.status]} label={t(`status.${r.status}`)} className="whitespace-nowrap" />
      ),
    },
    {
      id: 'proof',
      header: t('columns.proof'),
      className: 'text-muted-foreground',
      cell: (r) => (r.proof ? (
        <span className="inline-flex items-center gap-1.5 text-foreground">
          <FileCheck2 className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="break-all">{r.proof.file_name}</span>
          <span className="text-xs whitespace-nowrap text-muted-foreground">{tailleLisible(r.proof.size, fmt)}</span>
        </span>
      ) : '—'),
    },
    {
      id: 'actions',
      header: t('columns.actions'),
      headerSrOnly: true,
      align: 'end',
      cell: (r) => (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setEditing(r)}
          aria-label={t('update.openAria', { name: r.requester_name })}
        >
          {t('update.open')}
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" onClick={() => setCreating(true)}>
          <Plus className="size-4" aria-hidden="true" />
          {t('create.open')}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={exportMutation.isPending}
          onClick={() => exportMutation.mutate()}
        >
          {exportMutation.isPending
            ? <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            : <Download className="size-4" aria-hidden="true" />}
          {t('export.label')}
        </Button>
      </div>

      {nombreEnRetard > 0 ? (
        <div
          role="status"
          data-testid="privacy-overdue-summary"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm"
        >
          <span className="inline-flex items-center gap-2 font-medium text-destructive">
            <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
            {t('overdueSummary', { count: nombreEnRetard })}
          </span>
          {!overdue ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => { setOverdue(true); setPage(1); }}>
              {t('filters.showOverdue')}
            </Button>
          ) : null}
        </div>
      ) : null}

      <FilterBar
        controlsClassName="sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-3"
        resultCount={query.data ? tFiltres('results', { count: query.data.meta.total }) : undefined}
        onReset={reinitialiser}
        resetLabel={tFiltres('reset')}
        resetDisabled={!filtresPoses}
      >
        <Select
          value={status || ANY}
          onValueChange={(next) => {
            setStatus(!next || next === ANY ? '' : (next as PrivacyRequestStatus));
            setPage(1);
          }}
          items={statusOptions}
        >
          <SelectTrigger className="h-10 w-full" aria-label={t('filters.statusAria')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select
          value={type || ANY}
          onValueChange={(next) => {
            setType(!next || next === ANY ? '' : (next as PrivacyRequestType));
            setPage(1);
          }}
          items={typeOptions}
        >
          <SelectTrigger className="h-10 w-full" aria-label={t('filters.typeAria')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {typeOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant={overdue ? 'secondary' : 'outline'}
          className="h-10 justify-start"
          aria-pressed={overdue}
          onClick={() => { setOverdue((v) => !v); setPage(1); }}
        >
          <AlertTriangle className="size-4" aria-hidden="true" />
          {t('filters.overdueOnly')}
        </Button>
      </FilterBar>

      <DataState
        loading={query.isLoading}
        error={query.isError ? messageErreur(query.error, t('error')) : null}
        isEmpty={!query.data || query.data.data.length === 0}
        skeletonRows={6}
        skeletonRowClassName="h-12"
        emptyState={(
          <EmptyState
            icon={<Inbox className="size-8" aria-hidden="true" />}
            title={filtresPoses ? t('emptyFiltered_title') : t('empty_title')}
            description={filtresPoses ? t('emptyFiltered_description') : t('empty_description')}
          />
        )}
      >
        <DataTable
          caption={t('tableCaption')}
          columns={columns}
          rows={query.data?.data ?? []}
          rowKey={(r) => r.id}
          rowProps={(r) => ({ 'data-testid': `privacy-request-${r.id}` })}
        />
      </DataState>

      {query.data ? (
        <Pagination page={query.data.meta.current_page} lastPage={query.data.meta.last_page} onChange={setPage} />
      ) : null}

      <Dialog open={creating} onOpenChange={setCreating}>
        {creating ? <CreatePrivacyRequestForm onDone={() => setCreating(false)} /> : null}
      </Dialog>
      <Dialog open={editing !== null} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        {editing ? (
          <UpdatePrivacyRequestForm key={editing.id} request={editing} onDone={() => setEditing(null)} />
        ) : null}
      </Dialog>
    </div>
  );
}

/**
 * Un champ de formulaire : son libellé, puis l'aide et l'erreur HORS du `<label>` — sinon elles
 * entrent dans le nom accessible du champ, que le lecteur d'écran relit à chaque focus. Elles lui
 * sont reliées par `aria-describedby` ({@link decritPar}).
 */
function Champ({
  id,
  label,
  hint,
  error,
  children,
}: {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  readonly error?: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      {children}
      {hint ? <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p> : null}
      {error ? <p id={`${id}-error`} className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function decritPar(id: string, avecAide: boolean, erreur: string | undefined): string | undefined {
  const ids = [avecAide ? `${id}-hint` : null, erreur ? `${id}-error` : null].filter(Boolean);
  return ids.length > 0 ? ids.join(' ') : undefined;
}

/** Le message de validation d'un champ, depuis un 422 de Laravel. */
function erreurDe(err: ApiError | null, champ: string): string | undefined {
  return err?.validationErrors?.[champ]?.[0];
}

function CreatePrivacyRequestForm({ onDone }: { readonly onDone: () => void }) {
  const t = useTranslations('superAdmin.privacyRequests');
  const tCommon = useTranslations('common');
  const messageErreur = useMessageErreurApi();
  const queryClient = useQueryClient();
  const toast = useToast();
  const garde = useGardeDoubleFacteur();

  const [type, setType] = useState<PrivacyRequestType>('access');
  const [channel, setChannel] = useState<PrivacyRequestChannel>('email');
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [userId, setUserId] = useState('');
  const [receivedAt, setReceivedAt] = useState(aujourdhui());

  const mutation = useMutation<PrivacyRequest, ApiError>({
    mutationFn: () => avecGardeDoubleFacteur(() => createPrivacyRequest({
      type,
      channel,
      requester_name: name.trim(),
      ...(contact.trim() ? { requester_contact: contact.trim() } : {}),
      ...(userId ? { user_id: Number(userId) } : {}),
      ...(receivedAt ? { received_at: receivedAt } : {}),
    }), garde),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: privacyRequestKeys.all });
      toast.add({ title: t('create.success'), type: 'success' });
      onDone();
    },
  });
  const erreur = mutation.error;

  const typeOptions = PRIVACY_REQUEST_TYPES.map((v) => ({ value: v, label: t(`type.${v}`) }));
  const channelOptions = PRIVACY_REQUEST_CHANNELS.map((v) => ({ value: v, label: t(`channel.${v}`) }));

  function soumettre(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    mutation.mutate();
  }

  return (
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
      <form onSubmit={soumettre} className="grid gap-4" noValidate>
        <DialogHeader>
          <DialogTitle>{t('create.title')}</DialogTitle>
          <DialogDescription className="text-pretty">{t('create.description')}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1">
            <span id="pr-type-label" className="text-sm font-medium">{t('fields.type')}</span>
            <Select value={type} onValueChange={(v) => v && setType(v as PrivacyRequestType)} items={typeOptions}>
              <SelectTrigger className="h-10 w-full" aria-labelledby="pr-type-label">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {typeOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {erreurDe(erreur, 'type') ? <p className="text-xs text-destructive">{erreurDe(erreur, 'type')}</p> : null}
          </div>
          <div className="grid gap-1">
            <span id="pr-channel-label" className="text-sm font-medium">{t('fields.channel')}</span>
            <Select value={channel} onValueChange={(v) => v && setChannel(v as PrivacyRequestChannel)} items={channelOptions}>
              <SelectTrigger className="h-10 w-full" aria-labelledby="pr-channel-label">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {channelOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {erreurDe(erreur, 'channel') ? <p className="text-xs text-destructive">{erreurDe(erreur, 'channel')}</p> : null}
          </div>
        </div>

        <Champ id="pr-name" label={t('fields.requesterName')} error={erreurDe(erreur, 'requester_name')}>
          <Input
            id="pr-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={255}
            aria-invalid={!!erreurDe(erreur, 'requester_name')}
            aria-describedby={decritPar('pr-name', false, erreurDe(erreur, 'requester_name'))}
          />
        </Champ>

        <Champ
          id="pr-contact"
          label={t('fields.requesterContact')}
          hint={t('fields.requesterContactHint')}
          error={erreurDe(erreur, 'requester_contact')}
        >
          <Input
            id="pr-contact"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            maxLength={255}
            aria-invalid={!!erreurDe(erreur, 'requester_contact')}
            aria-describedby={decritPar('pr-contact', true, erreurDe(erreur, 'requester_contact'))}
          />
        </Champ>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1">
            <span className="text-sm font-medium">{t('fields.receivedAt')}</span>
            <DatePicker
              value={receivedAt}
              max={aujourdhui()}
              onValueChange={setReceivedAt}
              aria-label={t('fields.receivedAt')}
              buttonClassName="h-10 w-full"
            />
            {erreurDe(erreur, 'received_at') ? (
              <p className="text-xs text-destructive">{erreurDe(erreur, 'received_at')}</p>
            ) : null}
          </div>
          <Champ id="pr-user" label={t('fields.userId')} error={erreurDe(erreur, 'user_id')}>
            <Input
              id="pr-user"
              type="number"
              inputMode="numeric"
              min={1}
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              aria-invalid={!!erreurDe(erreur, 'user_id')}
              aria-describedby={decritPar('pr-user', false, erreurDe(erreur, 'user_id'))}
            />
          </Champ>
        </div>

        {erreur && !erreur.validationErrors ? (
          <p role="alert" className="text-sm text-destructive">{messageErreur(erreur, t('create.error'))}</p>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone}>{tCommon('actions.cancel')}</Button>
          <Button type="submit" disabled={mutation.isPending || name.trim() === ''}>
            {mutation.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {t('create.submit')}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function UpdatePrivacyRequestForm({
  request,
  onDone,
}: {
  readonly request: PrivacyRequest;
  readonly onDone: () => void;
}) {
  const t = useTranslations('superAdmin.privacyRequests');
  const tCommon = useTranslations('common');
  const messageErreur = useMessageErreurApi();
  const queryClient = useQueryClient();
  const toast = useToast();
  const garde = useGardeDoubleFacteur();

  const [status, setStatus] = useState<PrivacyRequestStatus>(request.status);
  const [summary, setSummary] = useState(request.response_summary ?? '');
  const [proof, setProof] = useState<File | null>(null);

  const mutation = useMutation<PrivacyRequest, ApiError>({
    mutationFn: () => avecGardeDoubleFacteur(() => updatePrivacyRequest(request.id, {
      ...(status !== request.status ? { status } : {}),
      ...(summary !== (request.response_summary ?? '') ? { response_summary: summary } : {}),
      proof,
    }), garde),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: privacyRequestKeys.all });
      toast.add({ title: t('update.success'), type: 'success' });
      onDone();
    },
  });
  const erreur = mutation.error;
  const inchange = status === request.status && summary === (request.response_summary ?? '') && proof === null;

  const statusOptions = PRIVACY_REQUEST_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) }));

  function soumettre(e: FormEvent) {
    e.preventDefault();
    if (inchange) return;
    mutation.mutate();
  }

  return (
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
      <form onSubmit={soumettre} className="grid gap-4" noValidate>
        <DialogHeader>
          <DialogTitle>{t('update.title', { name: request.requester_name })}</DialogTitle>
          <DialogDescription className="text-pretty">
            {t('update.description', { type: t(`type.${request.type}`) })}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-1">
          <span id="pr-status-label" className="text-sm font-medium">{t('fields.status')}</span>
          <Select value={status} onValueChange={(v) => v && setStatus(v as PrivacyRequestStatus)} items={statusOptions}>
            <SelectTrigger className="h-10 w-full" aria-labelledby="pr-status-label">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {erreurDe(erreur, 'status') ? <p className="text-xs text-destructive">{erreurDe(erreur, 'status')}</p> : null}
        </div>

        <Champ id="pr-summary" label={t('fields.responseSummary')} error={erreurDe(erreur, 'response_summary')}>
          <Textarea
            id="pr-summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={4}
            aria-invalid={!!erreurDe(erreur, 'response_summary')}
            aria-describedby={decritPar('pr-summary', false, erreurDe(erreur, 'response_summary'))}
          />
        </Champ>

        <Champ
          id="pr-proof"
          label={t('fields.proof')}
          hint={request.proof ? t('fields.proofReplace', { name: request.proof.file_name }) : t('fields.proofHint')}
          error={erreurDe(erreur, 'proof')}
        >
          <Input
            id="pr-proof"
            type="file"
            accept={PROOF_ACCEPT}
            onChange={(e) => setProof(e.target.files?.[0] ?? null)}
            aria-invalid={!!erreurDe(erreur, 'proof')}
            aria-describedby={decritPar('pr-proof', true, erreurDe(erreur, 'proof'))}
          />
        </Champ>

        {erreur && !erreur.validationErrors ? (
          <p role="alert" className="text-sm text-destructive">{messageErreur(erreur, t('update.error'))}</p>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone}>{tCommon('actions.cancel')}</Button>
          <Button type="submit" disabled={mutation.isPending || inchange}>
            {mutation.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {tCommon('actions.save')}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
