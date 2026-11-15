<?php

namespace Tests\Feature\Dashboard;

use App\Models\Address;
use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\VisitStatus;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2851 — les visites à venir de l'accueil du client (`GET /api/dashboard/me`,
 * `metrics.visits_upcoming`) : la photo et le lieu du bien, ses coordonnées une fois la visite
 * confirmée seulement, le nom de l'agent sans contact, `can_reschedule` ; et un nombre de requêtes
 * qui ne dépend pas du nombre de visites.
 */
class TenantDashboardVisitsTest extends TestCase
{
    use RefreshDatabase;

    private User $client;

    protected function setUp(): void
    {
        parent::setUp();
        $this->client = User::factory()->create();
    }

    private function visite(VisitStatus $status, string $quand = '+3 days'): PropertyVisit
    {
        $agency = Agency::factory()->create();
        $agent = User::factory()->create([
            'first_name' => 'Moussa',
            'last_name' => 'Ndiaye',
            'phone' => '+221775554433',
            'email' => 'moussa.'.uniqid().'@agence.test',
        ]);
        $bien = Property::factory()->create(['agency_id' => $agency->id]);
        Address::factory()->create([
            'addressable_type' => Property::class,
            'addressable_id' => $bien->id,
            'street' => 'Rue 10 x Rue 13',
            'neighborhood' => 'Point E',
            'city' => 'Dakar',
            'latitude' => 14.6928,
            'longitude' => -17.4467,
        ]);
        $bien->addMedia(UploadedFile::fake()->image('facade.jpg'))->toMediaCollection('photos');
        $fiche = Customer::factory()->create(['user_id' => $this->client->id, 'agency_id' => $agency->id]);

        return PropertyVisit::factory()->create([
            'property_id' => $bien->id,
            'customer_id' => $fiche->id,
            'visitor_id' => null,
            'agent_id' => $agent->id,
            'scheduled_at' => now()->modify($quand),
            'status' => $status,
        ]);
    }

    /** @return list<array<string, mixed>> */
    private function visites(): array
    {
        Sanctum::actingAs($this->client);
        $response = $this->getJson('/api/dashboard/me')->assertOk()->assertJsonPath('data.role', 'tenant');
        $this->assertStringNotContainsString('775554433', $response->getContent(), 'jamais le téléphone de l agent');
        $this->assertStringNotContainsString('@agence.test', $response->getContent(), 'jamais son courriel');

        return $response->json('data.metrics.visits_upcoming');
    }

    public function test_ac3_la_visite_confirmee_porte_photo_lieu_coordonnees_agent_et_report(): void
    {
        $this->visite(VisitStatus::Confirmed);

        $v = $this->visites()[0];

        $this->assertNotEmpty($v['property']['cover_url']);
        $this->assertSame('Point E, Dakar', $v['property']['address_line']);
        $this->assertEqualsWithDelta(14.6928, $v['property']['coordinates']['lat'], 0.0001);
        $this->assertEqualsWithDelta(-17.4467, $v['property']['coordinates']['lng'], 0.0001);
        $this->assertSame(['name' => 'Moussa Ndiaye'], $v['agent']);
        $this->assertTrue($v['can_reschedule']);
    }

    public function test_ac3_la_visite_non_confirmee_n_a_ni_coordonnees_ni_rue(): void
    {
        $this->visite(VisitStatus::Scheduled);

        $v = $this->visites()[0];

        $this->assertArrayNotHasKey('coordinates', $v['property']);
        $this->assertSame('Point E, Dakar', $v['property']['address_line']);
        $this->assertTrue($v['can_reschedule']);
        $this->assertStringNotContainsString('Rue 10', json_encode($v));
    }

    public function test_sans_agent_attribue_agent_est_null(): void
    {
        $this->visite(VisitStatus::Scheduled)->update(['agent_id' => null]);

        $this->assertNull($this->visites()[0]['agent']);
    }

    public function test_ac4_requetes_identiques_avec_une_et_cinq_visites(): void
    {
        $this->visite(VisitStatus::Confirmed);
        $une = $this->compterLesRequetes();

        foreach (range(2, 5) as $i) {
            $this->visite($i % 2 === 0 ? VisitStatus::Scheduled : VisitStatus::Confirmed, "+{$i} days");
        }
        $cinq = $this->compterLesRequetes();

        $this->assertCount(5, $this->visites());
        $this->assertSame($une, $cinq, "{$une} requêtes pour une visite, {$cinq} pour cinq");
    }

    private function compterLesRequetes(): int
    {
        Sanctum::actingAs($this->client);
        $this->getJson('/api/dashboard/me')->assertOk();

        DB::flushQueryLog();
        DB::enableQueryLog();
        $this->getJson('/api/dashboard/me')->assertOk();
        $n = count(DB::getQueryLog());
        DB::disableQueryLog();

        return $n;
    }
}
