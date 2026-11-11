<?php

namespace App\Listeners\Lease;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Events\Lease\LeaseRentReviewed;
use App\Services\Model\NotificationService;
use App\Services\Notifications\NotificationRenderer;

/**
 * TCK-2642 — une révision de loyer prévient aussi le BAILLEUR du bail (`landlord_id`), en cloche et
 * par e-mail selon ses préférences (`lease_rent_reviewed`, l'interrupteur de l'avis du locataire,
 * {@see NotifyTenantOfRentReview}). Il n'est pas prévenu de son propre geste : quand c'est lui qui
 * révise, l'avis ne part pas.
 *
 * Écouteur découvert par Laravel (`app/Listeners`) : aucun `listen()` ne l'inscrit.
 */
class NotifyLandlordOfRentReview
{
    public function __construct(private readonly NotificationService $notifications) {}

    public function handle(LeaseRentReviewed $event): void
    {
        $lease = $event->lease;
        $lease->loadMissing(['landlord', 'property']);
        $landlord = $lease->landlord;
        if ($landlord === null || (int) $landlord->id === (int) $event->actor->id) {
            return;
        }

        $this->notifications->send($landlord, NotificationCode::LeaseRentReviewedLandlord, [
            'reference' => $lease->reference_number ?? '#'.$lease->id,
            'property' => $lease->property?->title,
            'old' => NotificationRenderer::money($event->oldRent, $lease->currency),
            'new' => NotificationRenderer::money($event->newRent, $lease->currency),
            'effective_date' => $event->effectiveDate,
        ], NotificationTarget::of('lease', $lease->id));
    }
}
