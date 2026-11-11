<?php

namespace Tests\Feature\Credits;

use App\Models\Agency;
use App\Models\Enums\BoostKind;
use App\Models\Enums\BoostStatus;
use App\Models\Enums\ContactLeadChannel;
use App\Models\Enums\PropertyStatus;
use App\Models\Property;
use App\Models\PropertyBoost;
use App\Models\PropertyContactLead;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;

/**
 * TCK-2663 — `GET /api/credits/suggestions` : les biens publiés de l'espace sans contact depuis
 * 30 jours et sans mise en avant en cours, du moins vu au plus vu.
 */
class CreditsSuggestionsTest extends ApiTestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        Http::preventStrayRequests();
        $this->travelTo(Carbon::parse('2026-11-20 10:00:00'));
    }

    private function property(Agency $agency, int $views = 0, array $attributes = []): Property
    {
        return Property::factory()->published()->create(['agency_id' => $agency->id, 'views_count' => $views] + $attributes);
    }

    private function contactedDaysAgo(Property $property, int $days, ContactLeadChannel $channel = ContactLeadChannel::Form): void
    {
        $lead = PropertyContactLead::factory()->create(['property_id' => $property->id, 'channel' => $channel]);
        $lead->forceFill(['created_at' => now()->subDays($days)])->save();
    }

    private function boost(Property $property, BoostStatus $status, BoostKind $kind = BoostKind::Featured): void
    {
        PropertyBoost::query()->create([
            'property_id' => $property->id, 'agency_id' => $property->agency_id, 'kind' => $kind,
            'price_credits' => 20, 'duration_days' => 7, 'starts_at' => now()->subDays(2),
            'ends_at' => now()->addDays(5), 'ended_at' => in_array($status, BoostStatus::live(), true) ? null : now()->subDay(),
            'status' => $status,
        ]);
    }

    /** @return list<int> */
    private function suggested(string $query = ''): array
    {
        return array_column($this->apiGet('/api/credits/suggestions'.$query)->assertOk()->json('data'), 'id');
    }

    public function test_ac4_un_bien_contacte_ou_en_vedette_est_exclu_un_bien_jamais_contacte_y_figure(): void
    {
        $agency = Agency::factory()->create();
        $contacted = $this->property($agency);
        $this->contactedDaysAgo($contacted, 10);
        $featured = $this->property($agency);
        $this->boost($featured, BoostStatus::Active);
        $never = $this->property($agency);

        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        $this->assertSame([$never->id], $this->suggested());
    }

    public function test_un_contact_vieux_de_plus_de_trente_jours_ou_un_boost_termine_n_excluent_pas(): void
    {
        $agency = Agency::factory()->create();
        $old = $this->property($agency, 5);
        $this->contactedDaysAgo($old, 31);
        $ended = $this->property($agency, 6);
        $this->boost($ended, BoostStatus::Ended);
        $paused = $this->property($agency, 7);
        $this->boost($paused, BoostStatus::Paused, BoostKind::Badge);
        $clicked = $this->property($agency, 8);
        $this->contactedDaysAgo($clicked, 3, ContactLeadChannel::Whatsapp);

        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        $this->assertSame([$old->id, $ended->id], $this->suggested());
    }

    public function test_seuls_les_biens_publics_de_l_espace_sont_proposes(): void
    {
        $agency = Agency::factory()->create();
        $public = $this->property($agency);
        $this->property($agency, 0, ['status' => PropertyStatus::Draft]);
        $this->property($agency, 0, ['status' => PropertyStatus::Rented]);
        $this->property($agency, 0, ['published_at' => null]);
        $this->property(Agency::factory()->create());

        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        $this->assertSame([$public->id], $this->suggested());
    }

    public function test_du_moins_vu_au_plus_vu_borne_a_dix_avec_le_total(): void
    {
        $agency = Agency::factory()->create();
        $ids = [];
        foreach ([40, 3, 12, 3, 90, 7, 1, 55, 20, 8, 66, 30] as $views) {
            $ids[] = [$views, $this->property($agency, $views)->id];
        }
        usort($ids, fn ($a, $b) => [$a[0], $a[1]] <=> [$b[0], $b[1]]);
        $expected = array_column($ids, 1);

        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        $response = $this->apiGet('/api/credits/suggestions')->assertOk()->assertJsonPath('meta.total', 12);
        $this->assertSame(array_slice($expected, 0, 10), array_column($response->json('data'), 'id'));

        $three = $this->apiGet('/api/credits/suggestions?limit=3')->assertOk()->assertJsonPath('meta.total', 12);
        $this->assertSame(array_slice($expected, 0, 3), array_column($three->json('data'), 'id'));

        $this->apiGet('/api/credits/suggestions?limit=11')->assertStatus(422);
        $this->apiGet('/api/credits/suggestions?limit=0')->assertStatus(422);
    }

    public function test_la_ligne_rend_le_bien_sans_donnee_du_demandeur(): void
    {
        $agency = Agency::factory()->create();
        $property = $this->property($agency, 4, ['title' => 'Studio Ouakam']);
        $property->address()->create(['neighborhood' => 'Ouakam', 'city' => 'Dakar', 'country' => 'SN']);
        $this->contactedDaysAgo($property, 45);

        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $row = $this->apiGet('/api/credits/suggestions')->assertOk()->json('data.0');

        $this->assertSame(['id', 'title', 'main_photo_url', 'quarter', 'views_count', 'last_contact_at'], array_keys($row));
        $this->assertSame('Studio Ouakam', $row['title']);
        $this->assertSame('Ouakam', $row['quarter']);
        $this->assertSame(4, $row['views_count']);
        $this->assertSame(now()->subDays(45)->toIso8601String(), $row['last_contact_at']);
    }

    public function test_un_membre_sans_boost_spend_recoit_403_avant_la_validation(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agent', ['agency' => $agency]);

        $this->apiGet('/api/credits/suggestions')->assertForbidden();
        $this->apiGet('/api/credits/suggestions?limit=99')->assertForbidden();
    }
}
