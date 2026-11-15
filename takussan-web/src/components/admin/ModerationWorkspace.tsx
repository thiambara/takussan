'use client';

import { useEffect, useEffectEvent, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ShieldAlert, SlidersHorizontal, TriangleAlert } from 'lucide-react';

import { EmptyState, ErrorState } from '@/components/feedback';
import { PageHeader } from '@/components/console';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { BarreDAction } from '@/components/ui/barre-d-action';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { PuceDeFiltre, RangeeDePuces } from '@/components/ui/puce-de-filtre';
import { Tabs, TabsCount, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DeclarerEnTete } from '@/components/layout/en-tete-de-la-coque';
import { REQUETE_DE_LA_BARRE } from '@/components/layout/plein-ecran';
import { PagePleineLargeur } from '@/components/layout/PagePleineLargeur';
import { useAuth } from '@/context/AuthContext';
import { useGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { avecGardeDoubleFacteur } from '@/lib/double-facteur';
import { ApiError } from '@/lib/api';
import { propertyModerationCountQueryOptions } from '@/lib/queries/agency-queues';
import {
  MAX_AVIS_PAR_LOT,
  fetchModerationQueue,
  moderateReviewBatch,
  type ModerationQueueResponse,
  type ModerationReview,
  type ReviewRiskLevel,
} from '@/lib/queries/reviews-moderation';
import { useMatchesMedia } from '@/hooks/useMatchesMedia';
import { useEtatUrl } from '@/hooks/useEtatUrl';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { cn } from '@/lib/utils';

import { ModerationDetail } from './ModerationDetail';
import { CarteDAvis } from './moderation/CarteDAvis';
import { P_STATUT, statutDeLaFile } from './statut-de-la-file';

/**
 * TCK-292 — la DONNÉE porte la clé : les options transportent la valeur d'API (le statut, ou le FQCN
 * du sujet) et une clé de libellé ; le rendu la résout.
 */
const STATUS_KEYS = ['all', 'pending', 'flagged', 'approved', 'rejected'] as const;

const SUBJECT_TYPE_KEYS: ReadonlyArray<{ key: string; value: string }> = [
  { key: 'all', value: 'all' },
  { key: 'property', value: 'App\\Models\\Property' },
  { key: 'agency', value: 'App\\Models\\Agency' },
  { key: 'user', value: 'App\\Models\\User' },
];

/** TCK-376 — les clés d'URL portent le NOM DU FILTRE D'API (cf. `statut-de-la-file.ts`). */
const P_SIGNALES = 'filter[reported]';
const P_SUJET = 'filter[subject_type]';
/** TCK-2673 — la pastille du téléphone : `filter[risk]` de l'API (`high` par défaut). */
const P_RISQUE = 'filter[risk]';
/** TCK-2673 — « Tous les statuts » s'écrit, puisque l'URL nue vaut « En attente » ; jamais envoyé. */
const TOUS = 'all';

const PAR_PAGE = 20;
const REQUETE_DEUX_COLONNES = '(width >= 80rem)';
const PAGE_DES_BIENS = '/app/agency/moderation/properties';

interface ModerationWorkspaceProps {
  /**
   * Super-admin : toute la plateforme. Sinon l'admin d'une agence `standard`, que l'API cloisonne
   * à son agence — et qui ne tranche pas les avis portés sur l'agence elle-même (TCK-597).
   */
  readonly platform?: boolean;
  /** Le nom qui signe la réponse publique (`null` : illisible). */
  readonly agencyName?: string | null;
}

/** Un avis se publie par lot s'il est en attente et que la policy le laisse trancher (sinon : 422 pour tout le lot). */
const publiableParLot = (avis: ModerationReview) => avis.status === 'pending' && avis.can_moderate === true;

/**
 * TCK-067 → TCK-2673 — la file des avis, triée par RISQUE (maquette `app-moderation`, approche B).
 *
 *  · Téléphone : pastilles « À risque · Sans risque · Biens », bouton « Filtres » (feuille du bas) ;
 *    sur « Sans risque », des cases, « Tout cocher » et la barre collante « N sélectionnés · Publier ».
 *    Toucher un avis ouvre son détail PLEIN ÉCRAN (une entrée d'historique : le retour rend la file).
 *  · Bureau : onglets « Avis · Biens à valider », filtres en ligne ; dès `xl`, la file (360 px) et
 *    le détail côte à côte ; entre `md` et `xl`, le détail remplace la file (aucune piste fixe à côté
 *    du contenu sous 1280, ADR-0106 § 4).
 *
 * Deux lectures, une par niveau de risque (`filter[risk]`), de 20 avis chacune : la file sans risque
 * se coche sans attendre que les avis à risque soient tous lus. `meta.risk_counts` est calculé avant
 * le filtre de risque : chaque lecture porte les deux comptes.
 */
export function ModerationWorkspace({ platform = false, agencyName = null }: ModerationWorkspaceProps = {}) {
  const t = useTranslations('admin.moderation.workspace');
  const tFile = useTranslations('admin.moderation.file');
  const tPage = useTranslations('admin.pages.moderation');
  const tCommon = useTranslations('common');
  const messageErreur = useMessageErreurApi();
  const { token } = useAuth();
  const garde = useGardeDoubleFacteur();
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const telephone = useMatchesMedia(REQUETE_DE_LA_BARRE);
  const deuxColonnes = useMatchesMedia(REQUETE_DEUX_COLONNES);

  // TCK-376 — l'état vit dans l'URL. TCK-2673 — l'URL nue vaut « En attente » : la file du jour.
  const url = useEtatUrl();
  const statutLu = statutDeLaFile(url.lire) as string;
  const status = statutLu === TOUS ? '' : statutLu === '' ? 'pending' : statutLu;
  const reported = url.lireBooleen(P_SIGNALES);
  const subjectType = url.lire(P_SUJET);
  const risqueDuTelephone: ReviewRiskLevel = url.lire(P_RISQUE) === 'low' ? 'low' : 'high';
  const selectedId = Number.parseInt(url.lire('selected'), 10) || null;

  const [coches, setCoches] = useState<ReadonlySet<number>>(new Set());
  // TCK-2673 d1 — ce que « Tout cocher » a réellement coché : la lecture ne rend que les avis
  // publiables, ce que le total de la file ne dit pas (un avis sur l'agence elle-même y figure,
  // `can_moderate` faux). `null` tant qu'aucune lecture n'a abouti sous ces filtres. Il vaut pour la
  // file telle qu'elle était lue (`lecture` : son `dataUpdatedAt`) : relue sans changement de filtre
  // (un avis tranché, une invalidation), c'est de nouveau le total qui compte (contre-vérification de
  // fd3ae77b4). « Tout décocher » le garde : sur la même file, c'est le compte le plus juste.
  const [nbDeToutCocher, setNbDeToutCocher] = useState<{ readonly n: number; readonly lecture: number } | null>(null);
  const [annonce, setAnnonce] = useState<string | null>(null);
  const [erreurDuLot, setErreurDuLot] = useState<string | null>(null);
  const [filtresOuverts, setFiltresOuverts] = useState(false);

  const filtres = { status, reported, subjectType };
  const lecture = (risk: ReviewRiskLevel) => ({
    queryKey: ['reviews-moderation', 'queue', { ...filtres, risk }],
    queryFn: ({ pageParam }: { pageParam: number }) =>
      fetchModerationQueue(token ?? '', {
        status: (status || undefined) as never,
        reported: reported || undefined,
        subjectType: subjectType || undefined,
        risk,
        page: pageParam,
        perPage: PAR_PAGE,
      }),
    initialPageParam: 1,
    getNextPageParam: (derniere: ModerationQueueResponse) =>
      derniere.meta.current_page < derniere.meta.last_page ? derniere.meta.current_page + 1 : undefined,
    enabled: Boolean(token),
  });
  const aRisque = useInfiniteQuery(lecture('high'));
  const sansRisque = useInfiniteQuery(lecture('low'));
  const biens = useQuery(propertyModerationCountQueryOptions(token, true));

  const avisARisque = aRisque.data?.pages.flatMap((p) => p.data) ?? [];
  const avisSansRisque = sansRisque.data?.pages.flatMap((p) => p.data) ?? [];
  const meta = aRisque.data?.pages[0]?.meta ?? sansRisque.data?.pages[0]?.meta;
  const comptes = meta?.risk_counts ?? { high: aRisque.data?.pages[0]?.meta.total ?? 0, low: sansRisque.data?.pages[0]?.meta.total ?? 0 };
  const totalSansRisque = sansRisque.data?.pages[0]?.meta.total ?? comptes.low;
  const totalARisque = aRisque.data?.pages[0]?.meta.total ?? comptes.high;
  // Le lot ne vaut que pour la file EN ATTENTE : c'est la seule que `moderate-batch` accepte.
  const lotPossible = status === 'pending';
  const toutes = [...avisARisque, ...avisSansRisque];
  const selected = toutes.find((r) => r.id === selectedId) ?? (deuxColonnes ? (toutes[0] ?? null) : null);

  // « Tout cocher » coche aussi les avis des pages non lues : la sélection est l'ensemble coché. Un avis
  // tranché entre-temps fait refuser le lot (422) : la file se relit et le message le dit.
  const selection = [...coches];

  const toutCocher = useMutation({
    mutationFn: async () => {
      const r = await fetchModerationQueue(token ?? '', {
        status: 'pending',
        reported: reported || undefined,
        subjectType: subjectType || undefined,
        risk: 'low',
        page: 1,
        perPage: MAX_AVIS_PAR_LOT,
      });
      return r.data.filter(publiableParLot).map((a) => a.id);
    },
    onSuccess: (ids) => {
      setErreurDuLot(null);
      setNbDeToutCocher({ n: ids.length, lecture: sansRisque.dataUpdatedAt });
      setCoches(new Set(ids));
    },
    onError: () => setErreurDuLot(tFile('toutCocherEchec')),
  });

  const lot = useMutation({
    mutationFn: (ids: readonly number[]) => avecGardeDoubleFacteur(() => moderateReviewBatch(ids, token ?? ''), garde),
    onSuccess: (reponse) => {
      setCoches(new Set());
      setNbDeToutCocher(null);
      setErreurDuLot(null);
      setAnnonce(tFile('lotPublie', { n: reponse.data.count }));
      void queryClient.invalidateQueries({ queryKey: ['reviews-moderation'] });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 422) {
        setErreurDuLot(tFile('lotRefuse'));
        setNbDeToutCocher(null);
        void queryClient.invalidateQueries({ queryKey: ['reviews-moderation'] });
        return;
      }
      setErreurDuLot(messageErreur(err, tFile('lotEchec')));
    },
  });

  // Les cases ne survivent pas à un changement de filtre : la liste n'est plus la même.
  const cleFiltres = JSON.stringify(filtres);
  const [cleCochee, setCleCochee] = useState(cleFiltres);
  if (cleCochee !== cleFiltres) {
    setCleCochee(cleFiltres);
    setCoches(new Set());
    setNbDeToutCocher(null);
  }

  const ouvrir = (avis: ModerationReview) => {
    setAnnonce(null);
    if (telephone || !deuxColonnes) {
      // Plein écran : une entrée d'historique, pour que « ← » et le retour du système rendent la file.
      const params = new URLSearchParams(searchParams.toString());
      params.set('selected', String(avis.id));
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
      return;
    }
    url.selectionner(avis.id);
  };
  const hrefDeLaFile = (() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('selected');
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  })();

  const onModerated = (message?: string) => {
    setAnnonce(message ?? null);
    void queryClient.invalidateQueries({ queryKey: ['reviews-moderation'] });
    if (telephone || !deuxColonnes) router.replace(hrefDeLaFile, { scroll: false });
    else url.selectionner(null);
  };

  // Bureau à deux colonnes : ↑ et ↓ passent d'un avis au suivant, hors d'un champ de saisie.
  const surTouche = useEffectEvent((e: KeyboardEvent) => {
    if (!deuxColonnes || !selected || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
    const cible = e.target as HTMLElement | null;
    if (cible && (cible.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(cible.tagName) || cible.closest('[role="listbox"],[role="menu"]')))
      return;
    const i = toutes.findIndex((a) => a.id === selected.id);
    const suivant = toutes[e.key === 'ArrowDown' ? i + 1 : i - 1];
    if (!suivant) return;
    e.preventDefault();
    url.selectionner(suivant.id);
  });
  useEffect(() => {
    if (!deuxColonnes) return;
    const ecouter = (e: KeyboardEvent) => surTouche(e);
    window.addEventListener('keydown', ecouter);
    return () => window.removeEventListener('keydown', ecouter);
  }, [deuxColonnes]);

  const statusOptions = STATUS_KEYS.map((k) => ({ value: k, label: t(`status.${k}`) }));
  const subjectTypeOptions = SUBJECT_TYPE_KEYS.map((st) => ({ value: st.value, label: t(`subjects.${st.key}`) }));
  const statutAffiche = status === '' ? 'all' : status;

  const chargement = aRisque.isLoading || sansRisque.isLoading;
  const erreur = aRisque.isError ? aRisque.error : sansRisque.isError ? sansRisque.error : null;
  const nbBiens = biens.data ?? null;

  /* ── Les pièces ─────────────────────────────────────────────────────────────────────────── */

  const controlesDesFiltres = (empiles: boolean) => (
    <>
      <Select
        value={statutAffiche}
        onValueChange={(value) => url.poserFiltres({ [P_STATUT]: value === 'pending' ? null : value === 'all' ? TOUS : (value ?? null) })}
        items={statusOptions}
      >
        <SelectTrigger aria-label={t('statusAria')} className={cn(empiles && 'w-full')}>
          <span className="text-muted-foreground">{tFile('filtres.statut')}</span>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {statusOptions.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={subjectType || 'all'}
        onValueChange={(value) => url.poserFiltres({ [P_SUJET]: value === 'all' ? null : (value ?? null) })}
        items={subjectTypeOptions}
      >
        <SelectTrigger aria-label={t('subjectAria')} className={cn(empiles && 'w-full')}>
          <span className="text-muted-foreground">{tFile('filtres.sujet')}</span>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {subjectTypeOptions.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <label
        className={cn(
          'inline-flex min-h-11 items-center gap-2 text-sm md:min-h-0',
          !empiles && 'h-controle rounded-lg border border-border bg-card px-3',
        )}
      >
        <Checkbox checked={reported} onCheckedChange={(v) => url.poserFiltres({ [P_SIGNALES]: v ? '1' : null })} />
        {tFile('filtres.signales')}
      </label>
    </>
  );

  const enTeteDeGroupe = (niveau: ReviewRiskLevel) =>
    niveau === 'high' ? (
      <div className="flex h-10 items-center gap-2 border-b border-border bg-warning/10 px-4 text-ui font-semibold">
        <TriangleAlert className="size-4 text-warning" strokeWidth={2} aria-hidden="true" />
        {tFile('groupes.risque', { n: totalARisque })}
      </div>
    ) : (
      <div className="flex h-10 items-center gap-3 border-y border-border bg-muted px-4 text-ui">
        {lotPossible && avisSansRisque.some(publiableParLot) ? caseDeTout() : null}
        <span className="flex-1 font-semibold">{tFile('groupes.sansRisque', { n: totalSansRisque })}</span>
        {lotPossible && avisSansRisque.some(publiableParLot) ? boutonToutCocher(true) : null}
      </div>
    );

  // Le plafond d'une sélection : après « Tout cocher », ce qu'il a coché ; avant, le total sans
  // risque moins les avis déjà lus qu'on ne peut pas publier (exact dès que la file est lue entière).
  const nonPubliablesLus = avisSansRisque.filter((a) => !publiableParLot(a)).length;
  const nbLu = nbDeToutCocher !== null && nbDeToutCocher.lecture === sansRisque.dataUpdatedAt ? nbDeToutCocher.n : null;
  const nbAuPlus = nbLu ?? Math.min(Math.max(totalSansRisque - nonPubliablesLus, 0), MAX_AVIS_PAR_LOT);
  const toutEstCoche = selection.length > 0 && selection.length >= nbAuPlus;
  const caseDeTout = () => (
    <Checkbox
      checked={toutEstCoche}
      indeterminate={selection.length > 0 && !toutEstCoche}
      disabled={toutCocher.isPending}
      onCheckedChange={() => (selection.length > 0 ? setCoches(new Set()) : toutCocher.mutate())}
      aria-label={tFile('toutCocherAria')}
    />
  );
  const boutonToutCocher = (court = false) => (
    <button
      type="button"
      disabled={toutCocher.isPending}
      onClick={() => (toutEstCoche ? setCoches(new Set()) : toutCocher.mutate())}
      className="min-h-11 flex-none text-sm font-medium text-primary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring disabled:opacity-50 md:min-h-0"
    >
      {toutEstCoche ? tFile('toutDecocher') : court ? tFile('toutCocherCourt') : tFile('toutCocher', { n: nbAuPlus })}
    </button>
  );

  const cartes = (avis: readonly ModerationReview[], niveau: ReviewRiskLevel) => (
    <ul className="divide-y divide-border">
      {avis.map((a) => {
        const avecCase = niveau === 'low' && lotPossible && publiableParLot(a);
        return (
          <CarteDAvis
            key={a.id}
            avis={a}
            actif={deuxColonnes && selected?.id === a.id}
            coche={avecCase ? coches.has(a.id) : undefined}
            onCocher={
              avecCase
                ? (c) =>
                    setCoches((avant) => {
                      const apres = new Set(avant);
                      if (c) apres.add(a.id);
                      else apres.delete(a.id);
                      return apres;
                    })
                : undefined
            }
            onOuvrir={() => ouvrir(a)}
          />
        );
      })}
    </ul>
  );

  const voirLesSuivants = (q: typeof aRisque, total: number, lus: number) =>
    q.hasNextPage ? (
      <button
        type="button"
        onClick={() => void q.fetchNextPage()}
        disabled={q.isFetchingNextPage}
        className="block min-h-11 w-full px-4 text-center text-sm font-medium text-primary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
      >
        {tFile('voirSuivants', { n: Math.min(PAR_PAGE, total - lus) })}
      </button>
    ) : null;

  const messages = (
    <>
      {annonce ? (
        <p role="status" className="rounded-lg bg-muted px-4 py-3 text-sm">
          {annonce}
        </p>
      ) : null}
      {erreurDuLot ? (
        <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {erreurDuLot}
        </p>
      ) : null}
    </>
  );

  const etatDeLaFile = chargement ? (
    <div role="status" className="space-y-2 px-4 md:px-0">
      <span className="sr-only">{t('loading')}</span>
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-20 rounded-xl" />
      ))}
    </div>
  ) : erreur ? (
    <ErrorState
      message={messageErreur(erreur, t('loadError'))}
      onRetry={() => void (aRisque.refetch(), sansRisque.refetch())}
      retryLabel={tCommon('actions.retry')}
    />
  ) : toutes.length === 0 ? (
    <ModerationEmpty />
  ) : null;

  /* ── Téléphone ─────────────────────────────────────────────────────────────────────────── */

  if (telephone) {
    const groupe = risqueDuTelephone === 'high' ? avisARisque : avisSansRisque;
    const q = risqueDuTelephone === 'high' ? aRisque : sansRisque;
    const total = risqueDuTelephone === 'high' ? totalARisque : totalSansRisque;
    if (selected) {
      const i = groupe.findIndex((a) => a.id === selected.id);
      const titre =
        i >= 0
          ? tFile(risqueDuTelephone === 'high' ? 'telephoneTitre.risque' : 'telephoneTitre.sansRisque', { i: i + 1, n: total })
          : tFile('detailTitre.autre', { id: selected.id });
      return (
        <>
          <DeclarerEnTete forme="detail" titre={titre} repli={hrefDeLaFile} />
          <PagePleineLargeur>
            <ModerationDetail key={selected.id} review={selected} onModerated={onModerated} platform={platform} agencyName={agencyName} telephone />
          </PagePleineLargeur>
        </>
      );
    }
    const avecLot = risqueDuTelephone === 'low' && lotPossible && avisSansRisque.some(publiableParLot);
    return (
      <PagePleineLargeur className="pb-4" data-slot="file-des-avis">
        <DeclarerEnTete
          titre={tPage('title')}
          action={
            <button
              type="button"
              onClick={() => setFiltresOuverts(true)}
              aria-label={tFile('filtres.ouvrir')}
              className="inline-flex size-10 flex-none items-center justify-center rounded-full hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
            >
              <SlidersHorizontal className="size-5" strokeWidth={1.75} aria-hidden="true" />
            </button>
          }
        />
        <RangeeDePuces aria-label={tFile('puces.aria')} className="px-4 py-3">
          <PuceDeFiltre active={risqueDuTelephone === 'high'} compte={comptes.high} onClick={() => url.poserFiltres({ [P_RISQUE]: null })}>
            {tFile('puces.risque')}
          </PuceDeFiltre>
          <PuceDeFiltre active={risqueDuTelephone === 'low'} compte={comptes.low} onClick={() => url.poserFiltres({ [P_RISQUE]: 'low' })}>
            {tFile('puces.sansRisque')}
          </PuceDeFiltre>
          <PuceDeFiltre onClick={() => router.push(PAGE_DES_BIENS)} compte={nbBiens ?? undefined}>
            {tFile('puces.biens')}
          </PuceDeFiltre>
        </RangeeDePuces>
        <div className="space-y-3 px-4 empty:hidden">{messages}</div>
        {etatDeLaFile ?? (
          <>
            {avecLot ? (
              <div className="flex min-h-11 items-center gap-3 px-4 pb-1">
                <span className="-m-2 inline-flex size-11 flex-none items-center justify-center">{caseDeTout()}</span>
                <p className="min-w-0 flex-1 text-sm">{tFile('regleSansRisque')}</p>
                {boutonToutCocher()}
              </div>
            ) : null}
            {groupe.length > 0 ? (
              <div className="border-y border-border bg-card">{cartes(groupe, risqueDuTelephone)}</div>
            ) : (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                {risqueDuTelephone === 'high' ? tFile('videRisque') : tFile('videSansRisque')}
              </p>
            )}
            <div className="pt-2">{voirLesSuivants(q, total, groupe.length)}</div>
            {platform ? null : (
              <p className="px-4 py-4 text-center text-ui text-muted-foreground" data-testid="moderation-agency-scope">
                {tFile('notePlateforme')}
              </p>
            )}
          </>
        )}
        {avecLot && selection.length > 0 ? (
          <BarreDAction secondaire="premier">
            <p className="flex-none text-ui leading-tight text-muted-foreground">
              <span className="text-corps font-semibold tabular-nums text-foreground">{tFile('selection', { n: selection.length })}</span>
              <br />
              {tFile('surSansRisque', { n: totalSansRisque })}
            </p>
            <Button onClick={() => lot.mutate(selection)} disabled={lot.isPending}>
              {tFile('publier')}
            </Button>
          </BarreDAction>
        ) : null}
        <FeuilleDuBas
          open={filtresOuverts}
          onOpenChange={setFiltresOuverts}
          titre={tFile('filtres.titre')}
          pied={
            <Button className="w-full" onClick={() => setFiltresOuverts(false)}>
              {tFile('filtres.fermer')}
            </Button>
          }
        >
          <div className="space-y-3">{controlesDesFiltres(true)}</div>
        </FeuilleDuBas>
      </PagePleineLargeur>
    );
  }

  /* ── Bureau ────────────────────────────────────────────────────────────────────────────── */

  const sousTitre =
    status === 'pending'
      ? nbBiens !== null
        ? tFile('sousTitre', { avis: comptes.high + comptes.low, risque: comptes.high, biens: nbBiens })
        : tFile('sousTitreAvis', { avis: comptes.high + comptes.low, risque: comptes.high })
      : tPage('subtitle');

  const file = (
    <div
      className="flex flex-col overflow-hidden rounded-xl border border-border bg-card xl:w-[min(380px,calc(100%-604px))] xl:flex-none"
      data-slot="file-des-avis"
    >
      {enTeteDeGroupe('high')}
      {avisARisque.length > 0 ? cartes(avisARisque, 'high') : <p className="px-4 py-4 text-sm text-muted-foreground">{tFile('videRisque')}</p>}
      {voirLesSuivants(aRisque, totalARisque, avisARisque.length)}
      {enTeteDeGroupe('low')}
      {avisSansRisque.length > 0 ? (
        cartes(avisSansRisque, 'low')
      ) : (
        <p className="px-4 py-4 text-sm text-muted-foreground">{tFile('videSansRisque')}</p>
      )}
      {voirLesSuivants(sansRisque, totalSansRisque, avisSansRisque.length)}
      {lotPossible && avisSansRisque.some(publiableParLot) ? (
        <div className="border-t border-border p-3">
          <Button className="w-full" onClick={() => lot.mutate(selection)} disabled={lot.isPending || selection.length === 0}>
            {tFile('publierLaSelection', { n: selection.length })}
          </Button>
        </div>
      ) : null}
    </div>
  );

  const detail = selected ? (
    <div className="min-w-0 flex-1 overflow-hidden rounded-xl border border-border bg-card max-xl:w-full">
      {!deuxColonnes ? (
        <button
          type="button"
          onClick={() => router.push(hrefDeLaFile, { scroll: false })}
          className="m-3 mb-0 inline-flex min-h-11 items-center text-sm font-medium text-primary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        >
          ← {tFile('retourALaFile')}
        </button>
      ) : null}
      <ModerationDetail
        key={selected.id}
        review={selected}
        onModerated={onModerated}
        platform={platform}
        agencyName={agencyName}
        raccourcis={deuxColonnes}
      />
    </div>
  ) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={tPage('title')}
        description={sousTitre}
        dessous={
          <Tabs value="avis" onValueChange={(v) => v === 'biens' && router.push(PAGE_DES_BIENS)}>
            <TabsList variant="line" aria-label={tFile('onglets.aria')}>
              <TabsTrigger value="avis">
                {tFile('onglets.avis')}
                {status === 'pending' && meta ? <TabsCount>{comptes.high + comptes.low}</TabsCount> : null}
              </TabsTrigger>
              <TabsTrigger value="biens">
                {tFile('onglets.biens')}
                {nbBiens !== null ? <TabsCount>{nbBiens}</TabsCount> : null}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        {controlesDesFiltres(false)}
        {platform ? null : (
          <p className="ml-auto text-ui text-muted-foreground" data-testid="moderation-agency-scope">
            {tFile('notePlateforme')}
          </p>
        )}
      </div>
      {messages}
      {etatDeLaFile ?? (
        <div className="flex items-start gap-6 max-xl:flex-col">
          {deuxColonnes || !selected ? file : null}
          {detail}
        </div>
      )}
    </div>
  );
}

function ModerationEmpty() {
  const t = useTranslations('admin.moderation.reviews');
  return <EmptyState icon={<ShieldAlert className="size-8" aria-hidden="true" />} title={t('empty_title')} description={t('empty_description')} />;
}
