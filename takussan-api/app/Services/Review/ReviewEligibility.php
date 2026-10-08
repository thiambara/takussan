<?php

namespace App\Services\Review;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\VisitStatus;
use App\Models\Lease;
use App\Models\MaintenanceRequest;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\Review;
use App\Models\User;
use App\Services\Membership\MembershipCapabilityResolver;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * TCK-597 (ADR-0043 §3) — QUI peut noter QUOI, et sur quelle PREUVE. Écrit une fois, lu par les
 * `authorize()` des quatre FormRequest de dépôt et par `GET /api/me/review-opportunities`.
 *
 *  - bien : une réservation `confirmed`/`completed` ou un bail `active`/`terminated`/`expired`
 *    dont l'auteur est le client (règle existante) ;
 *  - agent : une visite `completed` qu'il a menée, ou un bail / une réservation honorés sur un bien
 *    qu'il a publié — jamais soi-même ;
 *  - agence : un bail de l'agence dont l'auteur est le locataire (règle existante, tout statut) ;
 *  - prestataire : une intervention `completed`/`closed` qui lui était assignée, notée par son
 *    demandeur ou par le personnel de l'agence du bien.
 */
class ReviewEligibility
{
    public const BOOKING_STATUSES = [BookingStatus::Completed, BookingStatus::Confirmed];

    public const LEASE_STATUSES = [LeaseStatus::Active, LeaseStatus::Terminated, LeaseStatus::Expired];

    public const MAINTENANCE_STATUSES = [MaintenanceStatus::Completed, MaintenanceStatus::Closed];

    public function __construct(private readonly MembershipCapabilityResolver $memberships) {}

    /** La preuve (réservation ou bail) qui permet de noter le bien, ou `null`. */
    public function forProperty(User $author, Property $property): ?Model
    {
        return $this->bookingsOf($author)->where('property_id', $property->id)->first()
            ?? $this->leasesOf($author)->where('property_id', $property->id)->first();
    }

    /** Règle existante, reprise telle quelle : un bail de l'agence, quel que soit son statut. */
    public function forAgency(User $author, Agency $agency): ?Lease
    {
        return $agency->leases()
            ->whereHas('tenant', fn ($q) => $q->where('user_id', $author->id))
            ->orderBy('id')
            ->first();
    }

    /** La preuve (visite, bail ou réservation) qui permet de noter l'agent, ou `null`. */
    public function forAgent(User $author, User $agent): ?Model
    {
        if ($author->id === $agent->id) {
            return null;
        }

        $published = Property::withTrashed()->select('id')->where('user_id', $agent->id);

        return $this->visitsOf($author)->where('agent_id', $agent->id)->first()
            ?? $this->leasesOf($author)->whereIn('property_id', $published)->first()
            ?? $this->bookingsOf($author)->whereIn('property_id', $published)->first();
    }

    public function forServiceProvider(User $author, ServiceProviderProfile $provider, ?MaintenanceRequest $intervention): bool
    {
        if ($intervention === null
            || $author->id === $provider->user_id
            || (int) $intervention->assigned_to !== (int) $provider->user_id
            || ! in_array($intervention->status, self::MAINTENANCE_STATUSES, true)) {
            return false;
        }

        if ((int) $intervention->requester_id === $author->id) {
            return true;
        }

        $agencyId = Property::withTrashed()->whereKey($intervention->property_id)->value('agency_id');

        return $agencyId !== null && $this->memberships->isStaffAt($author, (int) $agencyId);
    }

    /**
     * Les sujets que l'auteur peut noter et n'a pas encore notés, avec leur preuve.
     *
     * @return list<array{type: string, subject: array<string, mixed>, context: array{type: string, id: int}}>
     */
    public function opportunities(User $author): array
    {
        // verif-597 M2 — un avis retiré par la plateforme ferme l'invitation, comme un avis publié.
        $reviewed = Review::withTrashed()->where('author_id', $author->id)
            ->get(['reviewable_type', 'reviewable_id', 'context_type', 'context_id']);
        $done = fn (string $type, int $id) => $reviewed->contains(fn (Review $r) => $r->reviewable_type === $type && (int) $r->reviewable_id === $id);

        $items = [];
        $push = function (string $kind, Model $subject, array $label, Model $proof) use (&$items): void {
            $key = $kind.':'.$subject->getKey().($kind === 'service_provider' ? ':'.$proof->getKey() : '');
            $items[$key] ??= [
                'type' => $kind,
                'subject' => ['id' => $subject->getKey()] + $label,
                'context' => ['type' => self::contextKind($proof), 'id' => (int) $proof->getKey()],
            ];
        };

        $leases = $this->leasesOf($author)->with('property.agency', 'property.owner')->get();
        $bookings = $this->bookingsOf($author)->with('property.owner')->get();
        $visits = $this->visitsOf($author)->whereNotNull('agent_id')->with('agent', 'property')->get();

        foreach ([...$bookings, ...$leases] as $proof) {
            $property = $proof->property;
            if ($property !== null && ! $done(Property::class, $property->id)) {
                $push('property', $property, ['title' => $property->title, 'slug' => $property->slug], $proof);
            }
        }
        foreach ([...$visits, ...$leases, ...$bookings] as $proof) {
            $agent = $proof instanceof PropertyVisit ? $proof->agent : $proof->property?->owner;
            if ($agent !== null && $agent->id !== $author->id && ! $done(User::class, $agent->id)) {
                $push('agent', $agent, ['title' => $agent->full_name, 'slug' => $agent->username], $proof);
            }
        }
        foreach ($leases as $lease) {
            $agency = $lease->property?->agency;
            if ($agency !== null && ! $done(Agency::class, $agency->id)) {
                $push('agency', $agency, ['title' => $agency->name, 'slug' => $agency->slug], $lease);
            }
        }

        $interventions = MaintenanceRequest::query()
            ->where('requester_id', $author->id)
            ->whereIn('status', self::MAINTENANCE_STATUSES)
            ->whereNotNull('assigned_to')
            ->get();
        $providers = ServiceProviderProfile::query()->with('user')
            ->whereIn('user_id', $interventions->pluck('assigned_to'))->get()->keyBy('user_id');
        foreach ($interventions as $intervention) {
            $provider = $providers->get($intervention->assigned_to);
            $already = $reviewed->contains(fn (Review $r) => $r->context_type === MaintenanceRequest::class && (int) $r->context_id === $intervention->id);
            if ($provider !== null && $provider->user_id !== $author->id && ! $already) {
                $push('service_provider', $provider, ['title' => $provider->user?->full_name, 'slug' => null], $intervention);
            }
        }

        return array_values($items);
    }

    public static function contextKind(Model $proof): string
    {
        return match (true) {
            $proof instanceof PropertyVisit => 'visit',
            $proof instanceof Lease => 'lease',
            $proof instanceof Booking => 'booking',
            $proof instanceof MaintenanceRequest => 'maintenance_request',
        };
    }

    /** @return Builder<Booking> */
    private function bookingsOf(User $author): Builder
    {
        return Booking::query()
            ->whereIn('status', self::BOOKING_STATUSES)
            ->whereHas('customer', fn ($q) => $q->where('user_id', $author->id))
            ->orderBy('id');
    }

    /** @return Builder<Lease> */
    private function leasesOf(User $author): Builder
    {
        return Lease::query()
            ->whereIn('status', self::LEASE_STATUSES)
            ->whereHas('tenant', fn ($q) => $q->where('user_id', $author->id))
            ->orderBy('id');
    }

    /** @return Builder<PropertyVisit> */
    private function visitsOf(User $author): Builder
    {
        return PropertyVisit::query()
            ->where('status', VisitStatus::Completed)
            ->where(fn ($q) => $q->where('visitor_id', $author->id)
                ->orWhereHas('customer', fn ($c) => $c->where('user_id', $author->id)))
            ->orderBy('id');
    }
}
