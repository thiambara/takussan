'use client';
import Image from 'next/image';
import { Star } from 'lucide-react';
import { usePropertyReviews } from '@/hooks/usePropertyReviews';
import { useAuth } from '@/context/AuthContext';
import { PropertyReviewForm } from './PropertyReviewForm';
import type { PropertyReview } from '@/types/review';

interface PropertyReviewsProps {
  slug: string;
  propertyId: number;
  averageRating: number | null;
  reviewsCount: number;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function ReviewItem({ review }: { review: PropertyReview }) {
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
          {review.reply_content && (
            <div className="mt-3 ml-2 pl-3 border-l-2 border-stone-200 text-sm text-stone-600">
              <p className="text-xs font-medium text-stone-500 mb-0.5">Réponse du propriétaire</p>
              {review.reply_content}
            </div>
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

export function PropertyReviews({ slug, propertyId, averageRating, reviewsCount }: PropertyReviewsProps) {
  const { user } = useAuth();
  const { data, loading, error, submit } = usePropertyReviews(slug, propertyId);

  return (
    <section className="space-y-4">
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
            <ReviewItem key={r.id} review={r} />
          ))}
        </ul>
      )}
      {data && data.data.length === 0 && !loading && (
        <p className="text-sm text-stone-500">Aucun avis pour l’instant.</p>
      )}

      {user && <PropertyReviewForm onSubmit={submit} />}
    </section>
  );
}
