<?php

namespace App\Services\Review;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\CollaboratorRole;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\VisitStatus;
use App\Models\Lease;
use App\Models\MaintenanceRequest;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\PropertyVisit;
use App\Models\Review;
use App\Models\User;
use App\Rules\PersonnelDeLAgence;
use App\Services\Membership\MembershipCapabilityResolver;
use App\Services\Property\BailleurDuBien;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * TCK-597 (ADR-0043 §3) — QUI peut noter QUOI, et sur quelle PREUVE. Écrit une fois, lu par les
 * `authorize()` des quatre FormRequest de dépôt et par `GET /api/me/review-opportunities`.
 *
 *  - bien : une réservation `confirmed`/`completed` ou un bail `active`/`terminating`/`terminated`/`expired`
 *    dont l'auteur est le client (règle existante) ;
 *  - agent : une visite `completed` qu'il a menée, ou un bail / une réservation honorés dont il est
 *    un sujet « agent » (TCK-2062, amendement d'ADR-0043 du 2026-10-23, cf. {@see self::agentSubjectIds()})
 *    — jamais soi-même, jamais le bailleur ;
 *  - agence : un bail de l'agence dont l'auteur est le locataire (règle existante, tout statut) ;
 *  - prestataire : une intervention `completed`/`closed` qui lui était assignée, notée par son
 *    demandeur ou par le personnel de l'agence du bien.
 */
class ReviewEligibility
{
    public const BOOKING_STATUSES = [BookingStatus::Completed, BookingStatus::Confirmed];

    /** TCK-1804 (P162.07) — le préavis compris : l'avis est ouvert avant comme après lui. */
    public const LEASE_STATUSES = [LeaseStatus::Active, LeaseStatus::Terminating, LeaseStatus::Terminated, LeaseStatus::Expired];

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

        $visit = $this->visitsOf($author)->where('agent_id', $agent->id)->first();
        if ($visit !== null) {
            return $visit;
        }

        foreach ([...$this->leasesOf($author)->get(), ...$this->bookingsOf($author)->get()] as $proof) {
            if (in_array($agent->id, $this->agentSubjectIds($proof), true)) {
                return $proof;
            }
        }

        return null;
    }

    /**
     * TCK-2062 (P160.05, ADR-0043 amendement du 2026-10-23) — les sujets « agent » d'un bail ou d'une
     * réservation honorés : l'agent du bail (`leases.agent_id`, une réservation n'en a pas), les
     * collaborateurs acceptés `agent`/`manager` encore du personnel de l'agence du bien, le créateur
     * du bien s'il en est du personnel. Jamais le bailleur, même s'il figure parmi eux : le bailleur
     * du bail, et quiconque tient un profil propriétaire dans l'agence du bien (l'hôte d'une agence
     * `individual` compris). Tout statut de profil propriétaire écarte : c'est la voie la plus
     * étroite, celle de {@see BailleurDuBien::est()}.
     *
     * `properties.user_id` était pris tel quel : sur le bien d'un bailleur, le locataire était invité
     * à noter son bailleur comme agent, et ne pouvait pas noter l'agent de son bail.
     *
     * @return list<int>
     */
    private function agentSubjectIds(Lease|Booking $proof): array
    {
        $property = Property::withTrashed()->whereKey($proof->property_id)->first(['id', 'user_id', 'agency_id']);
        if ($property === null) {
            return [];
        }
        $agencyId = $property->agency_id !== null ? (int) $property->agency_id : null;

        $candidates = [];
        if ($proof instanceof Lease && $proof->agent_id !== null) {
            $candidates[] = (int) $proof->agent_id;
        }
        if ($agencyId !== null) {
            $collaborators = PropertyCollaborator::query()
                ->with('user')
                ->where('property_id', $property->id)
                ->whereNotNull('accepted_at')
                ->whereIn('role', [CollaboratorRole::Agent->value, CollaboratorRole::Manager->value])
                ->orderBy('id')
                ->get();
            foreach ($collaborators as $collaborator) {
                if (PersonnelDeLAgence::estPersonnel($collaborator->user, $agencyId)) {
                    $candidates[] = (int) $collaborator->user_id;
                }
            }
            if ($property->user_id !== null && PersonnelDeLAgence::estPersonnel(User::query()->find($property->user_id), $agencyId)) {
                $candidates[] = (int) $property->user_id;
            }
        }

        $landlordId = $proof instanceof Lease && $proof->landlord_id !== null ? (int) $proof->landlord_id : null;
        $owners = $agencyId === null ? [] : OwnerProfile::query()
            ->where('agency_id', $agencyId)
            ->whereIn('user_id', $candidates)
            ->pluck('user_id')->map(fn ($id) => (int) $id)->all();

        return array_values(array_unique(array_filter(
            $candidates,
            fn (int $id) => $id !== $landlordId && ! in_array($id, $owners, true),
        )));
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

        $leases = $this->leasesOf($author)->with('property.agency')->get();
        $bookings = $this->bookingsOf($author)->with('property')->get();
        $visits = $this->visitsOf($author)->whereNotNull('agent_id')->with('agent', 'property')->get();

        foreach ([...$bookings, ...$leases] as $proof) {
            $property = $proof->property;
            if ($property !== null && ! $done(Property::class, $property->id)) {
                $push('property', $property, ['title' => $property->title, 'slug' => $property->slug], $proof);
            }
        }
        foreach ([...$visits, ...$leases, ...$bookings] as $proof) {
            $agents = $proof instanceof PropertyVisit
                ? [$proof->agent]
                : User::query()->whereIn('id', $this->agentSubjectIds($proof))->orderBy('id')->get()->all();
            foreach ($agents as $agent) {
                if ($agent !== null && $agent->id !== $author->id && ! $done(User::class, $agent->id)) {
                    $push('agent', $agent, ['title' => $agent->full_name, 'slug' => $agent->username], $proof);
                }
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
