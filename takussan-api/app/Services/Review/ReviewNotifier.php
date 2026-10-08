<?php

namespace App\Services\Review;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\ReviewStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\Property;
use App\Models\Review;
use App\Models\User;
use App\Services\Model\NotificationService;
use Illuminate\Support\Collection;

/**
 * TCK-597 (ADR-0043 §6) — qui apprend qu'un avis existe.
 *
 *  - **à modérer** : les admins actifs de l'agence qui le modère (`reviews.agency_id`), quand
 *    l'avis relève d'elle (bien ou agent) et qu'elle est `standard`. Rien pour la file plateforme :
 *    elle se consulte, elle ne sonne pas.
 *  - **reçu** : au passage `approved`, le SUJET — le publieur du bien, l'agent noté, les admins de
 *    l'agence notée, le prestataire noté. Jamais l'auteur.
 */
class ReviewNotifier
{
    public function __construct(private readonly NotificationService $notifications) {}

    public function toModerate(Review $review): void
    {
        if ($review->status !== ReviewStatus::Pending || $review->agency_id === null || ! $review->isAgencyModerated()) {
            return;
        }

        if (Agency::query()->whereKey($review->agency_id)->first(['id', 'kind'])?->kind !== AgencyKind::Standard) {
            return;
        }

        $this->send(
            $this->agencyAdmins($review->agency_id),
            $review,
            NotificationCode::ReviewToModerate,
            NotificationTarget::of('review_moderation'),
        );
    }

    public function received(Review $review): void
    {
        $subject = $review->reviewable;

        $recipients = match (true) {
            $subject instanceof Property => User::query()->whereKey($subject->user_id)->get(),
            $subject instanceof User => collect([$subject]),
            $subject instanceof Agency => $this->agencyAdmins($subject->id),
            $subject instanceof ServiceProviderProfile => User::query()->whereKey($subject->user_id)->get(),
            default => collect(),
        };

        $this->send($recipients, $review, NotificationCode::ReviewReceived, NotificationTarget::of('reviews'));
    }

    /** @return Collection<int, User> */
    private function agencyAdmins(int $agencyId): Collection
    {
        return User::query()
            ->whereIn('id', AgencyAdminProfile::query()->active()->where('agency_id', $agencyId)->select('user_id'))
            ->get();
    }

    /** @param  Collection<int, User>  $recipients */
    private function send(Collection $recipients, Review $review, NotificationCode $code, NotificationTarget $target): void
    {
        $params = ['subject' => $this->subjectLabel($review), 'rating' => (int) $review->rating];

        $recipients
            ->reject(fn (User $user) => $user->id === $review->author_id)
            ->unique('id')
            ->each(fn (User $user) => $this->notifications->send($user, $code, $params, $target));
    }

    private function subjectLabel(Review $review): string
    {
        $subject = $review->reviewable;

        return (string) match (true) {
            $subject instanceof Property => $subject->title,
            $subject instanceof Agency => $subject->name,
            $subject instanceof User => trim(($subject->first_name ?? '').' '.($subject->last_name ?? '')) ?: $subject->username,
            $subject instanceof ServiceProviderProfile => $subject->user?->full_name,
            default => '',
        };
    }
}
