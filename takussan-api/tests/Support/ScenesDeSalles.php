<?php

namespace Tests\Support;

use App\Events\Booking\BookingRequested;
use App\Models\Agency;
use App\Models\Booking;
use App\Models\Conversation;
use App\Models\ConversationParticipant;
use App\Models\Customer;
use App\Models\Enums\CollaboratorRole;
use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\User;
use App\Services\Messaging\SallesDuFil;

/**
 * TCK-2960 — les scènes des salles : un bail d'agence (bailleur, agent, locataire avec compte) et une
 * réservation (candidat avec compte, propriétaire contact principal).
 */
trait ScenesDeSalles
{
    /**
     * @param  array<string, mixed>  $bail
     * @return array{agency: Agency, property: Property, landlord: User, agent: User, tenant: User, customer: Customer, lease: Lease}
     */
    protected function sceneDuBail(array $bail = []): array
    {
        $agency = Agency::factory()->create();
        $landlord = User::factory()->create();
        OwnerProfile::query()->firstOrCreate(['user_id' => $landlord->id, 'agency_id' => $agency->id]);
        $property = Property::factory()->create(['user_id' => $landlord->id, 'agency_id' => $agency->id]);
        $agent = $this->agentDe($agency);
        $tenant = User::factory()->create();
        $customer = Customer::factory()->create(['user_id' => $tenant->id, 'agency_id' => $agency->id]);
        $lease = Lease::factory()->create(array_merge([
            'property_id' => $property->id,
            'agency_id' => $agency->id,
            'landlord_id' => $landlord->id,
            'agent_id' => $agent->id,
            'tenant_id' => $customer->id,
            'status' => LeaseStatus::Active,
        ], $bail));

        return compact('agency', 'property', 'landlord', 'agent', 'tenant', 'customer', 'lease');
    }

    /** @return array{agency: Agency, property: Property, owner: User, candidat: User, customer: Customer, booking: Booking} */
    protected function sceneDeLaReservation(): array
    {
        $agency = Agency::factory()->create();
        $owner = User::factory()->create();
        OwnerProfile::query()->firstOrCreate(['user_id' => $owner->id, 'agency_id' => $agency->id]);
        $property = Property::factory()->create(['user_id' => $owner->id, 'agency_id' => $agency->id]);
        $candidat = User::factory()->create();
        $customer = Customer::factory()->create(['user_id' => $candidat->id, 'agency_id' => $agency->id]);
        $booking = Booking::factory()->create([
            'property_id' => $property->id,
            'customer_id' => $customer->id,
            'created_by_id' => $candidat->id,
            'agency_id' => $agency->id,
        ]);
        BookingRequested::dispatch($booking, $candidat->id);

        return compact('agency', 'property', 'owner', 'candidat', 'customer', 'booking');
    }

    protected function agentDe(Agency $agency): User
    {
        $user = User::factory()->create();
        AgentProfile::query()->create(['user_id' => $user->id, 'agency_id' => $agency->id]);

        return $user;
    }

    /** Un agent de l'agence du bien devient son collaborateur `agent` : le contact principal change. */
    protected function confierLeBienA(Property $property, User $agent): void
    {
        PropertyCollaborator::create([
            'property_id' => $property->id,
            'user_id' => $agent->id,
            'role' => CollaboratorRole::Agent->value,
            'invited_at' => now(),
        ]);
    }

    protected function salleDe(Lease|Booking $objet): ?Conversation
    {
        return app(SallesDuFil::class)->salleDe($objet);
    }

    /** @return list<int> les membres actifs de la salle, triés */
    protected function membresActifs(Conversation $salle): array
    {
        return ConversationParticipant::query()
            ->where('conversation_id', $salle->id)
            ->whereNull('left_at')
            ->orderBy('user_id')
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }

    /**
     * @param  list<User>  $users
     * @return list<int>
     */
    protected function ids(array $users): array
    {
        $ids = array_map(fn (User $u) => (int) $u->id, $users);
        sort($ids);

        return $ids;
    }
}
