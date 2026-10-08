<?php

namespace Tests\Feature\Agency;

use App\Models\Agency;
use App\Models\Enums\CollaborationStatus;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-592 — AC6 (B13), moitié HTTP : une collaboration `paused` ou `ended` n'ouvre plus l'agence.
 *
 * `visibleAgencyIds()` joignait les collaborations sans regarder leur statut : la fin d'une
 * collaboration ne retirait rien. Le témoin `active` → 200 garde le test d'un refus universel.
 */
class AgencyVisibilityForProviderTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    /** @return array<string, array{CollaborationStatus, int}> */
    public static function statuses(): array
    {
        return [
            'active (témoin)' => [CollaborationStatus::Active, 200],
            'paused' => [CollaborationStatus::Paused, 404],
            'ended' => [CollaborationStatus::Ended, 404],
        ];
    }

    #[DataProvider('statuses')]
    public function test_agency_is_visible_only_through_an_active_collaboration(CollaborationStatus $status, int $expected): void
    {
        $agency = Agency::factory()->create();
        $provider = $this->providerFor($agency, $status);

        Sanctum::actingAs($provider);

        $this->getJson("/api/agencies/{$agency->id}")->assertStatus($expected);
        $this->assertSame($status === CollaborationStatus::Active, $provider->fresh()->isProviderAt($agency->id));
    }
}
