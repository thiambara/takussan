<?php

namespace App\Services\Review;

use App\Models\Enums\ReviewStatus;
use App\Models\Review;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class ReviewModerationService
{
    /** Le code du motif de la décision en cours, recopié dans `metadata` (ADR-0043 §7). */
    private ?string $reasonCode = null;

    public function approve(Review $review, User $actor): Review
    {
        $this->assertTransition($review, ReviewStatus::Approved);

        $review->update([
            'status' => ReviewStatus::Approved,
            'is_approved' => true,
            'approved_at' => now(),
            'approved_by_id' => $actor->id,
        ]);

        return $review->refresh();
    }

    public function reject(Review $review, User $actor, ?string $reason = null): Review
    {
        $this->assertTransition($review, ReviewStatus::Rejected);

        $attributes = [
            'status' => ReviewStatus::Rejected,
            'is_approved' => false,
        ];

        if (($reason !== null && $reason !== '') || $this->reasonCode !== null) {
            $attributes['metadata'] = $this->moderationMetadata($review, $actor, $reason);
        }

        $review->update($attributes);

        return $review->refresh();
    }

    /**
     * TCK-2672 — publier un lot d'avis (au plus 100), TOUT OU RIEN : une transaction, les lignes
     * verrouillées dans l'ordre des identifiants, et TOUTES les vérifications avant la première
     * écriture — un identifiant inconnu ou retiré, un avis qui n'est plus en attente, ou que
     * l'acteur ne peut pas trancher (une autre agence, un avis sur l'agence ou un prestataire)
     * → 422 `review.batch_not_moderatable`, et aucun avis ne change. Chaque avis publié l'est par
     * {@see self::approve()}, comme une décision unitaire (recompte et « Nouvel avis » par
     * l'observateur), et reçoit SA ligne de journal `review.moderated`.
     *
     * @param  list<int>  $ids
     * @return list<int> les identifiants publiés
     */
    public function approveBatch(array $ids, User $actor): array
    {
        $ids = array_values(array_unique(array_map('intval', $ids)));

        return DB::transaction(function () use ($ids, $actor): array {
            $reviews = Review::query()->whereIn('id', $ids)->orderBy('id')->lockForUpdate()->get();
            $scope = app(ReviewModerationScope::class);

            $refused = $reviews->count() !== count($ids) || $reviews->contains(
                fn (Review $review) => $review->status !== ReviewStatus::Pending
                    || ! $scope->canModerate($actor, $review, 'approve'),
            );
            abort_code_if($refused, 422, 'review.batch_not_moderatable');

            return $reviews->map(function (Review $review) use ($actor, $ids): int {
                $this->approve($review, $actor);

                activity('Review')
                    ->performedOn($review)
                    ->causedBy($actor)
                    ->withProperties(['decision' => 'approve', 'batch' => true, 'batch_size' => count($ids)])
                    ->event('review.moderated')
                    ->log('Avis publié');

                return (int) $review->id;
            })->all();
        });
    }

    /**
     * TCK-597 — la décision se prend SOUS VERROU de la ligne, relue fraîche : deux modérateurs qui
     * tranchent le même avis en même temps ne lisent plus tous deux « en attente ». Le second
     * trouve l'état terminal et reçoit le 422 de transition.
     *
     * @return array{review: Review, deleted: bool}
     */
    public function moderate(Review $review, User $actor, string $decision, ?string $reason = null, ?string $reasonCode = null): array
    {
        return DB::transaction(function () use ($review, $actor, $decision, $reason, $reasonCode): array {
            $locked = Review::query()->whereKey($review->getKey())->lockForUpdate()->firstOrFail();
            $this->reasonCode = $reasonCode;

            try {
                return match ($decision) {
                    'approve' => ['review' => $this->approve($locked, $actor), 'deleted' => false],
                    'reject', 'hide' => ['review' => $this->reject($locked, $actor, $reason), 'deleted' => false],
                    'delete', 'remove' => $this->remove($locked, $actor, $reason),
                    'ignore' => ['review' => $this->ignore($locked, $actor, $reason), 'deleted' => false],
                    default => abort_code(422, 'review.moderation_decision_invalid'),
                };
            } finally {
                $this->reasonCode = null;
            }
        });
    }

    /**
     * @return array{review: Review, deleted: true}
     */
    private function remove(Review $review, User $actor, ?string $reason): array
    {
        $this->assertTransition($review, ReviewStatus::Rejected);

        $review->update([
            'status' => ReviewStatus::Rejected,
            'is_approved' => false,
            'metadata' => $this->moderationMetadata($review, $actor, $reason),
        ]);
        $review->delete();

        return ['review' => $review, 'deleted' => true];
    }

    private function ignore(Review $review, User $actor, ?string $reason): Review
    {
        $metadata = $review->metadata ?? [];
        $metadata['ignored_reports_by_id'] = $actor->id;
        $metadata['ignored_reports_at'] = now()->toISOString();
        $metadata['ignored_reason'] = $reason;
        $metadata['ignored_reason_code'] = $this->reasonCode;

        $review->update(['metadata' => $metadata]);

        return $review->refresh();
    }

    /**
     * @return array<string,mixed>
     */
    private function moderationMetadata(Review $review, User $actor, ?string $reason): array
    {
        $metadata = $review->metadata ?? [];
        $metadata['moderation_reason'] = $reason;
        $metadata['moderation_reason_code'] = $this->reasonCode;
        $metadata['moderated_by_id'] = $actor->id;
        $metadata['moderated_at'] = now()->toISOString();

        return $metadata;
    }

    private function assertTransition(Review $review, ReviewStatus $target): void
    {
        $current = $review->status ?? ReviewStatus::Pending;
        abort_code_unless(
            $current->canTransitionTo($target),
            422,
            'review.status_transition_invalid',
            ['from' => $current->value, 'to' => $target->value]
        );
    }
}
