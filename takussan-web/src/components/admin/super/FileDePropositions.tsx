'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ListChecks, MapPinned } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { DataState, PageHeader, Pagination } from '@/components/console';
import { EmptyState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { Combobox, type OptionDeListe } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import {
  agirSurProposition,
  ciblesDeFusion,
  listerPropositions,
  type GenreDePropositions,
  type GesteDeModeration,
  type Proposition,
} from '@/lib/queries/super-admin-propositions';

/** La longueur maximale d'un nom, celle des règles de l'API (`GeoRenameRequest`, `TagRenameRequest`). */
const NOM_MAX: Record<GenreDePropositions, number> = { geo: 120, tags: 100 };

type Agir = (id: number, geste: GesteDeModeration) => Promise<boolean>;

/**
 * TCK-633 (AC5) — une file de propositions : quartiers (`geo`) ou équipements (`tags`). Chaque
 * ligne s'approuve, se refuse, se renomme ou se fusionne dans une entrée APPROUVÉE ; la file se
 * recharge après chaque geste — une proposition traitée en sort.
 *
 * ⚠ Aucun `useMemo` / `useCallback` : le React Compiler s'en charge (ADR-0015).
 */
export function FileDePropositions({ genre }: { readonly genre: GenreDePropositions }) {
  const t = useTranslations('superAdmin.propositions');
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [issue, setIssue] = useState<'done' | 'failed' | null>(null);

  const file = useQuery({
    queryKey: ['super-admin', 'propositions', genre, page],
    queryFn: () => listerPropositions(genre, page),
  });

  const geste = useMutation({
    mutationFn: ({ id, g }: { id: number; g: GesteDeModeration }) => agirSurProposition(genre, id, g),
    onSuccess: () => {
      setIssue('done');
      return queryClient.invalidateQueries({ queryKey: ['super-admin', 'propositions', genre] });
    },
    onError: () => setIssue('failed'),
  });

  const agir: Agir = (id, g) => {
    setIssue(null);
    return geste.mutateAsync({ id, g }).then(
      () => true,
      () => false,
    );
  };

  const lignes = file.data?.data ?? [];
  const meta = file.data?.meta;
  const Icone = genre === 'geo' ? MapPinned : ListChecks;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t(genre === 'geo' ? 'geoTitle' : 'tagsTitle')}
        description={t(genre === 'geo' ? 'geoDescription' : 'tagsDescription')}
      />

      {issue ? (
        <p
          role={issue === 'failed' ? 'alert' : 'status'}
          className={issue === 'failed' ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}
        >
          {t(issue)}
        </p>
      ) : null}

      <DataState
        loading={file.isLoading}
        error={file.isError ? t('error') : null}
        onRetry={() => void file.refetch()}
        retryLabel={t('retry')}
        isEmpty={lignes.length === 0}
        skeletonRows={4}
        skeletonRowClassName="h-16"
        emptyState={
          <EmptyState
            icon={<Icone className="size-8" aria-hidden="true" />}
            title={t('emptyTitle')}
            description={t('emptyDescription')}
          />
        }
      >
        <ul className="space-y-3">
          {lignes.map((p) => (
            <LigneDeProposition key={p.id} proposition={p} genre={genre} occupe={geste.isPending} agir={agir} />
          ))}
        </ul>
      </DataState>

      {meta ? <Pagination page={meta.current_page} lastPage={meta.last_page} onChange={setPage} /> : null}
    </div>
  );
}

function LigneDeProposition({
  proposition: p,
  genre,
  occupe,
  agir,
}: {
  readonly proposition: Proposition;
  readonly genre: GenreDePropositions;
  readonly occupe: boolean;
  readonly agir: Agir;
}) {
  const t = useTranslations('superAdmin.propositions');
  const [mode, setMode] = useState<'rename' | 'merge' | null>(null);
  const [nom, setNom] = useState(p.name);
  const [cible, setCible] = useState<OptionDeListe | null>(null);

  const cibles = useQuery({
    queryKey: ['super-admin', 'propositions', genre, 'cibles', p.villeId],
    queryFn: () => ciblesDeFusion(genre, p.villeId),
    enabled: mode === 'merge',
  });

  const fermer = () => {
    setMode(null);
    setNom(p.name);
    setCible(null);
  };
  const executer = async (g: GesteDeModeration) => {
    if (await agir(p.id, g)) fermer();
  };

  const details = [p.lieu, p.auteur ? t('author', { name: p.auteur }) : t('authorUnknown'), t('usage', { count: p.usage })]
    .filter((x): x is string => x !== null);
  const idNom = `proposition-${genre}-${p.id}-nom`;
  const idCible = `proposition-${genre}-${p.id}-cible`;

  return (
    <li className="rounded-xl border border-border bg-card p-4" aria-label={p.name}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-foreground">{p.name}</p>
          <p className="text-sm text-muted-foreground">{details.join(' · ')}</p>
          {p.proches.length > 0 ? (
            <p className="text-sm text-muted-foreground">{t('similar', { names: p.proches.join(', ') })}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={occupe} onClick={() => void executer({ type: 'approve' })}>
            {t('approve')}
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={occupe} aria-expanded={mode === 'rename'} onClick={() => setMode('rename')}>
            {t('rename')}
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={occupe} aria-expanded={mode === 'merge'} onClick={() => setMode('merge')}>
            {t('merge')}
          </Button>
          <Button type="button" size="sm" variant="destructive" disabled={occupe} onClick={() => void executer({ type: 'reject' })}>
            {t('reject')}
          </Button>
        </div>
      </div>

      {mode === 'rename' ? (
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void executer({ type: 'rename', name: nom.trim() });
          }}
        >
          <div className="min-w-56 flex-1 space-y-1">
            <label htmlFor={idNom} className="text-xs font-medium text-muted-foreground">{t('newName')}</label>
            <Input id={idNom} value={nom} maxLength={NOM_MAX[genre]} onChange={(e) => setNom(e.target.value)} />
          </div>
          <Button type="submit" disabled={occupe || nom.trim() === '' || nom.trim() === p.name}>{t('confirm')}</Button>
          <Button type="button" variant="ghost" onClick={fermer}>{t('cancel')}</Button>
        </form>
      ) : null}

      {mode === 'merge' ? (
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (cible) void executer({ type: 'merge', intoId: Number(cible.value) });
          }}
        >
          <div className="min-w-56 flex-1 space-y-1">
            <label htmlFor={idCible} className="text-xs font-medium text-muted-foreground">{t('mergeInto')}</label>
            <Combobox
              id={idCible}
              options={cibles.data ?? []}
              value={cible?.value ?? null}
              onChange={setCible}
              chargement={cibles.isLoading}
              aucunResultat={t('noTarget')}
            />
          </div>
          <Button type="submit" disabled={occupe || cible === null}>{t('confirm')}</Button>
          <Button type="button" variant="ghost" onClick={fermer}>{t('cancel')}</Button>
        </form>
      ) : null}
    </li>
  );
}
