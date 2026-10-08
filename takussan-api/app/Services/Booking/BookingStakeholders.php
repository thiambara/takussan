<?php

namespace App\Services\Booking;

use App\Models\Booking;
use App\Models\Enums\CollaboratorRole;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\User;
use App\Services\Membership\MembershipCapabilityResolver;
use Illuminate\Support\Collection;

/**
 * TCK-596 — les parties prenantes d'une réservation, résolues en UN endroit : la demande et
 * l'annulation préviennent les mêmes personnes, moins celles que chaque écouteur retire.
 *
 * - le client, s'il a un compte ;
 * - le bailleur (`properties.user_id`) ;
 * - l'auteur de la réservation, s'il est du personnel de l'agence de la réservation ;
 * - les collaborateurs ACCEPTÉS `manager` ou `agent` du bien.
 *
 * ⚠ Un collaborateur d'un bien d'agence n'est retenu que s'il est encore du personnel de cette
 * agence (ADR-0031 §1) : un agent retiré ou suspendu garde sa ligne de collaboration, et c'est
 * par elle qu'il recevrait encore la référence, le bien et les dates d'un séjour.
 */
final class BookingStakeholders
{
    /** @var list<CollaboratorRole> */
    private const COLLABORATOR_ROLES = [CollaboratorRole::Manager, CollaboratorRole::Agent];

    public function __construct(private readonly MembershipCapabilityResolver $membership) {}

    /** @return Collection<int, User> */
    public function for(Booking $booking): Collection
    {
        $booking->loadMissing(['customer.user', 'property.owner', 'createdBy']);

        $agencyId = $this->agencyId($booking);
        $people = collect([$booking->customer?->user, $booking->property?->owner]);

        $author = $booking->createdBy;
        if ($author !== null && $agencyId !== null && $this->membership->isStaffAt($author, $agencyId)) {
            $people->push($author);
        }

        if ($booking->property !== null) {
            $people = $people->merge($this->collaborators($booking, $agencyId));
        }

        return $people->filter()->unique('id')->values();
    }

    /**
     * Les collaborateurs acceptés `manager|agent`, dans l'ordre de la règle d'assignation de la
     * tâche de remboursement : les `manager` d'abord, puis les `agent`, par ancienneté.
     *
     * @return Collection<int, User>
     */
    public function collaborators(Booking $booking, ?int $agencyId = null): Collection
    {
        return $this->collaboratorsOf((int) $booking->property_id, $agencyId ?? $this->agencyId($booking));
    }

    /**
     * TCK-596 §3B — l'équipe d'un bien, sans réservation : le bailleur et ses collaborateurs
     * acceptés `manager|agent` encore personnel. Un conflit d'import iCal la prévient.
     *
     * @return Collection<int, User>
     */
    public function propertyTeam(Property $property): Collection
    {
        $property->loadMissing('owner');
        $agencyId = $property->agency_id !== null ? (int) $property->agency_id : null;

        return collect([$property->owner])
            ->merge($this->collaboratorsOf((int) $property->id, $agencyId))
            ->filter()
            ->unique('id')
            ->values();
    }

    /** @return Collection<int, User> */
    private function collaboratorsOf(int $propertyId, ?int $agencyId): Collection
    {
        return PropertyCollaborator::query()
            ->with('user')
            ->where('property_id', $propertyId)
            ->whereNotNull('accepted_at')
            ->whereIn('role', array_map(static fn (CollaboratorRole $r): string => $r->value, self::COLLABORATOR_ROLES))
            ->orderByRaw("CASE WHEN role = 'manager' THEN 0 ELSE 1 END")
            ->orderBy('id')
            ->get()
            ->map(static fn (PropertyCollaborator $c): ?User => $c->user)
            ->filter(fn (?User $user): bool => $user !== null
                && ($agencyId === null || $this->membership->isStaffAt($user, $agencyId)))
            ->values();
    }

    public function agencyId(Booking $booking): ?int
    {
        $id = $booking->agency_id ?? $booking->property?->agency_id;

        return $id !== null ? (int) $id : null;
    }
}
