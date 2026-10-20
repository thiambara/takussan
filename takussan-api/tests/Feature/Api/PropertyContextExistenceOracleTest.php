<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\MaintenanceCategory;
use App\Models\Enums\PropertyStatus;
use App\Models\Property;
use App\Models\User;
use App\Services\Visit\VisitSchedulingService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-1072 (P62.06) — le calendrier, la visite et la demande d'intervention ne disent plus quels
 * biens existent, brouillons compris. `exists:properties,id` rendait 422 sur `property_id` pour un
 * identifiant absent, là où le brouillon d'une agence tierce passait la validation et recevait le
 * refus (ou un agenda vide) : l'absent reçoit désormais la même réponse (modèle de TCK-599).
 */
class PropertyContextExistenceOracleTest extends TestCase
{
    use RefreshDatabase;

    private const ABSENT = 99999999;

    private Property $brouillon;

    protected function setUp(): void
    {
        parent::setUp();

        $tierce = Agency::factory()->create();
        $this->brouillon = Property::factory()->create([
            'agency_id' => $tierce->id,
            'status' => PropertyStatus::Draft,
            'published_at' => null,
        ]);
        Sanctum::actingAs(User::factory()->create());
    }

    /** @return array{0: int, 1: mixed} */
    private function verdict(TestResponse $response): array
    {
        return [$response->status(), $response->json()];
    }

    public function test_le_calendrier_rend_le_meme_agenda_pour_un_bien_absent(): void
    {
        $window = 'start_date='.now()->toDateString().'&end_date='.now()->addWeek()->toDateString();

        $brouillon = $this->verdict($this->getJson("/api/calendar?{$window}&property_id={$this->brouillon->id}"));
        $absent = $this->verdict($this->getJson("/api/calendar?{$window}&property_id=".self::ABSENT));
        $this->assertSame(200, $brouillon[0]);
        $this->assertSame($brouillon, $absent);

        $plusieurs = $this->verdict($this->getJson("/api/calendar?{$window}&property_ids[]={$this->brouillon->id}"));
        $this->assertSame($plusieurs, $this->verdict($this->getJson("/api/calendar?{$window}&property_ids[]=".self::ABSENT)));
    }

    private function visit(int $propertyId, bool $creneau = true): TestResponse
    {
        return $this->postJson('/api/property-visits', array_filter([
            'property_id' => $propertyId,
            'scheduled_at' => $creneau
                ? CarbonImmutable::now(VisitSchedulingService::TIMEZONE)->addDays(2)->setTime(10, 0)->utc()->toIso8601String()
                : null,
        ]));
    }

    public function test_la_visite_rend_le_refus_pour_un_bien_absent(): void
    {
        $brouillon = $this->verdict($this->visit($this->brouillon->id));
        $absent = $this->verdict($this->visit(self::ABSENT));

        $this->assertSame(403, $brouillon[0]);
        $this->assertSame('visit.property_unavailable', $brouillon[1]['code'] ?? null);
        $this->assertSame($brouillon, $absent);

        $this->assertSame(
            $this->verdict($this->visit($this->brouillon->id, creneau: false)),
            $this->verdict($this->visit(self::ABSENT, creneau: false)),
        );
        $this->assertDatabaseCount('property_visits', 0);
    }

    private function maintenance(int $propertyId, bool $complete = true): TestResponse
    {
        return $this->postJson('/api/maintenance-requests', ['property_id' => $propertyId] + ($complete ? [
            'title' => 'Fuite',
            'description' => 'Sous l’évier',
            'category' => MaintenanceCategory::cases()[0]->value,
        ] : []));
    }

    public function test_l_intervention_rend_le_refus_pour_un_bien_absent(): void
    {
        $brouillon = $this->verdict($this->maintenance($this->brouillon->id));
        $absent = $this->verdict($this->maintenance(self::ABSENT));

        $this->assertSame(403, $brouillon[0]);
        $this->assertSame($brouillon, $absent);

        $this->assertSame(
            $this->verdict($this->maintenance($this->brouillon->id, complete: false)),
            $this->verdict($this->maintenance(self::ABSENT, complete: false)),
        );
        $this->assertDatabaseCount('maintenance_requests', 0);
    }
}
