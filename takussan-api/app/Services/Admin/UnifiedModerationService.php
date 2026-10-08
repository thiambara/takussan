<?php

namespace App\Services\Admin;

use App\Exceptions\ApiError;
use App\Models\Agency;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\ReviewStatus;
use App\Models\ModerationClaim;
use App\Models\Property;
use App\Models\PropertyReport;
use App\Models\Review;
use App\Models\User;
use App\Services\Property\PropertyModerationService;
use App\Services\Review\ReviewModerationService;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class UnifiedModerationService
{
    public function __construct(
        private readonly PropertyModerationService $propertyModeration,
        private readonly ReviewModerationService $reviewModeration,
    ) {}

    /**
     * @param  array<string,mixed>  $filters
     */
    public function paginate(array $filters = [], string $sort = '-reported_at', int $perPage = 20): LengthAwarePaginator
    {
        $query = DB::query()->fromSub($this->unionQuery(), 'moderation_items');

        if ($type = $filters['type'] ?? null) {
            $query->where('type', $type);
        }

        if ($status = $filters['status'] ?? null) {
            $query->where('status', $status);
        }

        if ($agencyId = $filters['agency_id'] ?? null) {
            $query->where('agency_id', (int) $agencyId);
        }

        $direction = str_starts_with($sort, '-') ? 'desc' : 'asc';
        $column = ltrim($sort, '-');
        if (! in_array($column, ['reported_at', 'created_at'], true)) {
            $column = 'reported_at';
            $direction = 'desc';
        }

        $paginator = $query
            ->orderBy($column, $direction)
            ->orderBy('source_id', 'desc')
            ->paginate(max(1, min($perPage, 100)));

        $paginator->setCollection($this->hydrateItems($paginator->getCollection()));

        return $paginator;
    }

    /**
     * TCK-597 (ADR-0043 §4) — les décisions valides PAR TYPE d'élément. Avant, `hide`/`remove` sur
     * un bien en attente tombaient dans `reject`, et toute décision sur un signalement posait
     * `resolved_at` sans toucher l'annonce.
     */
    public const DECISIONS = [
        'property' => ['approve', 'reject'],
        'property_report' => ['hide', 'remove', 'reject'],
        'review' => ['approve', 'hide', 'remove'],
    ];

    /**
     * TCK-597 (ADR-0043 §7) — aucune décision ne se joue deux fois. La ligne source est verrouillée
     * (la ligne, jamais un agrégat : piège PostgreSQL n° 2), puis : déjà tranchée → 409
     * `moderation.already_decided` ; tenue par un autre modérateur dont la prise court encore →
     * 409 `moderation.claimed_by_other`. La prise est rendue avec la décision.
     *
     * @return array<string,mixed>
     */
    public function decide(string $queueId, User $actor, string $decision, ?string $reason, ?string $reasonCode = null): array
    {
        [$sourceType, $sourceId] = $this->parseQueueId($queueId);

        abort_code_unless(
            in_array($decision, self::DECISIONS[$sourceType] ?? [], true),
            422,
            'moderation.decision_invalid_for_type'
        );

        return DB::transaction(function () use ($queueId, $sourceType, $sourceId, $actor, $decision, $reason, $reasonCode): array {
            abort_code_unless($this->lockSource($sourceType, $sourceId), 409, 'moderation.already_decided');
            $this->assertNotClaimedByOther($queueId, $actor);

            $subject = match ($sourceType) {
                'property' => $this->decideProperty(Property::findOrFail($sourceId), $actor, $decision, $reason ?? $reasonCode),
                'property_report' => $this->decidePropertyReport(PropertyReport::findOrFail($sourceId), $actor, $decision, $reason, $reasonCode),
                'review' => $this->decideReview(Review::findOrFail($sourceId), $actor, $decision, $reason, $reasonCode),
            };

            ModerationClaim::query()->where('item_key', $queueId)->delete();

            activity('Admin')
                ->performedOn($subject)
                ->causedBy($actor)
                ->withProperties([
                    'decision' => $decision,
                    'subject_type' => $subject->getMorphClass(),
                    'subject_id' => $subject->getKey(),
                    'reason' => $reason,
                    'reason_code' => $reasonCode,
                    'moderation_item_id' => $queueId,
                ])
                ->event('super_admin_moderation_decision')
                ->log('Décision de modération super-admin');

            return [
                'id' => $queueId,
                'decision' => $decision,
                'subject_type' => $subject->getMorphClass(),
                'subject_id' => $subject->getKey(),
            ];
        });
    }

    /**
     * TCK-597 (ADR-0043 §7) — une décision et un motif communs à au plus 50 éléments. Chaque
     * élément est tranché dans SA transaction : un élément déjà tranché ou tenu par un autre
     * n'annule pas les autres, il est rendu en échec avec son code.
     *
     * @param  list<string>  $queueIds
     * @return list<array<string,mixed>>
     */
    public function decideBatch(array $queueIds, User $actor, string $decision, ?string $reason, ?string $reasonCode = null): array
    {
        return collect($queueIds)->unique()->values()->map(function (string $queueId) use ($actor, $decision, $reason, $reasonCode): array {
            try {
                return ['ok' => true] + $this->decide($queueId, $actor, $decision, $reason, $reasonCode);
            } catch (ApiError $e) {
                return ['id' => $queueId, 'ok' => false, 'status' => $e->getStatusCode(), 'code' => $e->errorCode];
            } catch (ModelNotFoundException) {
                return ['id' => $queueId, 'ok' => false, 'status' => 404, 'code' => 'http.not_found'];
            } catch (ValidationException) {
                return ['id' => $queueId, 'ok' => false, 'status' => 422, 'code' => 'moderation.item_id_invalid'];
            }
        })->all();
    }

    /**
     * TCK-597 (ADR-0043 §7) — prendre en charge un élément pour {@see ModerationClaim::DURATION_MINUTES}
     * minutes. Reprendre sa propre prise la prolonge ; une prise expirée d'un autre est reprise.
     */
    public function claim(string $queueId, User $actor): ModerationClaim
    {
        [$sourceType, $sourceId] = $this->parseQueueId($queueId);

        return DB::transaction(function () use ($queueId, $sourceType, $sourceId, $actor): ModerationClaim {
            abort_code_unless($this->lockSource($sourceType, $sourceId), 409, 'moderation.already_decided');

            $now = now();
            // Deux prises simultanées : l'unicité de `item_key` en garde une, la relecture
            // verrouillée départage (une exception attendue n'est pas un mécanisme de contrôle).
            ModerationClaim::query()->insertOrIgnore([
                'item_key' => $queueId,
                'claimed_by_id' => $actor->id,
                'claimed_at' => $now,
                'expires_at' => $now->copy()->addMinutes(ModerationClaim::DURATION_MINUTES),
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            $claim = ModerationClaim::query()->where('item_key', $queueId)->lockForUpdate()->firstOrFail();
            abort_code_if(
                $claim->claimed_by_id !== $actor->id && $claim->isActive(),
                409,
                'moderation.claimed_by_other'
            );

            $claim->forceFill([
                'claimed_by_id' => $actor->id,
                'claimed_at' => $now,
                'expires_at' => $now->copy()->addMinutes(ModerationClaim::DURATION_MINUTES),
            ])->save();

            return $claim->load('claimedBy');
        });
    }

    /** Rendre sa prise. Celle d'un autre, encore active, ne se rend pas : 409. */
    public function release(string $queueId, User $actor): void
    {
        $this->parseQueueId($queueId);

        DB::transaction(function () use ($queueId, $actor): void {
            $claim = ModerationClaim::query()->where('item_key', $queueId)->lockForUpdate()->first();
            if ($claim === null) {
                return;
            }

            abort_code_if(
                $claim->claimed_by_id !== $actor->id && $claim->isActive(),
                409,
                'moderation.claim_not_held'
            );

            $claim->delete();
        });
    }

    /** Verrouille la ligne source et dit si l'élément est encore OUVERT. Absente : 404. */
    private function lockSource(string $sourceType, int $sourceId): bool
    {
        return match ($sourceType) {
            'property' => (function () use ($sourceId): bool {
                $property = Property::withTrashed()->whereKey($sourceId)->lockForUpdate()->firstOrFail();

                return ! $property->trashed() && $property->status === PropertyStatus::PendingReview;
            })(),
            'property_report' => PropertyReport::query()->whereKey($sourceId)->lockForUpdate()->firstOrFail()->resolved_at === null,
            'review' => (function () use ($sourceId): bool {
                $review = Review::withTrashed()->whereKey($sourceId)->lockForUpdate()->firstOrFail();

                return ! $review->trashed() && in_array($review->status, [ReviewStatus::Pending, ReviewStatus::Reported], true);
            })(),
        };
    }

    private function assertNotClaimedByOther(string $queueId, User $actor): void
    {
        $claim = ModerationClaim::query()->where('item_key', $queueId)->lockForUpdate()->first();

        abort_code_if(
            $claim !== null && $claim->isActive() && $claim->claimed_by_id !== $actor->id,
            409,
            'moderation.claimed_by_other'
        );
    }

    private function unionQuery(): mixed
    {
        $properties = DB::table('properties as p')
            ->selectRaw("'property' as source_type")
            ->selectRaw('p.id as source_id')
            ->selectRaw("'property' as type")
            ->selectRaw("'pending' as status")
            ->selectRaw("'property' as subject_type")
            ->selectRaw('p.id as subject_id')
            ->selectRaw('p.agency_id as agency_id')
            ->selectRaw('p.user_id as reporter_id')
            ->selectRaw("COALESCE(p.rejection_reason, 'Bien en attente de validation') as reason")
            ->selectRaw('COALESCE(p.submitted_at, p.created_at) as reported_at')
            ->selectRaw('p.created_at as created_at')
            ->where('p.status', PropertyStatus::PendingReview->value)
            ->whereNull('p.deleted_at');

        $propertyReports = DB::table('property_reports as pr')
            ->join('properties as p', 'p.id', '=', 'pr.property_id')
            ->selectRaw("'property_report' as source_type")
            ->selectRaw('pr.id as source_id')
            ->selectRaw("'property' as type")
            ->selectRaw("'flagged' as status")
            ->selectRaw("'property' as subject_type")
            ->selectRaw('p.id as subject_id')
            ->selectRaw('p.agency_id as agency_id')
            ->selectRaw('pr.reporter_user_id as reporter_id')
            ->selectRaw('COALESCE(pr.details, pr.reason) as reason')
            ->selectRaw('pr.created_at as reported_at')
            ->selectRaw('pr.created_at as created_at')
            ->whereNull('pr.resolved_at')
            ->whereNull('p.deleted_at');

        $reviews = DB::table('reviews as r')
            ->leftJoin('properties as rp', function ($join) {
                $join->on('r.reviewable_id', '=', 'rp.id')
                    ->where('r.reviewable_type', Property::class);
            })
            ->leftJoin('agencies as ra', function ($join) {
                $join->on('r.reviewable_id', '=', 'ra.id')
                    ->where('r.reviewable_type', Agency::class);
            })
            ->selectRaw("'review' as source_type")
            ->selectRaw('r.id as source_id')
            ->selectRaw("'review' as type")
            ->selectRaw("CASE WHEN r.status = 'reported' THEN 'flagged' ELSE 'pending' END as status")
            ->selectRaw("'review' as subject_type")
            ->selectRaw('r.id as subject_id')
            ->selectRaw('COALESCE(rp.agency_id, ra.id) as agency_id')
            ->selectRaw('r.author_id as reporter_id')
            ->selectRaw("COALESCE(r.title, 'Avis en attente de validation') as reason")
            ->selectRaw('COALESCE(r.updated_at, r.created_at) as reported_at')
            ->selectRaw('r.created_at as created_at')
            ->whereIn('r.status', [ReviewStatus::Pending->value, ReviewStatus::Reported->value])
            ->whereNull('r.deleted_at');

        return $properties->unionAll($propertyReports)->unionAll($reviews);
    }

    /**
     * @param  Collection<int,object>  $rows
     * @return Collection<int,array<string,mixed>>
     */
    private function hydrateItems(Collection $rows): Collection
    {
        $propertyIds = $rows
            ->where('subject_type', 'property')
            ->pluck('subject_id')
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values();
        $reviewIds = $rows
            ->where('source_type', 'review')
            ->pluck('source_id')
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values();
        $userIds = $rows
            ->pluck('reporter_id')
            ->filter()
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values();
        $agencyIds = $rows
            ->pluck('agency_id')
            ->filter()
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values();

        $properties = Property::query()->with('agency')->whereIn('id', $propertyIds)->get()->keyBy('id');
        $reviews = Review::query()->with(['author', 'reviewable'])->whereIn('id', $reviewIds)->get()->keyBy('id');
        $users = User::query()->whereIn('id', $userIds)->get()->keyBy('id');
        $agencies = Agency::query()->whereIn('id', $agencyIds)->get()->keyBy('id');
        $claims = ModerationClaim::query()
            ->with('claimedBy')
            ->whereIn('item_key', $rows->map(fn (object $row) => "{$row->source_type}:{$row->source_id}"))
            ->where('expires_at', '>', now())
            ->get()
            ->keyBy('item_key');

        return $rows->map(function (object $row) use ($properties, $reviews, $users, $agencies, $claims): array {
            $sourceType = (string) $row->source_type;
            $sourceId = (int) $row->source_id;
            $subjectId = (int) $row->subject_id;
            $subject = null;
            $reportedCount = null;

            if ((string) $row->subject_type === 'property') {
                $property = $properties->get($subjectId);
                $subject = $property ? [
                    'id' => $property->id,
                    'title' => $property->title,
                    'subtitle' => $property->reference_number,
                    'href' => '/super-admin/properties?filter%5Bsearch%5D='.urlencode((string) $property->reference_number),
                ] : null;
            } elseif ($sourceType === 'review') {
                $review = $reviews->get($sourceId);
                $reviewable = $review?->reviewable;
                $subject = $review ? [
                    'id' => $review->id,
                    'title' => $review->title ?: 'Avis sans titre',
                    'subtitle' => $reviewable?->title ?? $reviewable?->name ?? null,
                    'href' => '/super-admin/moderation?filter%5Btype%5D=review',
                ] : null;
                $reportedCount = (int) ($review?->reported_count ?? 0);
            }

            $reporter = $users->get((int) ($row->reporter_id ?? 0));
            $agency = $agencies->get((int) ($row->agency_id ?? 0));
            $claim = $claims->get("{$sourceType}:{$sourceId}");

            return [
                'id' => "{$sourceType}:{$sourceId}",
                'source_type' => $sourceType,
                'source_id' => $sourceId,
                'type' => (string) $row->type,
                'status' => (string) $row->status,
                'subject_type' => (string) $row->subject_type,
                'subject_id' => $subjectId,
                'subject' => $subject,
                'reporter' => $reporter ? [
                    'id' => $reporter->id,
                    'name' => $reporter->full_name ?: $reporter->email,
                    'email' => $reporter->email,
                ] : null,
                'agency' => $agency ? [
                    'id' => $agency->id,
                    'name' => $agency->name,
                    'slug' => $agency->slug,
                ] : null,
                'reason' => $this->reasonFor($sourceType, $sourceId, (string) ($row->reason ?? ''), $reviews),
                'reported_count' => $reportedCount,
                // TCK-597 (ADR-0043 §7) — qui tient l'élément, et jusqu'à quand.
                'claim' => $claim ? [
                    'by' => [
                        'id' => $claim->claimed_by_id,
                        'name' => $claim->claimedBy?->full_name ?: $claim->claimedBy?->email,
                    ],
                    'claimed_at' => $claim->claimed_at,
                    'expires_at' => $claim->expires_at,
                ] : null,
                'reported_at' => $row->reported_at,
                'created_at' => $row->created_at,
            ];
        });
    }

    /**
     * @param  Collection<int,Review>  $reviews
     */
    private function reasonFor(string $sourceType, int $sourceId, string $fallback, Collection $reviews): string
    {
        if ($sourceType !== 'review') {
            return $fallback;
        }

        $review = $reviews->get($sourceId);
        $reports = collect($review?->metadata['reports'] ?? []);
        $last = $reports->last();

        return (string) (($last['reason'] ?? null) ?: $fallback ?: 'Avis en attente de validation');
    }

    /**
     * @return array{0:string,1:int}
     */
    private function parseQueueId(string $queueId): array
    {
        if (! str_contains($queueId, ':')) {
            throw ValidationException::withMessages(['id' => __('errors.moderation.item_id_invalid')]);
        }

        [$sourceType, $rawId] = explode(':', $queueId, 2);
        if (! in_array($sourceType, ['property', 'property_report', 'review'], true) || ! ctype_digit($rawId)) {
            throw ValidationException::withMessages(['id' => __('errors.moderation.item_id_invalid')]);
        }

        return [$sourceType, (int) $rawId];
    }

    private function decideProperty(Property $property, User $actor, string $decision, ?string $reason): Property
    {
        if ($decision === 'approve') {
            return $this->propertyModeration->approve($property, $actor);
        }

        return $this->propertyModeration->reject($property, $actor, (string) $reason);
    }

    private function decidePropertyReport(PropertyReport $report, User $actor, string $decision, ?string $reason, ?string $reasonCode): Property
    {
        $this->propertyModeration->resolveReport($report, $actor, $decision, $reason, $reasonCode);

        return Property::withTrashed()->findOrFail($report->property_id);
    }

    private function decideReview(Review $review, User $actor, string $decision, ?string $reason, ?string $reasonCode): Review
    {
        // `remove` est le mot de la file ; le service des avis l'appelle `delete`.
        $result = $this->reviewModeration->moderate($review, $actor, $decision === 'remove' ? 'delete' : $decision, $reason, $reasonCode);

        return $result['review'];
    }
}
