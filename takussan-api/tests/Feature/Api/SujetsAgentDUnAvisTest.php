<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\CollaboratorRole;
use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\Review;
use App\Models\User;
use App\Services\Review\ReviewEligibility;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use RuntimeException;
use Tests\ApiTestCase;

/**
 * TCK-2062 (P160.05, ADR-0043 amendement du 2026-10-23) — les sujets « agent » qu'un bail ou une
 * réservation rendent notables : l'agent du bail, les collaborateurs `agent`/`manager` acceptés
 * encore du personnel, le créateur s'il est du personnel ; jamais le bailleur.
 *
 * Avant : le sujet « agent » était `properties.user_id` tel quel. Sur le bien d'un bailleur, le
 * locataire était invité à noter son bailleur comme agent, et ne pouvait pas noter l'agent du bail.
 */
class SujetsAgentDUnAvisTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $landlord;

    private User $leaseAgent;

    private User $collaborator;

    private User $client;

    private Customer $customer;

    private Property $property;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $this->agency = Agency::factory()->create();
        $this->landlord = User::factory()->create(['status' => 'active']);
        $this->materializeRoleProfile($this->landlord, 'owner', $this->agency);
        $this->leaseAgent = User::factory()->create(['status' => 'active']);
        $this->materializeRoleProfile($this->leaseAgent, 'agent', $this->agency);
        $this->collaborator = User::factory()->create(['status' => 'active']);
        $this->materializeRoleProfile($this->collaborator, 'agent', $this->agency);
        $this->client = User::factory()->create();
        $this->customer = Customer::factory()->create(['user_id' => $this->client->id]);

        $this->property = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->landlord->id]);
        PropertyCollaborator::query()->create([
            'property_id' => $this->property->id, 'user_id' => $this->collaborator->id,
            'role' => CollaboratorRole::Agent->value, 'invited_at' => now(), 'accepted_at' => now(),
        ]);
    }

    private function lease(): Lease
    {
        return Lease::factory()->create([
            'property_id' => $this->property->id, 'agency_id' => $this->agency->id,
            'landlord_id' => $this->landlord->id, 'agent_id' => $this->leaseAgent->id,
            'tenant_id' => $this->customer->id, 'status' => LeaseStatus::Active,
        ]);
    }

    /** @return list<int> */
    private function agentSubjects(User $author): array
    {
        return collect(app(ReviewEligibility::class)->opportunities($author))
            ->where('type', 'agent')->pluck('subject.id')->sort()->values()->all();
    }

    public function test_the_lease_agent_and_the_collaborator_are_proposed_never_the_landlord(): void
    {
        $lease = $this->lease();
        $eligibility = app(ReviewEligibility::class);

        $this->assertSame(collect([$this->leaseAgent->id, $this->collaborator->id])->sort()->values()->all(), $this->agentSubjects($this->client));
        $this->assertNull($eligibility->forAgent($this->client, $this->landlord), 'le bailleur n\'est pas noté comme agent');
        $this->assertTrue($lease->is($eligibility->forAgent($this->client, $this->leaseAgent)));
        $this->assertTrue($lease->is($eligibility->forAgent($this->client, $this->collaborator)));
    }

    public function test_a_suspended_collaborator_is_neither_proposed_nor_rateable(): void
    {
        $this->lease();
        AgentProfile::query()->where('user_id', $this->collaborator->id)->update(['status' => AgentProfileStatus::Suspended->value]);

        $this->assertSame([$this->leaseAgent->id], $this->agentSubjects($this->client));
        $this->assertNull(app(ReviewEligibility::class)->forAgent($this->client, $this->collaborator));
    }

    public function test_a_booking_without_lease_proposes_its_collaborators(): void
    {
        $booking = Booking::factory()->create([
            'property_id' => $this->property->id, 'agency_id' => $this->agency->id,
            'customer_id' => $this->customer->id, 'status' => BookingStatus::Confirmed,
        ]);

        $this->assertSame([$this->collaborator->id], $this->agentSubjects($this->client));
        $this->assertTrue($booking->is(app(ReviewEligibility::class)->forAgent($this->client, $this->collaborator)));
        $this->assertNull(app(ReviewEligibility::class)->forAgent($this->client, $this->landlord));
    }

    public function test_the_host_of_an_individual_agency_is_not_rated_as_an_agent(): void
    {
        $agency = Agency::factory()->individual()->create();
        $host = User::factory()->create(['status' => 'active']);
        $this->materializeRoleProfile($host, 'agency_admin', $agency);
        $this->materializeRoleProfile($host, 'owner', $agency);
        $property = Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $host->id]);
        Lease::factory()->create([
            'property_id' => $property->id, 'agency_id' => $agency->id, 'landlord_id' => $host->id,
            'agent_id' => null, 'tenant_id' => $this->customer->id, 'status' => LeaseStatus::Active,
        ]);

        $this->assertSame([], $this->agentSubjects($this->client));
        $this->assertNull(app(ReviewEligibility::class)->forAgent($this->client, $host));
    }

    public function test_the_tenant_rates_the_lease_agent_and_a_collaborator_on_the_same_lease_once_each(): void
    {
        $this->lease();
        $this->actingAsApi($this->client);

        $this->postJson("/api/agents/{$this->leaseAgent->id}/reviews", ['rating' => 5])->assertCreated();
        $this->postJson("/api/agents/{$this->collaborator->id}/reviews", ['rating' => 4])->assertCreated();
        $this->postJson("/api/agents/{$this->leaseAgent->id}/reviews", ['rating' => 3])->assertStatus(422);
        $this->postJson("/api/agents/{$this->landlord->id}/reviews", ['rating' => 3])->assertForbidden();
    }

    /**
     * La migration s'applique sur des avis existants (qui respectaient l'ancien index), et son
     * `down()` refuse, en le disant, quand deux agents ont été notés sur une même preuve.
     */
    public function test_the_migration_widens_the_index_over_existing_reviews_and_down_refuses_to_lose_one(): void
    {
        $migration = require database_path('migrations/2026_10_24_040000_widen_reviews_author_context_unique_index.php');
        $lease = $this->lease();
        $this->actingAsApi($this->client);
        $this->postJson("/api/agents/{$this->leaseAgent->id}/reviews", ['rating' => 5])->assertCreated();
        $this->postJson("/api/properties/{$this->property->id}/reviews", ['rating' => 5])->assertCreated();

        // Retour à l'état d'avant, avec ses avis, puis la migration.
        DB::statement('DROP INDEX reviews_author_subject_context_uniq');
        DB::statement('CREATE UNIQUE INDEX reviews_author_context_uniq ON reviews (author_id, reviewable_type, context_type, context_id) WHERE context_id IS NOT NULL');
        $migration->up();

        $indexes = DB::table('pg_indexes')->where('tablename', 'reviews')->pluck('indexdef', 'indexname');
        $this->assertArrayNotHasKey('reviews_author_context_uniq', $indexes->all());
        $this->assertStringContainsString('(author_id, reviewable_type, reviewable_id, context_type, context_id)', $indexes['reviews_author_subject_context_uniq']);
        $this->assertSame(2, Review::query()->count());

        $this->postJson("/api/agents/{$this->collaborator->id}/reviews", ['rating' => 4])->assertCreated();
        try {
            $migration->down();
            $this->fail('le down() aurait dû refuser');
        } catch (RuntimeException $e) {
            $this->assertStringContainsString('Aucun avis n\'est supprimé', $e->getMessage());
        }
        $this->assertSame(2, Review::query()->where('context_id', $lease->id)->where('reviewable_type', User::class)->count(), 'les deux avis d\'agent restent');
    }
}
