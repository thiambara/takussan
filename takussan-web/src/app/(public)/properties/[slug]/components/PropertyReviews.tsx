'use client';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { Star, MessageSquareReply, Pencil } from 'lucide-react';
import { usePropertyReviews } from '@/hooks/usePropertyReviews';
import { useAuth } from '@/context/AuthContext';
import { getReviewEligibility } from '@/app/actions/property';
import { PropertyReviewForm } from './PropertyReviewForm';
import { PropertyReviewReplyForm } from './PropertyReviewReplyForm';
import type { PropertyReview } from '@/types/review';

interface PropertyReviewsProps {
  slug: string;
  propertyId: number;
  averageRating: number | null;
  reviewsCount: number;
  /**
   * Property owner user id — required to show the "Répondre" CTA to the right
   * account. Null for listings where the owner card isn't loaded.
   */
  ownerId?: number | null;
  /**
   * Property agency id — used to show the "Répondre" CTA to agents belonging
   * to the listing agency (matches backend policy in `ReviewController@reply`).
   */
  agencyId?: number | null;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

interface ReviewItemProps {
  review: PropertyReview;
  canReply: boolean;
  onReply: (reviewId: number, replyContent: string) => Promise<void>;
}

function ReviewItem({ review, canReply, onReply }: ReviewItemProps) {
  const [editing, setEditing] = useState(false);
  const hasReply = Boolean(review.reply_content);

  return (
    <li className="border-b border-stone-200 pb-4 last:border-b-0">
      <div className="flex items-start gap-3">
        <div className="relative size-10 rounded-full overflow-hidden bg-stone-100 shrink-0">
          {review.author.avatar_url ? (
            <Image
              src={review.author.avatar_url}
              alt={review.author.name}
              fill
              sizes="40px"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm font-semibold text-stone-500">
              {review.author.name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <p className="font-medium text-stone-900">{review.author.name}</p>
            <time className="text-xs text-stone-500">{formatDate(review.created_at)}</time>
          </div>
          <div className="flex items-center gap-0.5 mt-0.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <Star
                key={n}
                className={`size-3.5 ${
                  n <= review.rating ? 'fill-amber-400 text-amber-400' : 'text-stone-300'
                }`}
              />
            ))}
          </div>
          {review.title && <p className="font-medium text-stone-900 mt-2">{review.title}</p>}
          {review.content && <p className="text-sm text-stone-700 mt-1">{review.content}</p>}

          {hasReply && !editing && (
            <div
              className="mt-3 ml-2 pl-3 border-l-2 border-stone-200 text-sm text-stone-600"
              data-testid="review-reply"
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-xs font-medium text-stone-500">
                  Réponse de l’agent
                  {review.replied_at && (
                    <span className="ml-2 text-stone-400 font-normal">
                      · {formatDate(review.replied_at)}
                    </span>
                  )}
                </p>
                {canReply && (
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="inline-flex items-center gap-1 text-xs text-stone-600 hover:text-stone-900"
                  >
                    <Pencil className="size-3" aria-hidden /> Modifier
                  </button>
                )}
              </div>
              <p className="mt-1 whitespace-pre-line">{review.reply_content}</p>
            </div>
          )}

          {canReply && !hasReply && !editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50"
              data-testid="review-reply-trigger"
            >
              <MessageSquareReply className="size-3.5" aria-hidden />
              Répondre
            </button>
          )}

          {canReply && editing && (
            <PropertyReviewReplyForm
              reviewId={review.id}
              initialContent={review.reply_content}
              onSubmit={async (id, content) => {
                await onReply(id, content);
                setEditing(false);
              }}
              onCancel={() => setEditing(false)}
            />
          )}
        </div>
      </div>
    </li>
  );
}

function RatingDistribution({
  distribution,
  total,
}: {
  distribution: Record<'5' | '4' | '3' | '2' | '1', number>;
  total: number;
}) {
  const keys: Array<'5' | '4' | '3' | '2' | '1'> = ['5', '4', '3', '2', '1'];
  return (
    <div className="space-y-1.5">
      {keys.map((k) => {
        const count = distribution[k] ?? 0;
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        return (
          <div key={k} className="flex items-center gap-2 text-sm">
            <span className="w-4 text-stone-600">{k}</span>
            <Star className="size-3.5 fill-amber-400 text-amber-400" aria-hidden />
            <div className="flex-1 h-2 rounded-full bg-stone-100 overflow-hidden">
              <div
                className="h-full bg-amber-400"
                style={{ width: `${pct}%` }}
                aria-hidden
              />
            </div>
            <span className="w-8 text-right text-xs text-stone-500">{count}</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Determine whether the currently authenticated user may reply publicly to
 * reviews on a property. Mirrors the backend rule in `ReviewController@reply`:
 * owner, matching agency member, or admin.
 */
export function canReplyToReview({
  userId,
  userRoles,
  userAgencyId,
  ownerId,
  propertyAgencyId,
}: {
  userId: number | null | undefined;
  userRoles: readonly string[];
  userAgencyId: number | null | undefined;
  ownerId: number | null | undefined;
  propertyAgencyId: number | null | undefined;
}): boolean {
  if (!userId) return false;
  if (userRoles.includes('super_admin')) return true;
  if (ownerId && userId === ownerId) return true;
  if (userAgencyId && propertyAgencyId && userAgencyId === propertyAgencyId) return true;
  return false;
}

export function PropertyReviews({
  slug,
  propertyId,
  averageRating,
  reviewsCount,
  ownerId,
  agencyId,
}: PropertyReviewsProps) {
  const { user } = useAuth();
  const { data, loading, error, submit, reply } = usePropertyReviews(slug, propertyId);

  // TCK-180 — gate the review form on history. The endpoint requires
  // auth, so anonymous users skip the call and simply never see the form.
  const [eligibility, setEligibility] = useState<{
    slug: string;
    userId: number;
    result: { eligible: boolean; alreadyReviewed: boolean };
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!user) return;
    (async () => {
      const result = await getReviewEligibility(slug);
      if (!cancelled) setEligibility({ slug, userId: user.id, result });
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, user]);

  const canReply = canReplyToReview({
    userId: user?.id,
    userRoles: user?.roles ?? [],
    userAgencyId: user?.agency_id ?? null,
    ownerId,
    propertyAgencyId: agencyId,
  });

  const activeEligibility =
    user && eligibility?.slug === slug && eligibility.userId === user.id
      ? eligibility.result
      : null;

  const showReviewForm =
    !!user &&
    !!activeEligibility &&
    activeEligibility.eligible &&
    !activeEligibility.alreadyReviewed;

  return (
    <section id="avis" className="space-y-4 scroll-mt-24">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h2 className="text-xl font-semibold text-stone-900">
          Avis {reviewsCount > 0 && <span className="text-stone-500 text-base">({reviewsCount})</span>}
        </h2>
        {averageRating != null && (
          <div className="flex items-center gap-1 text-sm">
            <Star className="size-4 fill-amber-400 text-amber-400" aria-hidden />
            <span className="font-semibold">{averageRating.toFixed(1)}</span>
          </div>
        )}
      </div>

      {data && data.meta.total > 0 && (
        <div className="grid sm:grid-cols-[180px_1fr] gap-4 rounded-xl border border-stone-200 p-4">
          <div>
            <p className="text-3xl font-bold text-stone-900">
              {(data.meta.average ?? 0).toFixed(1)}
            </p>
            <p className="text-xs text-stone-500">{data.meta.total} avis</p>
          </div>
          <RatingDistribution distribution={data.meta.distribution} total={data.meta.total} />
        </div>
      )}

      {loading && <p className="text-sm text-stone-500">Chargement des avis…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {data && data.data.length > 0 && (
        <ul className="space-y-4">
          {data.data.map((r) => (
            <ReviewItem key={r.id} review={r} canReply={canReply} onReply={reply} />
          ))}
        </ul>
      )}
      {data && data.data.length === 0 && !loading && (
        <p className="text-sm text-stone-500">Aucun avis pour l’instant.</p>
      )}

      {showReviewForm && <PropertyReviewForm onSubmit={submit} />}
      {user && activeEligibility && !activeEligibility.eligible && !activeEligibility.alreadyReviewed && (
        <p className="rounded-xl bg-app-surface-1 p-4 text-sm text-app-ink-muted">
          Vous pourrez laisser un avis après une visite finalisée ou la signature d&apos;un bail
          sur ce bien.
        </p>
      )}
      {user && activeEligibility?.alreadyReviewed && (
        <p className="rounded-xl bg-app-surface-1 p-4 text-sm text-app-ink-muted">
          Merci, vous avez déjà laissé un avis sur ce bien.
        </p>
      )}
    </section>
  );
}
