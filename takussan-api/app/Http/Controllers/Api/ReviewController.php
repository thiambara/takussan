<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\IndexReceivedReviewsRequest;
use App\Http\Requests\Api\ModerateReviewRequest;
use App\Http\Requests\Api\ReplyReviewRequest;
use App\Http\Requests\Api\ReportReviewRequest;
use App\Http\Requests\Api\StoreForAgencyReviewRequest;
use App\Http\Requests\Api\StoreForPropertyReviewRequest;
use App\Http\Resources\ReviewResource;
use App\Models\Agency;
use App\Models\Enums\ReviewStatus;
use App\Models\Property;
use App\Models\Review;
use App\Models\User;
use App\Services\Review\ReceivedReviews;
use App\Services\Review\ReviewModerationScope;
use App\Services\Review\ReviewModerationService;
use App\Services\Review\ReviewNotifier;
use App\Services\Review\ReviewReportService;
use App\Support\VisitorFingerprint;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ReviewController extends Controller
{
    public function __construct(
        private readonly ReviewModerationService $moderationService,
        private readonly ReviewModerationScope $scope,
        private readonly ReviewNotifier $notifier,
    ) {}

    /** TCK-597 — plafond de `per_page` de la file : un client ne tire pas toute la table. */
    public const MAX_PER_PAGE = 100;

    /**
     * La file de modération des avis, et la liste « mes avis » de l'auteur.
     *
     * Supports `filter[moderation_status]=pending|flagged|approved|rejected`, `filter[reported]=1`,
     * `filter[subject_type]=…`, `filter[author_id]=me`, sort by `-reported_count`, `-created_at`.
     *
     * TCK-597 (ADR-0043 §1) — la file est CLOISONNÉE : le super-admin voit tout, l'admin d'agence
     * les seuls avis dont `reviews.agency_id` est l'agence de son profil actif, et `pending_count`
     * compte le même périmètre. `filter[author_id]=me` reste ouvert à tout auteur, sur ses seuls avis.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $authorFilter = $request->query('filter.author_id')
            ?? data_get($request->query('filter', []), 'author_id');

        $isSelfFilter = in_array($authorFilter, ['me', 'auth', (string) $user->id], true);
        if (! $isSelfFilter) {
            $this->authorize('viewModerationQueue', Review::class);
        }

        $query = Review::query()->with(['author', 'reviewable']);

        if ($isSelfFilter) {
            $query->where('author_id', $user->id);
        } else {
            $this->scope->restrict($query, $user);
            if ($authorFilter !== null && $authorFilter !== '') {
                $query->where('author_id', (int) $authorFilter);
            }
        }

        $status = $request->query('filter.moderation_status')
            ?? data_get($request->query('filter', []), 'moderation_status');
        if ($status) {
            // Map the UI statuses to internal ReviewStatus values.
            $statusMap = [
                'pending' => ReviewStatus::Pending,
                'flagged' => ReviewStatus::Reported,
                'reported' => ReviewStatus::Reported,
                'approved' => ReviewStatus::Approved,
                'rejected' => ReviewStatus::Rejected,
            ];
            if (isset($statusMap[$status])) {
                $query->where('status', $statusMap[$status]->value);
            }
        }

        $reported = $request->query('filter.reported')
            ?? data_get($request->query('filter', []), 'reported');
        if (in_array($reported, [1, '1', true, 'true'], true)) {
            $query->where('reported_count', '>', 0);
        }

        $subjectType = $request->query('filter.subject_type')
            ?? data_get($request->query('filter', []), 'subject_type');
        if ($subjectType) {
            $query->where('reviewable_type', $subjectType);
        }

        // Sorting — default surfaces the queue (most reported first, then fresh).
        $sort = (string) ($request->query('sort') ?? '-reported_count,-created_at');
        foreach (explode(',', $sort) as $spec) {
            $spec = trim($spec);
            if ($spec === '') {
                continue;
            }
            $direction = 'asc';
            if (str_starts_with($spec, '-')) {
                $direction = 'desc';
                $spec = substr($spec, 1);
            }
            if (in_array($spec, ['created_at', 'reported_count', 'rating', 'id'], true)) {
                $query->orderBy($spec, $direction);
            }
        }

        $perPage = max(1, min((int) $request->input('per_page', 20), self::MAX_PER_PAGE));
        $paginator = $query->paginate($perPage);

        // Meta — le compteur de la file, dans le MÊME périmètre que la liste.
        $pendingCount = $isSelfFilter
            ? Review::query()->where('author_id', $user->id)
                ->whereIn('status', [ReviewStatus::Pending->value, ReviewStatus::Reported->value])
                ->count()
            : $this->scope->pendingCount($user);

        return $this->json([
            'data' => ReviewResource::collection($paginator)->toArray($request),
            'meta' => $this->paginationMeta($paginator, ['pending_count' => $pendingCount]),
        ]);
    }

    /**
     * Unified moderation endpoint — admin queue uses this rather than the
     * split approve/reject/hide legacy routes. Body: `{ decision, reason? }`.
     */
    public function moderate(ModerateReviewRequest $request, Review $review): JsonResponse
    {
        $data = $request->validated();

        $result = $this->moderationService->moderate(
            $review,
            $request->user(),
            $data['decision'],
            $data['reason'] ?? null,
            $data['reason_code'] ?? null,
        );

        if ($result['deleted']) {
            return $this->json([
                'data' => ['id' => $review->id, 'deleted' => true],
            ]);
        }

        return $this->json([
            'data' => ReviewResource::make($result['review'])->toArray($request),
        ]);
    }

    /**
     * List the reports filed against a review — used by the admin detail
     * panel. Joins reporter user data when possible.
     *
     * TCK-597 — l'empreinte d'un signalant anonyme n'est jamais rendue : il est « anonyme ».
     */
    public function reports(Request $request, Review $review): JsonResponse
    {
        $this->authorize('viewReports', $review);

        $reports = collect($review->metadata['reports'] ?? [])
            ->map(function (array $r): array {
                $userId = isset($r['user_id']) ? (int) $r['user_id'] : null;
                $user = $userId ? User::find($userId) : null;

                return [
                    'user_id' => $userId,
                    'anonymous' => $userId === null,
                    'user' => $user ? [
                        'id' => $user->id,
                        'name' => $user->full_name ?: $user->email,
                        'email' => $user->email,
                    ] : null,
                    'reason' => $r['reason'] ?? null,
                    'reported_at' => $r['reported_at'] ?? null,
                ];
            })
            ->values()
            ->all();

        return $this->json([
            'data' => $reports,
            'meta' => ['total' => count($reports)],
        ]);
    }

    public function indexForProperty(Request $request, Property $property): JsonResponse
    {
        $reviews = $property->reviews()
            ->where('is_approved', true)
            ->latest()
            ->paginate((int) $request->input('per_page', 10));

        return $this->json([
            'data' => ReviewResource::collection($reviews)->toArray($request),
            'meta' => $this->paginationMeta($reviews),
        ]);
    }

    /**
     * TCK-597 (AC7) — `GET /api/reviews/received` : la boîte des avis reçus de l'acteur (agent,
     * bailleur publieur, prestataire, admin d'agence), filtrée côté serveur, une seule requête.
     */
    public function received(IndexReceivedReviewsRequest $request, ReceivedReviews $received): JsonResponse
    {
        $filters = $request->validated('filter', []);

        $query = $received->for($request->user())
            ->with(['author.media', 'reviewable'])
            ->latest('reviews.created_at')
            ->latest('reviews.id');

        if (isset($filters['property_id'])) {
            $query->where('reviews.reviewable_type', Property::class)
                ->where('reviews.reviewable_id', (int) $filters['property_id']);
        }
        if (isset($filters['replied'])) {
            $replied = filter_var($filters['replied'], FILTER_VALIDATE_BOOLEAN);
            $replied ? $query->whereNotNull('reviews.reply_content') : $query->whereNull('reviews.reply_content');
        }
        if (isset($filters['status'])) {
            $query->where('reviews.status', $filters['status']);
        }
        if (isset($filters['subject_type'])) {
            $query->where('reviews.reviewable_type', IndexReceivedReviewsRequest::SUBJECT_TYPES[$filters['subject_type']]);
        }

        $paginator = $query->paginate((int) $request->validated('per_page', 20));

        return $this->json([
            'data' => ReviewResource::collection($paginator->getCollection())->toArray($request),
            'meta' => $this->paginationMeta($paginator),
        ]);
    }

    public function storeForProperty(StoreForPropertyReviewRequest $request, Property $property): JsonResponse
    {
        $user = $request->user();

        // TCK-305 — l'éligibilité (réservation honorée ou bail) court dans
        // StoreForPropertyReviewRequest::authorize(), donc AVANT la validation : un appel non
        // éligible ET mal formé doit rendre 403, pas 422. Le 422 ci-dessous reste ici — « déjà
        // noté » n'est pas un refus d'accès mais un état métier.
        $alreadyReviewed = $property->reviews()->where('author_id', $user->id)->exists();
        abort_code_if($alreadyReviewed, 422, 'review.property_already_reviewed');

        $data = $request->validated();

        $review = $property->reviews()->create(array_merge($data, [
            'author_id' => $user->id,
            'is_approved' => false,
            'status' => ReviewStatus::Pending,
            'metadata' => $this->creationMetadata($request),
        ]));
        $this->notifier->toModerate($review);

        return $this->json(['data' => ReviewResource::make($review)->toArray($request)], 201);
    }

    /**
     * TCK-078 — delete the reply authored by the property/agency owner
     * (or an admin) on a review. Keeps the review itself intact; only the
     * `reply_content` block is wiped so the public view reverts to a
     * "no reply yet" state.
     */
    public function deleteReply(Request $request, Review $review): JsonResponse
    {
        // TCK-597 — `ReviewPolicy::deleteReply` : la clause `agency_id === $user->agency_id`
        // ouvrait le geste au bailleur de l'agence.
        $this->authorize('deleteReply', $review);

        abort_code_if($review->reply_content === null, 404, 'review.no_reply');

        $review->update([
            'reply_content' => null,
            'replied_by_id' => null,
            'replied_at' => null,
        ]);

        return $this->json(['data' => ReviewResource::make($review->refresh())->toArray($request)]);
    }

    public function reply(ReplyReviewRequest $request, Review $review): JsonResponse
    {
        $user = $request->user();

        // Rejected is a terminal state: no public-facing view, no reply.
        // Reply is not a ReviewStatus transition so assertTransition() does
        // not fit — just guard directly on the terminal state.
        abort_code_if(
            ($review->status ?? ReviewStatus::Pending) === ReviewStatus::Rejected,
            422,
            'review.reply_rejected'
        );

        $data = $request->validated();

        $review->update([
            'reply_content' => $data['reply_content'],
            'replied_by_id' => $user->id,
            'replied_at' => now(),
        ]);

        return $this->json(['data' => ReviewResource::make($review->refresh())->toArray($request)]);
    }

    public function approve(Request $request, Review $review): JsonResponse
    {
        $this->authorize('moderate', $review);

        $review = $this->moderationService->approve($review, $request->user());

        return $this->json(['data' => ReviewResource::make($review)->toArray($request)]);
    }

    public function reject(Request $request, Review $review): JsonResponse
    {
        $this->authorize('moderate', $review);

        $review = $this->moderationService->reject($review, $request->user());

        return $this->json(['data' => ReviewResource::make($review)->toArray($request)]);
    }

    public function indexForAgency(Request $request, Agency $agency): JsonResponse
    {
        $reviews = $agency->reviews()
            ->where('is_approved', true)
            ->latest()
            ->paginate((int) $request->input('per_page', 10));

        return $this->json([
            'data' => ReviewResource::collection($reviews)->toArray($request),
            'meta' => $this->paginationMeta($reviews),
        ]);
    }

    public function storeForAgency(StoreForAgencyReviewRequest $request, Agency $agency): JsonResponse
    {
        $user = $request->user();

        // TCK-305 — même raison que dans storeForProperty() ci-dessus.
        $alreadyReviewed = $agency->reviews()->where('author_id', $user->id)->exists();
        abort_code_if($alreadyReviewed, 422, 'review.agency_already_reviewed');

        $data = $request->validated();

        $review = $agency->reviews()->create(array_merge($data, [
            'author_id' => $user->id,
            'is_approved' => false,
            'status' => ReviewStatus::Pending,
            'metadata' => $this->creationMetadata($request),
        ]));
        $this->notifier->toModerate($review);

        return $this->json(['data' => ReviewResource::make($review)->toArray($request)], 201);
    }

    public function report(ReportReviewRequest $request, Review $review, ReviewReportService $reports): JsonResponse
    {
        // TCK-597 — la règle (dédoublonnage, seuil) vit dans `ReviewReportService`, partagée avec
        // la route publique sans compte.
        $reports->report($review, $request->user(), VisitorFingerprint::of($request), $request->validated('reason'));

        return $this->json(['message' => __('messages.review_reported')]);
    }

    /**
     * TCK-597 (ADR-0043 §6) — l'empreinte de l'adresse d'où l'avis est déposé, jamais l'IP en
     * clair : elle sert à repérer des avis d'auteurs différents venus de la même adresse.
     *
     * @return array<string, mixed>
     */
    private function creationMetadata(Request $request): array
    {
        return ['ip_hash' => VisitorFingerprint::of($request)];
    }
}
