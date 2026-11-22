<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Models\Review;
use App\Services\Review\ReviewEligibility;
use App\Services\Review\ReviewModerationScope;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

/**
 * TCK-2930 — `GET /api/reviews/{review}/subject-summary` : ce que le modérateur lit À CÔTÉ d'un avis
 * pour le juger.
 *
 * - `subject` : la moyenne et le nombre des avis PUBLIÉS du même sujet (bien, agent, agence,
 *   prestataire), l'avis lui-même compris s'il est publié. « Publié » = `is_approved`, le critère
 *   de la moyenne publique (ADR-0043 §6), calculé à la demande : le prestataire n'a pas de colonne
 *   stockée.
 * - `others` : les 3 derniers AUTRES avis publiés du sujet — jamais l'avis lui-même, jamais un avis
 *   en attente, masqué ou supprimé, jamais l'e-mail d'un signalant (aucun signalement n'est rendu).
 * - `author.tenant_since` : le début du premier bail honoré de l'auteur dans l'agence de l'avis
 *   (« Locataire depuis … »), `null` sans bail ou sans agence. Rendu ici, pas dans `ReviewResource`
 *   : la file paginée n'en paie pas une requête par ligne, et le public ne le lit jamais.
 *
 * Même périmètre que la file ({@see ReviewModerationScope::inQueueScope()}).
 */
class ReviewSubjectSummaryController extends Controller
{
    /** Le nombre d'autres avis rendus. */
    public const OTHERS = 3;

    /** La longueur de l'extrait d'un autre avis. */
    public const EXCERPT = 160;

    public function show(Request $request, Review $review): JsonResponse
    {
        $this->authorize('viewSubjectSummary', $review);

        $published = fn (): Builder => Review::query()
            ->where('reviewable_type', $review->reviewable_type)
            ->where('reviewable_id', $review->reviewable_id)
            ->where('is_approved', true);

        $aggregate = $published()->selectRaw('COUNT(*) AS n, AVG(rating) AS avg')->toBase()->first();
        $count = (int) ($aggregate->n ?? 0);

        $others = $published()
            ->whereKeyNot($review->getKey())
            ->with('author:id,first_name,last_name,username')
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->limit(self::OTHERS)
            ->get(['id', 'author_id', 'rating', 'title', 'content', 'created_at'])
            ->map(fn (Review $other): array => [
                'id' => $other->id,
                'rating' => (int) $other->rating,
                'excerpt' => Str::limit(trim((string) ($other->content ?: $other->title)), self::EXCERPT),
                'author_name' => $other->author
                    ? (trim(($other->author->first_name ?? '').' '.($other->author->last_name ?? '')) ?: ($other->author->username ?: null))
                    : null,
                'created_at' => $this->instant($other->created_at),
            ])
            ->values()
            ->all();

        return $this->json([
            'data' => [
                'review_id' => $review->id,
                'subject' => [
                    'type' => $review->reviewable_type,
                    'id' => $review->reviewable_id,
                    'average_rating' => $count === 0 ? null : round((float) $aggregate->avg, 1),
                    'reviews_count' => $count,
                ],
                'others' => $others,
                'author' => [
                    'id' => $review->author_id,
                    'tenant_since' => $this->calendarDate($this->tenantSince($review)),
                ],
            ],
        ]);
    }

    /** Le début du premier bail honoré de l'auteur dans l'agence de l'avis (celle du bail, ou de son bien). */
    private function tenantSince(Review $review): ?Carbon
    {
        if ($review->agency_id === null || $review->author_id === null) {
            return null;
        }

        $agencyId = (int) $review->agency_id;
        $start = Lease::query()
            ->whereIn('status', [...ReviewEligibility::LEASE_STATUSES, LeaseStatus::Renewed])
            ->whereHas('tenant', fn (Builder $q) => $q->where('user_id', $review->author_id))
            ->where(fn (Builder $q) => $q->where('leases.agency_id', $agencyId)
                ->orWhereHas('property', fn (Builder $p) => $p->where('agency_id', $agencyId)))
            ->min('start_date');

        return $start === null ? null : Carbon::parse($start);
    }
}
