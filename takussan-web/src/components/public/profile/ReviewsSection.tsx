import { Star } from 'lucide-react';

export interface PublicReview {
  readonly id: number;
  readonly rating: number;
  readonly title: string | null;
  readonly content: string | null;
  readonly author: { readonly name: string } | null;
  readonly created_at: string | null;
}

interface ReviewsSectionProps {
  readonly average: number | null;
  readonly count: number;
  readonly reviews: ReadonlyArray<PublicReview>;
}

function relativeDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'long',
    });
  } catch {
    return '';
  }
}

function anonymize(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return 'Anonyme';
  const first = parts[0];
  const initial = parts.length > 1 ? `${parts[parts.length - 1].charAt(0)}.` : '';
  return [first, initial].filter(Boolean).join(' ');
}

export function ReviewsSection({ average, count, reviews }: ReviewsSectionProps) {
  if (count === 0 || reviews.length === 0) return null;

  return (
    <section aria-labelledby="reviews-heading">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
        Avis &amp; témoignages
      </p>
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-3">
        <h2
          id="reviews-heading"
          className="font-display text-2xl md:text-3xl font-semibold text-foreground"
        >
          Ce que disent les clients
        </h2>
        {average !== null && (
          <p className="inline-flex items-center gap-2 text-sm text-foreground">
            <Star className="size-4 fill-primary text-primary" aria-hidden />
            <span className="font-display text-lg font-semibold">{average.toFixed(1)}</span>
            <span className="text-muted-foreground">
              · {count} avis
            </span>
          </p>
        )}
      </div>

      <ul className="mt-6 grid gap-4 md:grid-cols-2">
        {reviews.map((r) => (
          <li
            key={r.id}
            className="rounded-2xl border border-border bg-card p-5"
          >
            <div className="flex items-center gap-1 text-primary" aria-label={`${r.rating} étoiles sur 5`}>
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={`size-4 ${i < Math.round(r.rating) ? 'fill-primary' : 'text-border'}`}
                  aria-hidden
                />
              ))}
            </div>
            {r.title && (
              <p className="mt-3 font-display text-base font-semibold text-foreground">{r.title}</p>
            )}
            {r.content && (
              <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                {r.content}
              </p>
            )}
            <p className="mt-4 text-xs text-muted-foreground">
              {r.author ? anonymize(r.author.name) : 'Anonyme'}
              {r.created_at && ` · ${relativeDate(r.created_at)}`}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
