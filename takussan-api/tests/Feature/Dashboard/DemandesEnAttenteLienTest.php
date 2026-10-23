<?php

namespace Tests\Feature\Dashboard;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\CollaboratorRole;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * TCK-1735 (P167.05) — sous « Mes chiffres », « Demandes en attente » compte les réservations
 * `pending` des biens que l'agent a saisis ou suit en `agent`/`manager` ; le lien de la tuile ouvre
 * `/api/bookings?filter[status]=pending&filter[managed_by]=me`, qui rend cette portée et non toute
 * l'agence.
 */
class DemandesEnAttenteLienTest extends ApiTestCase
{
    use RefreshDatabase;

    public function test_the_mine_count_matches_the_list_its_link_opens(): void
    {
        $agency = Agency::factory()->create();
        $other = Agency::factory()->create();
        $agent = $this->apiActingAsRole('agent', ['agency' => $agency]);
        $colleague = User::factory()->create();
        $this->materializeRoleProfile($colleague, 'agent', $agency);

        $saisi = Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $agent->id]);
        $suivi = Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $colleague->id]);
        PropertyCollaborator::create(['property_id' => $suivi->id, 'user_id' => $agent->id, 'role' => CollaboratorRole::Manager->value]);
        $observe = Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $colleague->id]);
        PropertyCollaborator::create(['property_id' => $observe->id, 'user_id' => $agent->id, 'role' => CollaboratorRole::Viewer->value]);
        $duCollegue = Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $colleague->id]);
        $ailleurs = Property::factory()->create(['agency_id' => $other->id, 'user_id' => $agent->id]);

        $book = fn (Property $p, BookingStatus $s = BookingStatus::Pending) => Booking::factory()->create([
            'property_id' => $p->id,
            'agency_id' => $p->agency_id,
            'status' => $s,
        ]);
        $mine = [$book($saisi)->id, $book($suivi)->id];
        $book($saisi, BookingStatus::Confirmed);
        $book($observe);
        $book($duCollegue);
        $book($ailleurs);

        $tile = $this->apiGet('/api/dashboard/agent')->assertOk()->json('data.pipeline_ops.pending_bookings');
        $this->assertSame(2, $tile);

        $response = $this->apiGet('/api/bookings?filter[status]=pending&filter[managed_by]=me')->assertOk();

        $this->assertEqualsCanonicalizing($mine, array_column($response->json('data'), 'id'));
        $this->assertSame($tile, $response->json('meta.total'));
    }

    public function test_an_unknown_value_returns_nothing(): void
    {
        $agency = Agency::factory()->create();
        $agent = $this->apiActingAsRole('agent', ['agency' => $agency]);
        $property = Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $agent->id]);
        Booking::factory()->create(['property_id' => $property->id, 'agency_id' => $agency->id]);

        $this->apiGet('/api/bookings?filter[managed_by]=someone')->assertOk()->assertJsonCount(0, 'data');
        $this->apiGet('/api/bookings?filter[managed_by][]=me')->assertOk()->assertJsonCount(0, 'data');
    }
}
