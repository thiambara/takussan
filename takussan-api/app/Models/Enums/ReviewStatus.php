<?php

namespace App\Models\Enums;

/**
 * Moderation workflow for a Review.
 *
 * Allowed transitions:
 *   pending  → approved | rejected | reported
 *   reported → approved | rejected
 *   approved → reported | rejected
 *   rejected → (terminal)
 */
enum ReviewStatus: string
{
    case Pending = 'pending';
    case Approved = 'approved';
    case Rejected = 'rejected';
    case Reported = 'reported';

    /**
     * Return the list of statuses reachable from the current one.
     *
     * @return array<int,self>
     */
    public function allowedTransitions(): array
    {
        return match ($this) {
            self::Pending => [self::Approved, self::Rejected, self::Reported],
            self::Reported => [self::Approved, self::Rejected],
            self::Approved => [self::Reported, self::Rejected],
            self::Rejected => [],
        };
    }

    public function canTransitionTo(self $target): bool
    {
        return in_array($target, $this->allowedTransitions(), true);
    }
}
