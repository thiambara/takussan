'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import { MessageSquareQuote, Star } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { EmptyState, ErrorState } from '@/components/feedback';
import { Pagination } from '@/components/console';
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
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { isAgencyAdmin, isAgent, isOwner, isServiceProvider } from '@/lib/roles';
import { formatDate } from '@/lib/format';
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

export function ProfileReviewsList({ roles }: { readonly roles: UserRole[] }) {
  const t = useTranslations('profile.reviews');
  const locale = useLocale();

  return (
    <div className="space-y-8">
      <section className="space-y-3" aria-labelledby="posted-reviews-title">
        <h2 id="posted-reviews-title" className="text-base font-semibold text-foreground">
          {t('postedTitle')}
        </h2>
        <AuthoredReviewsList locale={locale} />
      </section>

      <section className="space-y-3" aria-labelledby="review-opportunities-title">
        <h2 id="review-opportunities-title" className="text-base font-semibold text-foreground">
          {t('opportunitiesTitle')}
        </h2>
        <ReviewOpportunitiesList />
      </section>

      {receivesReviews(roles) ? (
        <section className="space-y-3" aria-labelledby="received-reviews-title">
          <h2 id="received-reviews-title" className="text-base font-semibold text-foreground">
            {t('receivedTitle')}
          </h2>
          <ReceivedReviewsInbox withPropertyFilter={isOwner(roles) || isAgent(roles) || isAgencyAdmin(roles)} />
        </section>
      ) : null}
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

  return (
    <ul className="space-y-3">
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
  const idPrefix = useId();

  const keyOf = (item: ReviewOpportunity) => `${item.type}:${item.subject.id}`;
  const rated = group.items.filter((item) => (ratings[keyOf(item)] ?? 0) > 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (rated.length === 0) {
      setError(t('opportunityRatingRequired'));
      return;
    }
    setError(null);
    try {
      // Un avis par cible notée : le bien et l'agent sont deux sujets, deux modérations.
      for (const item of rated) {
        await postReview.mutateAsync({
          opportunity: item,
          rating: ratings[keyOf(item)]!,
          content: contents[keyOf(item)]?.trim() || undefined,
        });
      }
      toast.add({ title: t('opportunitySentTitle'), description: t('opportunitySentBody'), type: 'success' });
    } catch (err) {
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
                maxLength={2000}
              />
            </label>
          </fieldset>
        );
      })}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={postReview.isPending}>
          <Star aria-hidden="true" />
          {t('opportunitySubmit')}
        </Button>
      </div>
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
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <label key={n} className="cursor-pointer rounded-sm p-0.5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
          <input
            type="radio"
            name={name}
            value={n}
            checked={value === n}
            onChange={() => onChange(n)}
            className="sr-only"
          />
          <span className="sr-only">{t('starsLabel', { count: n })}</span>
          <Star aria-hidden="true" className={`size-5 ${value >= n ? 'fill-primary text-primary' : 'text-muted-foreground'}`} />
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
function ReceivedReviewsInbox({ withPropertyFilter }: { readonly withPropertyFilter: boolean }) {
  const t = useTranslations('profile.reviews');
  const [propertyFilter, setPropertyFilter] = useState(ALL);
  const [replyFilter, setReplyFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [subjectFilter, setSubjectFilter] = useState(ALL);
  const [page, setPage] = useState(1);
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

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-xl border border-border bg-card p-3 sm:grid-cols-2 lg:grid-cols-4">
        {withPropertyFilter ? (
          <FilterSelect label={t('filterByProperty')} value={propertyFilter} options={propertyOptions} onChange={poser(setPropertyFilter)} />
        ) : null}
        <FilterSelect label={t('filterByReply')} value={replyFilter} options={replyOptions} onChange={poser(setReplyFilter)} />
        <FilterSelect label={t('filterByStatus')} value={statusFilter} options={statusOptions} onChange={poser(setStatusFilter)} />
        <FilterSelect label={t('filterBySubject')} value={subjectFilter} options={subjectOptions} onChange={poser(setSubjectFilter)} />
      </div>

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

  return (
    <li className="rounded-xl border border-border bg-card p-4" data-testid={`received-review-${review.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-48">
          <p className="truncate text-sm font-semibold text-foreground">{review.target?.title ?? t('targetFallback')}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {review.author.name} · {review.created_at ? formatDate(review.created_at, locale) : t('unknownDate')}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="outline" className="tabular-nums">{review.rating}/5</Badge>
          {review.status ? <Badge variant={pending ? 'outline' : 'secondary'}>{statusLabel(review.status, t)}</Badge> : null}
        </div>
      </div>
      {pending ? <p className="mt-2 text-xs text-muted-foreground">{t('pendingNotice')}</p> : null}
      {review.title ? (
        <p className="mt-3 text-sm font-medium text-foreground">{review.title}</p>
      ) : null}
      <p className="mt-1 max-w-prose whitespace-pre-line text-sm text-pretty text-muted-foreground">
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
            maxLength={2000}
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
        pending ? null : (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {review.can_reply ? (
              <Button type="button" size="sm" onClick={() => setEditing(true)}>
                {review.reply_content ? t('editReply') : t('reply')}
              </Button>
            ) : null}
            <ReviewReportButton reviewId={review.id} />
          </div>
        )
      )}
    </li>
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
