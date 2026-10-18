<?php

namespace Tests\Feature\Api;

use App\Models\Lease;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-904 (P21.06) — `GET /api/leases/{id}` ne rend pas les relations de renouvellement qu'il ne
 * charge pas.
 *
 * Le détail appelle `LeaseResource::toArray()` directement : `whenLoaded`/`whenCounted` y laissent
 * un `MissingValue`, que `json_encode` rend `{}`. `renewed_from`, `renewals` et `renewals_count`
 * sortaient ainsi, vides et trompeurs, alors que rien ne les charge et que le front ne les lit pas.
 */
class LeaseResourceUnloadedRelationsTest extends TestCase
{
    use RefreshDatabase;

    public function test_le_detail_du_bail_ne_rend_pas_les_renouvellements_non_charges(): void
    {
        Notification::fake();
        $landlord = User::factory()->create();
        $lease = Lease::factory()->create(['landlord_id' => $landlord->id]);
        Sanctum::actingAs($landlord);

        $data = $this->getJson("/api/leases/{$lease->id}")->assertOk()->json('data');

        $this->assertSame($lease->id, $data['id']);
        foreach (['renewed_from', 'renewals', 'renewals_count'] as $key) {
            $this->assertArrayNotHasKey($key, $data, "{$key} n'est pas chargé par le détail");
        }
        $this->assertArrayHasKey('property', $data, 'une relation chargée reste rendue');
    }
}
