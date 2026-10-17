<?php

namespace App\Services\Property;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Property;
use App\Models\User;
use App\Observers\PropertyObserver;
use App\Services\Model\NotificationService;

/**
 * TCK-782 (P15.10) — qui apprend qu'un bien attend la modération de son agence : ses admins
 * actifs, sauf l'auteur du geste. Même règle que `ReviewNotifier::toModerate()` pour les avis.
 * Appelé par {@see PropertyObserver} au passage en `pending_review`, quelle que soit la voie
 * (création, publication, changement de statut, resoumission après refus).
 */
class PropertyModerationNotifier
{
    public function __construct(private readonly NotificationService $notifications) {}

    public function submitted(Property $property, ?User $actor): void
    {
        if ($property->agency_id === null) {
            return;
        }

        User::query()
            ->whereIn('id', AgencyAdminProfile::query()->active()->where('agency_id', $property->agency_id)->select('user_id'))
            ->when($actor !== null, fn ($query) => $query->whereKeyNot($actor->id))
            ->get()
            ->each(fn (User $admin) => $this->notifications->send(
                $admin,
                NotificationCode::PropertySubmittedForReview,
                ['property' => (string) $property->title],
                NotificationTarget::of('property_moderation'),
            ));
    }
}
