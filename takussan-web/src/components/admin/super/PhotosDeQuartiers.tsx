'use client';

import { useId, useState, type ChangeEvent } from 'react';
import Image from 'next/image';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, ImageOff, MapPinned } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { TuileDeQuartier } from '@/components/home/accueil/TuileDeQuartier';
import { DataState, PageHeader } from '@/components/console';
import { Pagination } from '@/components/console/Pagination';
import { EmptyState } from '@/components/feedback';
import { Button, buttonVariants } from '@/components/ui/button';
import { Combobox, type OptionDeListe } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { useApiQuery } from '@/hooks/useApiQuery';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { ApiError } from '@/lib/api';
import {
  TYPES_DE_PHOTO,
  envoyerPhoto,
  importerDeWikimedia,
  lienUnsplash,
  lirePropositionsWikimedia,
  listerQuartiersApprouves,
  photosDeQuartierKeys,
  refusDuFichier,
  retirerPhoto,
  type QuartierApprouve,
} from '@/lib/queries/super-admin-photos-de-quartier';
import type { GeoCity } from '@/types/geo';

const UNE_HEURE = 60 * 60 * 1000;

/** Les codes d'erreur de TCK-2844 (`geo_cover.*`), traduits ici : `messageErreurApi` ne les connaît pas. */
const CODES_DE_PHOTO: Record<string, string> = {
  'geo_cover.not_approved': 'notApproved',
  'geo_cover.attribution_required': 'attributionRequired',
  'geo_cover.source_not_found': 'sourceNotFound',
  'geo_cover.source_unavailable': 'sourceUnavailable',
};

function codeDe(erreur: unknown): string | null {
  if (!(erreur instanceof ApiError) || !erreur.data || typeof erreur.data !== 'object') return null;
  const code = (erreur.data as { code?: unknown }).code;
  return typeof code === 'string' && code in CODES_DE_PHOTO ? CODES_DE_PHOTO[code] : null;
}

/**
 * TCK-2844 (ADR-0109) — les quartiers APPROUVÉS et leur photo, à côté de la file des propositions.
 *
 * Ville choisie, recherche par nom, les plus fournis en adresses d'abord (ce sont ceux de l'accueil).
 * Par quartier : la photo vue COMME la tuile de l'accueil (le même composant, `TuileDeQuartier`),
 * l'envoi d'un fichier, le retrait, les propositions de Wikimedia Commons (un clic importe) et la
 * recherche Unsplash en nouvel onglet.
 *
 * ⚠ Aucun `useMemo` / `useCallback` : le React Compiler s'en charge (ADR-0015).
 */
export function PhotosDeQuartiers() {
  const t = useTranslations('superAdmin.photosDeQuartier');
  const idVille = useId();
  const idRecherche = useId();
  const [villeId, setVilleId] = useState<number | null>(null);
  const [saisie, setSaisie] = useState('');
  const [recherche, setRecherche] = useState('');
  const [page, setPage] = useState(1);

  const villes = useApiQuery<{ readonly data: GeoCity[] }>(['geo', 'cities', null], '/api/public/geo/cities', {
    staleTime: UNE_HEURE,
  });
  const optionsDeVille: OptionDeListe[] = (villes.data?.data ?? []).map((v) => ({ value: String(v.id), label: v.name }));

  const filtres = { villeId, recherche, page };
  const liste = useQuery({
    queryKey: photosDeQuartierKeys.liste(filtres),
    queryFn: () => listerQuartiersApprouves(filtres),
  });

  const lignes = liste.data?.data ?? [];
  const meta = liste.data?.meta;

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('description')} />

      <form
        role="search"
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setRecherche(saisie.trim());
          setPage(1);
        }}
      >
        <div className="w-full space-y-1 sm:w-56">
          <label htmlFor={idVille} className="text-xs font-medium text-muted-foreground">{t('city')}</label>
          <Combobox
            id={idVille}
            options={optionsDeVille}
            value={villeId === null ? null : String(villeId)}
            onChange={(option) => {
              setVilleId(option ? Number(option.value) : null);
              setPage(1);
            }}
            placeholder={t('allCities')}
            chargement={villes.isLoading}
            aucunResultat={t('noCity')}
          />
        </div>
        <div className="min-w-56 flex-1 space-y-1">
          <label htmlFor={idRecherche} className="text-xs font-medium text-muted-foreground">{t('search')}</label>
          <Input id={idRecherche} type="search" value={saisie} onChange={(e) => setSaisie(e.target.value)} />
        </div>
        <Button type="submit" variant="outline">{t('searchSubmit')}</Button>
      </form>

      <DataState
        loading={liste.isLoading}
        error={liste.isError ? t('error') : null}
        onRetry={() => void liste.refetch()}
        retryLabel={t('retry')}
        isEmpty={lignes.length === 0}
        skeletonRows={4}
        skeletonRowClassName="h-40"
        emptyState={
          <EmptyState
            icon={<MapPinned className="size-8" aria-hidden="true" />}
            title={t('emptyTitle')}
            description={t('emptyDescription')}
          />
        }
      >
        <ul className="space-y-3">
          {lignes.map((q) => (
            <LigneDePhoto key={q.id} quartier={q} />
          ))}
        </ul>
      </DataState>

      {meta ? <Pagination page={meta.current_page} lastPage={meta.last_page} onChange={setPage} /> : null}
    </div>
  );
}

function LigneDePhoto({ quartier: q }: { readonly quartier: QuartierApprouve }) {
  const t = useTranslations('superAdmin.photosDeQuartier');
  const messageErreurApi = useMessageErreurApi();
  const queryClient = useQueryClient();
  const idFichier = useId();
  const [propositionsOuvertes, setPropositionsOuvertes] = useState(false);
  const [retraitDemande, setRetraitDemande] = useState(false);
  const [issue, setIssue] = useState<{ readonly ok: boolean; readonly texte: string } | null>(null);

  const messageDe = (erreur: unknown): string => {
    const cle = codeDe(erreur);
    return cle ? t(`errors.${cle}`) : messageErreurApi(erreur, t('errors.generic'));
  };

  const relire = () => queryClient.invalidateQueries({ queryKey: [...photosDeQuartierKeys.all, 'liste'] });

  const geste = useMutation({
    mutationFn: (g: { type: 'upload'; fichier: File } | { type: 'import'; titre: string } | { type: 'remove' }) => {
      switch (g.type) {
        case 'upload':
          return envoyerPhoto(q.id, g.fichier).then(() => 'uploaded' as const);
        case 'import':
          return importerDeWikimedia(q.id, g.titre).then(() => 'imported' as const);
        case 'remove':
          return retirerPhoto(q.id).then(() => 'removed' as const);
      }
    },
    onMutate: () => setIssue(null),
    onSuccess: (fait) => {
      setIssue({ ok: true, texte: t(`done.${fait}`) });
      setRetraitDemande(false);
      if (fait === 'imported') setPropositionsOuvertes(false);
      return relire();
    },
    onError: (erreur) => setIssue({ ok: false, texte: messageDe(erreur) }),
  });

  const surFichier = (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const fichier = input.files?.[0];
    input.value = '';
    if (!fichier) return;
    const refus = refusDuFichier(fichier);
    if (refus) {
      setIssue({ ok: false, texte: t(refus === 'type' ? 'errors.fileType' : 'errors.fileSize') });
      return;
    }
    geste.mutate({ type: 'upload', fichier });
  };

  const occupe = geste.isPending;

  return (
    <li className="rounded-xl border border-border bg-card p-4" aria-label={q.nom}>
      <div className="flex flex-wrap items-start gap-4">
        <TuileDeQuartier
          key={q.photo?.url ?? ''}
          nom={q.nom}
          compte={t('addresses', { count: q.adresses })}
          photo={q.photo?.url ?? null}
          sizes="132px"
          className="shrink-0 sm:size-[132px] sm:aspect-auto"
        />

        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="font-medium text-foreground">{q.nom}</p>
            <p className="text-sm text-muted-foreground">
              {q.ville} · {q.photo ? t(q.photo.source === 'wikimedia' ? 'source.wikimedia' : 'source.upload') : t('noPhoto')}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              id={idFichier}
              type="file"
              accept={TYPES_DE_PHOTO.join(',')}
              className="sr-only"
              // Le bouton ci-dessous est l'unique arrêt de tabulation ; le champ reste nommé pour les tests et les lecteurs d'écran.
              tabIndex={-1}
              aria-label={t('uploadLabel', { name: q.nom })}
              disabled={occupe}
              onChange={surFichier}
            />
            <Button
              type="button"
              size="sm"
              disabled={occupe}
              onClick={() => document.getElementById(idFichier)?.click()}
            >
              {t('upload')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-expanded={propositionsOuvertes}
              onClick={() => setPropositionsOuvertes((o) => !o)}
            >
              {t('suggestions.toggle')}
            </Button>
            <a
              href={lienUnsplash(q.nom, q.ville)}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ size: 'sm', variant: 'ghost' })}
            >
              {t('unsplash')}
              <ExternalLink aria-hidden="true" className="size-3.5" />
              <span className="sr-only">{t('newTab')}</span>
            </a>
            {q.photo && !retraitDemande ? (
              <Button type="button" size="sm" variant="ghost" className="text-destructive" disabled={occupe} onClick={() => setRetraitDemande(true)}>
                {t('remove')}
              </Button>
            ) : null}
          </div>

          {retraitDemande ? (
            <div role="group" aria-label={t('removeConfirmTitle')} className="flex flex-wrap items-center gap-2 rounded-lg bg-muted p-3">
              <p className="text-sm text-foreground">{t('removeConfirm', { name: q.nom })}</p>
              <Button type="button" size="sm" variant="destructive" disabled={occupe} onClick={() => geste.mutate({ type: 'remove' })}>
                {t('removeConfirmAction')}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setRetraitDemande(false)}>
                {t('cancel')}
              </Button>
            </div>
          ) : null}

          {issue ? (
            <p role={issue.ok ? 'status' : 'alert'} className={issue.ok ? 'text-sm text-muted-foreground' : 'text-sm text-destructive'}>
              {issue.texte}
            </p>
          ) : null}

          {propositionsOuvertes ? (
            <PropositionsWikimedia
              id={q.id}
              occupe={occupe}
              importer={(titre) => geste.mutate({ type: 'import', titre })}
            />
          ) : null}
        </div>
      </div>
    </li>
  );
}

function PropositionsWikimedia({
  id,
  occupe,
  importer,
}: {
  readonly id: number;
  readonly occupe: boolean;
  readonly importer: (titre: string) => void;
}) {
  const t = useTranslations('superAdmin.photosDeQuartier.suggestions');
  const propositions = useQuery({
    queryKey: photosDeQuartierKeys.propositions(id),
    queryFn: () => lirePropositionsWikimedia(id),
  });

  if (propositions.isLoading) return <p className="text-sm text-muted-foreground" role="status">{t('loading')}</p>;
  if (propositions.isError) return <p className="text-sm text-destructive" role="alert">{t('error')}</p>;

  const donnees = propositions.data;
  if (!donnees || donnees.indisponible || donnees.data.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <ImageOff aria-hidden="true" className="size-4" />
        {donnees?.indisponible ? t('unavailable') : t('empty')}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{t('hint')}</p>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {donnees.data.map((p) => (
          <li key={p.title}>
            <button
              type="button"
              disabled={occupe}
              aria-label={t('import', { title: p.title.replace(/^File:/, '') })}
              onClick={() => importer(p.title)}
              className="relative block aspect-square w-full overflow-hidden rounded-lg bg-muted ring-1 ring-border transition-[box-shadow,opacity] hover:ring-2 hover:ring-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              {/* Vignette déjà réduite par Commons, hors du seau public : rendue telle quelle. */}
              <Image src={p.thumb_url} alt="" fill unoptimized sizes="160px" className="object-cover object-center" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
