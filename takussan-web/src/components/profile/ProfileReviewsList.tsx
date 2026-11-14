'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useId, useState } from 'react';
import { MessageSquareQuote, SlidersHorizontal, Star, UserRound } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { EmptyState, ErrorState } from '@/components/feedback';
import { Pagination } from '@/components/console/Pagination';
import {
  type ReceivedStatus,
  type ReceivedSubjectType,
  type Review,
  type ReviewOpportunity,
  useAuthoredReviews,
  useOwnerReviewProperties,
  usePostReview,
  useReceivedReviews,
  useReplyReview,
  useReviewOpportunities,
} from '@/lib/queries/reviews';
import { ReviewReportButton } from '@/components/reports/ReviewReportButton';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { StatusBadge, type StatusTone } from '@/components/console/StatusBadge';
import { initiales } from '@/lib/fiche-publique';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { Tabs, TabsContent, TabsCount, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { moyenneLisible } from '@/components/profile/sommaire/details-du-sommaire';
import type { NoteDeLaFiche } from '@/lib/profil/note-de-la-fiche';
import { cn } from '@/lib/utils';
import { isAgencyAdmin, isAgent, isOwner, isServiceProvider } from '@/lib/roles';
import { formatDate } from '@/lib/format';
import { REVIEW_CONTENT_MAX, REVIEW_REPLY_MAX } from '@/lib/review-limits';
import { useMatchesMedia } from '@/hooks/useMatchesMedia';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import type { UserRole } from '@/types/user';
import type { Locale } from '@/i18n/config';

/** Traducteur du sous-arbre `profile.reviews`, tel que le rend `useTranslations`. */
type Traducteur = (cle: string) => string;

/**
 * TCK-597 (A15) — la boîte des avis reçus s'ouvre à qui peut en recevoir : bailleur publieur,
 * agent, admin d'agence, prestataire. Le périmètre exact est celui de l'API.
 */
function receivesReviews(roles: UserRole[]): boolean {
  return isOwner(roles) || isAgent(roles) || isAgencyAdmin(roles) || isServiceProvider(roles);
}

/** Les onglets de « Mes avis », dans l'ordre de la maquette ; `recus` pour qui peut en recevoir. */
const ONGLETS = ['recus', 'a-laisser', 'publies'] as const;
type Onglet = (typeof ONGLETS)[number];

/**
 * TCK-2635 — « Mes avis » en trois onglets : « Reçus · À laisser · Publiés » (maquette `app-profil`,
 * `ONGLETS_AVIS`). Qui reçoit des avis ouvre sur « Reçus », les autres sur « À laisser ». L'onglet
 * suit l'adresse (`?onglet=`), sans recharger : un lien vers un onglet l'ouvre, et le retour arrière
 * le garde. La note de l'agent, en tête des reçus, est celle de sa fiche publique (`note`, lue au
 * serveur) ; sans elle, rien ne s'affiche plutôt qu'une moyenne calculée sur une page chargée.
 */
export function ProfileReviewsList({
  roles,
  note = null,
}: {
  readonly roles: UserRole[];
  readonly note?: NoteDeLaFiche | null;
}) {
  const t = useTranslations('profile.reviews');
  const locale = useLocale();
  const searchParams = useSearchParams();
  const recoit = receivesReviews(roles);
  const ouverts: readonly Onglet[] = recoit ? ONGLETS : ONGLETS.filter((o) => o !== 'recus');
  const demande = searchParams.get('onglet');
  const [onglet, setOnglet] = useState<Onglet>(() =>
    ouverts.includes(demande as Onglet) ? (demande as Onglet) : ouverts[0]!,
  );

  // Les comptes des onglets : les MÊMES requêtes que leurs listes (clés identiques, une seule
  // requête chacune). « À laisser » compte les formulaires (un par visite, bail, séjour…).
  const recus = useReceivedReviews({ page: 1 }, { enabled: recoit });
  const opportunites = useReviewOpportunities();
  const publies = useAuthoredReviews();
  const comptes: Record<Onglet, number | undefined> = {
    recus: recus.data?.meta?.total,
    'a-laisser': opportunites.data ? groupByContext(opportunites.data.data).length : undefined,
    publies: publies.data?.data.length,
  };

  function choisir(valeur: unknown) {
    if (!ouverts.includes(valeur as Onglet)) return;
    setOnglet(valeur as Onglet);
    const params = new URLSearchParams(window.location.search);
    params.set('onglet', valeur as Onglet);
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
  }

  return (
    <Tabs value={onglet} onValueChange={choisir} className="gap-5">
      {/* Au-dessus des onglets, comme la maquette (`AAvisMobile`, `AAvisBureau`) : la note se lit d'où
          qu'on regarde ses avis. */}
      {recoit && note ? <NoteDeLaFicheEnTete note={note} /> : null}
      <TabsList variant="line" aria-label={t('onglets.titre')}>
        {ouverts.map((o) => (
          <TabsTrigger key={o} value={o}>
            {t(`onglets.${o}`)}
            {comptes[o] ? <TabsCount>{comptes[o]}</TabsCount> : null}
          </TabsTrigger>
        ))}
      </TabsList>

      {recoit ? (
        <TabsContent value="recus" className="space-y-4">
          <ReceivedReviewsInbox withPropertyFilter={isOwner(roles) || isAgent(roles) || isAgencyAdmin(roles)} />
        </TabsContent>
      ) : null}

      <TabsContent value="a-laisser" className="space-y-3">
        <ReviewOpportunitiesList />
      </TabsContent>

      <TabsContent value="publies" className="space-y-3">
        <AuthoredReviewsList locale={locale} />
      </TabsContent>
    </Tabs>
  );
}

/**
 * La note de la fiche publique, en tête des reçus (maquette `TeteAvis`) : la moyenne, ses étoiles et
 * le nombre d'avis. La répartition par étoile de la maquette n'est pas rendue : la fiche ne la donne
 * pas, et la calculer sur une page d'avis chargée serait une autre valeur.
 */
function NoteDeLaFicheEnTete({ note }: { readonly note: NoteDeLaFiche }) {
  const t = useTranslations('profile.reviews');
  const locale = useLocale();
  const moyenne = moyenneLisible(note.moyenne, locale);
  return (
    <div data-slot="note-de-la-fiche" className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 md:max-w-105">
      <p className="font-display text-4xl font-semibold tabular-nums tracking-titre">{moyenne}</p>
      <div className="min-w-0">
        <div className="flex gap-0.5" role="img" aria-label={t('tete.moyenneAria', { moyenne })}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Star
              key={n}
              aria-hidden="true"
              className={cn('size-3.5', n <= Math.round(note.moyenne) ? 'fill-primary text-primary' : 'text-border')}
            />
          ))}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{t('tete.nombre', { nombre: note.nombre })}</p>
      </div>
    </div>
  );
}

function AuthoredReviewsList({ locale }: { readonly locale: string }) {
  const t = useTranslations('profile.reviews');
  const reviewsQuery = useAuthoredReviews();
  const reviews = reviewsQuery.data?.data ?? [];

  if (reviewsQuery.isLoading) {
    return (
      <div className="space-y-3" role="status" aria-label={t('loadingAria')}>
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  if (reviewsQuery.isError) {
    return <ErrorState message={t('postedError')} />;
  }

  if (reviews.length === 0) {
    return (
      <EmptyState
        icon={<MessageSquareQuote className="size-8" aria-hidden="true" />}
        title={t('postedEmpty')}
      />
    );
  }

  return (
    <ul className="space-y-3">
      {reviews.map((review) => (
        <li key={review.id}>
          <AuthoredReviewCard review={review} locale={locale} />
        </li>
      ))}
    </ul>
  );
}

/**
 * TCK-597 (C18, P20) — une invitation par CONTEXTE (visite, bail, réservation, intervention) : le
 * bien et l'agent d'un même bail se notent dans le même formulaire. Une invitation disparaît
 * quand l'avis est déposé — c'est le serveur qui ne la rend plus.
 */
type OpportunityGroup = { key: string; context: ReviewOpportunity['context']; items: ReviewOpportunity[] };

const ORDRE_DES_CIBLES: Record<ReviewOpportunity['type'], number> = {
  property: 0,
  agent: 1,
  agency: 2,
  service_provider: 3,
};

function groupByContext(items: readonly ReviewOpportunity[]): OpportunityGroup[] {
  const groups = new Map<string, OpportunityGroup>();
  for (const item of items) {
    const key = `${item.context.type}:${item.context.id}`;
    const group = groups.get(key) ?? { key, context: item.context, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  return [...groups.values()].map((g) => ({
    ...g,
    items: [...g.items].sort((a, b) => ORDRE_DES_CIBLES[a.type] - ORDRE_DES_CIBLES[b.type]),
  }));
}

function ReviewOpportunitiesList() {
  const t = useTranslations('profile.reviews');
  const opportunitiesQuery = useReviewOpportunities();

  if (opportunitiesQuery.isLoading) {
    return (
      <div className="space-y-3" role="status" aria-label={t('loadingAria')}>
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    );
  }

  if (opportunitiesQuery.isError) {
    return <ErrorState message={t('opportunitiesError')} />;
  }

  const groups = groupByContext(opportunitiesQuery.data?.data ?? []);

  if (groups.length === 0) {
    return (
      <EmptyState
        icon={<Star className="size-8" aria-hidden="true" />}
        title={t('opportunitiesEmpty')}
      />
    );
  }

  // TCK-2635 — côte à côte tant que chaque carte a ses 360 px (maquette `AAvisBureau`), l'une sous
  // l'autre en dessous.
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,calc(var(--spacing)*90)),1fr))] items-start gap-4">
      {groups.map((group) => (
        <li key={group.key}>
          <OpportunityForm group={group} />
        </li>
      ))}
    </ul>
  );
}

function OpportunityForm({ group }: { readonly group: OpportunityGroup }) {
  const t = useTranslations('profile.reviews');
  const toast = useToast();
  const messageErreur = useMessageErreurApi();
  const postReview = usePostReview();
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [contents, setContents] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  // P201.04 (TCK-2039) — les cibles déjà enregistrées quand un dépôt suivant échoue.
  const [sent, setSent] = useState<string[]>([]);
  const idPrefix = useId();

  const keyOf = (item: ReviewOpportunity) => `${item.type}:${item.subject.id}`;
  const targetLabel = (item: ReviewOpportunity) =>
    `${t(`targets.${item.type}`)}${item.subject.title ? ` · ${item.subject.title}` : ''}`;
  const rated = group.items.filter((item) => (ratings[keyOf(item)] ?? 0) > 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (rated.length === 0) {
      setError(t('opportunityRatingRequired'));
      return;
    }
    setError(null);
    setSent([]);
    const done: string[] = [];
    try {
      // Un avis par cible notée : le bien et l'agent sont deux sujets, deux modérations.
      for (const item of rated) {
        await postReview.mutateAsync({
          opportunity: item,
          rating: ratings[keyOf(item)]!,
          content: contents[keyOf(item)]?.trim() || undefined,
        });
        done.push(targetLabel(item));
      }
      toast.add({ title: t('opportunitySentTitle'), description: t('opportunitySentBody'), type: 'success' });
    } catch (err) {
      setSent(done);
      setError(messageErreur(err, t('opportunityError')));
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-xl border border-border bg-card p-4"
      aria-labelledby={`${idPrefix}-title`}
    >
      <div>
        <p id={`${idPrefix}-title`} className="text-sm font-semibold text-foreground">
          {group.items[0]?.subject.title ?? t('targetFallback')}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{t(`contexts.${group.context.type}`)}</p>
      </div>
      {group.items.map((item) => {
        const key = keyOf(item);
        return (
          <fieldset key={key} className="space-y-2 border-t border-border pt-3 first-of-type:border-t-0 first-of-type:pt-0">
            <legend className="text-sm text-foreground">
              {t(`targets.${item.type}`)}
              {item.subject.title ? <span className="font-medium"> · {item.subject.title}</span> : null}
            </legend>
            <StarRatingInput
              name={`${idPrefix}-${key}`}
              value={ratings[key] ?? 0}
              onChange={(n) => setRatings((r) => ({ ...r, [key]: n }))}
            />
            <label className="block text-xs text-muted-foreground">
              <span className="mb-1 block">{t('opportunityCommentLabel')}</span>
              <Textarea
                value={contents[key] ?? ''}
                onChange={(e) => setContents((c) => ({ ...c, [key]: e.target.value }))}
                rows={2}
                maxLength={REVIEW_CONTENT_MAX}
              />
            </label>
          </fieldset>
        );
      })}
      {error ? (
        <div role="alert" className="space-y-1 text-sm text-destructive">
          <p>{error}</p>
          {sent.length > 0 ? (
            <p>{t('opportunityPartiallySent', { targets: sent.join(', ') })}</p>
          ) : null}
        </div>
      ) : null}
      {/* TCK-2635 — pleine largeur, comme la maquette ; une seule cible : « Publier mon avis », au singulier. */}
      <Button type="submit" size="lg" className="w-full" disabled={postReview.isPending}>
        {group.items.length === 1 ? t('opportunitySubmitOne') : t('opportunitySubmit')}
      </Button>
    </form>
  );
}

/** Cinq boutons radio natifs : le clavier (flèches) et le lecteur d'écran les lisent sans aide. */
function StarRatingInput({
  name,
  value,
  onChange,
}: {
  readonly name: string;
  readonly value: number;
  readonly onChange: (value: number) => void;
}) {
  const t = useTranslations('profile.reviews');
  return (
    // TCK-2635 — la maquette (`CarteAvisALaisser`) : des cibles de 44 px, des étoiles de 32. Les étoiles
    // vides gardent l'encre douce (la maquette les dessine couleur de filet : 3:1 non tenu, ADR-0106 § 2).
    <div className="-mx-1 flex items-center">
      {[1, 2, 3, 4, 5].map((n) => (
        <label key={n} className="inline-flex size-11 cursor-pointer items-center justify-center rounded-md has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
          <input
            type="radio"
            name={name}
            value={n}
            checked={value === n}
            onChange={() => onChange(n)}
            className="sr-only"
          />
          <span className="sr-only">{t('starsLabel', { count: n })}</span>
          <Star aria-hidden="true" strokeWidth={1.25} className={cn('size-8', value >= n ? 'fill-primary text-primary' : 'text-muted-foreground')} />
        </label>
      ))}
    </div>
  );
}

function AuthoredReviewCard({
  review,
  locale,
}: {
  readonly review: Review;
  readonly locale: string;
}) {
  const t = useTranslations('profile.reviews');
  const date = review.created_at ? formatDate(review.created_at, locale as Locale) : '';
  const targetTitle = review.target?.title ?? t('targetFallback');
  const targetHref = review.target?.type === 'property' && review.target.slug
    ? `/properties/${review.target.slug}#avis`
    : null;

  return (
    <article className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-48">
          {targetHref ? (
            <Link
              href={targetHref}
              className="block truncate rounded-sm text-sm font-semibold text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {targetTitle}
            </Link>
          ) : (
            <p className="truncate text-sm font-semibold text-foreground">{targetTitle}</p>
          )}
          <p className="mt-0.5 text-xs text-muted-foreground">
            {date || t('unknownDate')}
            {review.target?.subtitle ? <> · {review.target.subtitle}</> : null}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="outline" className="tabular-nums">{review.rating}/5</Badge>
          {review.status ? <Badge variant="secondary">{statusLabel(review.status, t)}</Badge> : null}
        </div>
      </div>
      {review.title ? (
        <p className="mt-3 text-sm font-medium text-foreground">{review.title}</p>
      ) : null}
      <p className="mt-1 max-w-prose whitespace-pre-line text-sm text-pretty text-muted-foreground">
        {review.content ?? t('noComment')}
      </p>
    </article>
  );
}

const SUBJECT_TYPES: ReadonlyArray<ReceivedSubjectType> = ['property', 'agent', 'agency', 'service_provider'];
const STATUSES: ReadonlyArray<ReceivedStatus> = ['pending', 'approved', 'reported'];
const ALL = 'all';

/**
 * TCK-597 (A15) — la boîte des avis reçus. Les filtres (bien, réponse, statut, cible) partent au
 * serveur ; rien n'est filtré sur une liste déjà rapatriée. Un avis en attente est visible et
 * marqué comme tel. La réponse se rédige dans la page.
 */
const REPLY_VALUES: ReadonlyArray<string> = ['unreplied', 'replied'];

/** La valeur de l'URL si elle est une option du filtre, sinon « tous ». */
function filtreDeLUrl(value: string | null, options: ReadonlyArray<string>): string {
  return value !== null && options.includes(value) ? value : ALL;
}

function ReceivedReviewsInbox({ withPropertyFilter }: { readonly withPropertyFilter: boolean }) {
  const t = useTranslations('profile.reviews');
  // TCK-1515 (P167.02) — `?reply=` et `?subject=` initialisent les filtres « Réponse » et « Sujet »
  // à l'ouverture, bornés à leurs options : « Avis sans réponse » de l'aperçu du bailleur mène à
  // `?reply=unreplied&subject=property`.
  const searchParams = useSearchParams();
  const [propertyFilter, setPropertyFilter] = useState(ALL);
  const [replyFilter, setReplyFilter] = useState(() => filtreDeLUrl(searchParams.get('reply'), REPLY_VALUES));
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [subjectFilter, setSubjectFilter] = useState(() => filtreDeLUrl(searchParams.get('subject'), SUBJECT_TYPES));
  const [page, setPage] = useState(1);
  const telephone = useMatchesMedia('(width < 48rem)');
  const propertiesQuery = useOwnerReviewProperties();
  const properties = withPropertyFilter ? (propertiesQuery.data?.data ?? []) : [];

  const reviewsQuery = useReceivedReviews({
    propertyId: propertyFilter === ALL ? undefined : Number(propertyFilter),
    replied: replyFilter === ALL ? undefined : replyFilter === 'replied',
    status: statusFilter === ALL ? undefined : (statusFilter as ReceivedStatus),
    subjectType: subjectFilter === ALL ? undefined : (subjectFilter as ReceivedSubjectType),
    page,
  });
  const reviews = reviewsQuery.data?.data ?? [];
  const meta = reviewsQuery.data?.meta;

  // Changer un filtre ramène à la page 1 : la page 4 d'un autre filtre n'existe peut-être pas.
  const poser = (setter: (v: string) => void) => (value: string | null) => {
    setter(value ?? ALL);
    setPage(1);
  };

  const replyOptions = [
    { value: ALL, label: t('allReviews') },
    { value: 'unreplied', label: t('unreplied') },
    { value: 'replied', label: t('replied') },
  ];
  const statusOptions = [
    { value: ALL, label: t('allStatuses') },
    ...STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) })),
  ];
  const subjectOptions = [
    { value: ALL, label: t('allSubjects') },
    ...SUBJECT_TYPES.map((s) => ({ value: s, label: t(`subjects.${s}`) })),
  ];
  const propertyOptions = [
    { value: ALL, label: t('allProperties') },
    ...properties.map((p) => ({
      value: String(p.id),
      label: `${p.reference_number ? `${p.reference_number} · ` : ''}${p.title}`,
    })),
  ];

  const filtres = (
    <>
      {withPropertyFilter ? (
        <FilterSelect label={t('filterByProperty')} value={propertyFilter} options={propertyOptions} onChange={poser(setPropertyFilter)} />
      ) : null}
      <FilterSelect label={t('filterByReply')} value={replyFilter} options={replyOptions} onChange={poser(setReplyFilter)} />
      <FilterSelect label={t('filterByStatus')} value={statusFilter} options={statusOptions} onChange={poser(setStatusFilter)} />
      <FilterSelect label={t('filterBySubject')} value={subjectFilter} options={subjectOptions} onChange={poser(setSubjectFilter)} />
    </>
  );
  const filtresActifs = [propertyFilter, replyFilter, statusFilter, subjectFilter].filter((v) => v !== ALL).length;

  return (
    <div className="space-y-4">
      {telephone ? (
        // TCK-2635 — au téléphone, les filtres passent dans une feuille (maquette `BoutonFiltres`).
        <div className="flex justify-end">
          <FeuilleDuBas
            titre={t('filtres.titre')}
            declencheur={
              <Button type="button" variant="outline" size="sm">
                <SlidersHorizontal aria-hidden="true" />
                {t('filtres.bouton')}
                {filtresActifs > 0 ? <TabsCount>{filtresActifs}</TabsCount> : null}
              </Button>
            }
          >
            <div className="grid gap-3">{filtres}</div>
          </FeuilleDuBas>
        </div>
      ) : (
        <div className="grid gap-3 rounded-xl border border-border bg-card p-3 sm:grid-cols-2 lg:grid-cols-4">{filtres}</div>
      )}

      {reviewsQuery.isLoading ? (
        <div className="space-y-3" role="status" aria-label={t('loadingAria')}>
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : reviewsQuery.isError ? (
        <ErrorState message={t('error')} />
      ) : reviews.length === 0 ? (
        <EmptyState
          icon={<MessageSquareQuote className="size-8" aria-hidden="true" />}
          title={t('empty_title')}
          description={t('empty_description')}
        />
      ) : (
        <>
          <ul className="space-y-3">
            {reviews.map((review) => (
              <ReceivedReviewCard key={review.id} review={review} />
            ))}
          </ul>
          {meta ? <Pagination page={meta.current_page} lastPage={meta.last_page} onChange={setPage} /> : null}
        </>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly options: ReadonlyArray<{ value: string; label: string }>;
  readonly onChange: (value: string | null) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange((v as string | null) ?? null)} items={[...options]}>
      <SelectTrigger aria-label={label} className="w-full min-w-0">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ReceivedReviewCard({ review }: { readonly review: Review }) {
  const locale = useLocale() as Locale;
  const t = useTranslations('profile.reviews');
  const toast = useToast();
  const messageErreur = useMessageErreurApi();
  const replyReview = useReplyReview();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(review.reply_content ?? '');
  const [error, setError] = useState<string | null>(null);
  const fieldId = useId();
  const pending = review.status === 'pending';

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content) {
      setError(t('replyRequired'));
      return;
    }
    try {
      await replyReview.mutateAsync({ reviewId: review.id, reply_content: content });
      setEditing(false);
      setError(null);
      toast.add({ title: t('replyToastTitle'), description: t('replyToastDescription'), type: 'success' });
    } catch (err) {
      setError(messageErreur(err, t('replyError')));
    }
  }

  const auteur = review.author.name || t('anonymous');
  const tonDuStatut = review.status ? TONS_DU_STATUT[review.status] : undefined;

  // TCK-2635 — la carte de la maquette (`CarteAvisRecu`) : l'auteur et la cible, le signalement en
  // icône à droite ; puis la note, la date et le statut quand il n'est pas « approuvé » (l'état
  // ordinaire d'un avis publié) ; puis le texte.
  return (
    <li className="rounded-xl border border-border bg-card p-4" data-testid={`received-review-${review.id}`}>
      <div className="flex items-center gap-3">
        <Avatar size="36">
          {review.author.avatar_url ? <AvatarImage src={review.author.avatar_url} alt="" /> : null}
          <AvatarFallback>{review.author.name ? initiales(review.author.name) : <UserRound className="size-4" aria-hidden="true" />}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-semibold text-foreground">{auteur}</p>
          <p className="truncate text-ui text-muted-foreground">{review.target?.title ?? t('targetFallback')}</p>
        </div>
        {/* Un avis en attente n'est pas public : on ne le signale pas encore. */}
        {pending ? null : <ReviewReportButton reviewId={review.id} compact />}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <NoteEnEtoiles note={review.rating} />
        <span className="text-xs text-muted-foreground">
          {review.created_at ? formatDate(review.created_at, locale) : t('unknownDate')}
        </span>
        {review.status && tonDuStatut ? (
          <StatusBadge tone={tonDuStatut} label={pending ? t('pastilleEnAttente') : statusLabel(review.status, t)} />
        ) : null}
        {pending ? <span className="sr-only">{t('pendingNotice')}</span> : null}
      </div>
      {review.title ? (
        <p className="mt-2 text-sm font-medium text-foreground">{review.title}</p>
      ) : null}
      <p className={cn('max-w-prose whitespace-pre-line text-sm leading-relaxed text-pretty text-foreground', review.title ? 'mt-1' : 'mt-2')}>
        {review.content ?? t('noComment')}
      </p>
      {review.reply_content && !editing ? (
        <div className="mt-3 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('yourReply')}</p>
          <p className="mt-1 whitespace-pre-line">{review.reply_content}</p>
        </div>
      ) : null}
      {editing ? (
        <form onSubmit={handleReply} className="mt-3 space-y-2">
          <label htmlFor={fieldId} className="block text-xs font-medium text-foreground">{t('replyPrompt')}</label>
          <Textarea
            id={fieldId}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            maxLength={REVIEW_REPLY_MAX}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${fieldId}-error` : undefined}
            autoFocus
          />
          {error ? <p id={`${fieldId}-error`} role="alert" className="text-sm text-destructive">{error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={replyReview.isPending}>{t('replySubmit')}</Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setDraft(review.reply_content ?? '');
                setError(null);
              }}
            >
              {t('replyCancel')}
            </Button>
          </div>
        </form>
      ) : (
        // Un avis en attente n'est pas public : on n'y répond pas, on ne le signale pas encore.
        // « Répondre » suit `can_reply`, jugé par la policy (verif-597 m1) : le collaborateur d'une
        // autre agence ou le publieur retiré voient l'avis, sans le geste que l'API refuserait.
        pending || !review.can_reply ? null : (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button type="button" size="sm" onClick={() => setEditing(true)}>
              {review.reply_content ? t('editReply') : t('reply')}
            </Button>
          </div>
        )
      )}
    </li>
  );
}

/** Le ton de la pastille ; « approuvé » n'en a pas : c'est l'état ordinaire d'un avis publié. */
const TONS_DU_STATUT: Partial<Record<string, StatusTone>> = {
  pending: 'attention',
  reported: 'danger',
  rejected: 'neutral',
};

/** La note d'un avis en cinq étoiles, lue « Note : 4 sur 5 ». */
function NoteEnEtoiles({ note }: { readonly note: number }) {
  const t = useTranslations('profile.reviews');
  return (
    <span role="img" aria-label={t('noteAria', { note })} className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} aria-hidden="true" className={cn('size-3.5', n <= note ? 'fill-primary text-primary' : 'text-border')} />
      ))}
    </span>
  );
}

const CLES_STATUT: Record<string, string> = {
  pending: 'status.pending',
  approved: 'status.approved',
  reported: 'status.reported',
  rejected: 'status.rejected',
};

function statusLabel(status: string, t: Traducteur): string {
  const cle = CLES_STATUT[status];
  return cle ? t(cle) : status;
}
