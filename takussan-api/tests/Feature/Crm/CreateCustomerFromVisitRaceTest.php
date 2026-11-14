<?php

namespace Tests\Feature\Crm;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\VisitStatus;
use App\Models\Property;
use App\Models\PropertyVisit;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2716, AC6 (vérification adverse) — la course, rendue déterministe : une autre création rattache la visite ENTRE la lecture
 * préalable (hors transaction) et le verrou. Le rejugement sous verrou doit rendre 422 et ne rien écraser.
 */
class CreateCustomerFromVisitRaceTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    public function test_un_rattachement_concurrent_entre_la_lecture_et_le_verrou(): void
    {
        $a = Agency::factory()->create();
        $bien = Property::factory()->create(['agency_id' => $a->id]);
        $visite = PropertyVisit::factory()->create(['property_id' => $bien->id, 'visitor_id' => null, 'customer_id' => null,
            'visitor_name' => 'Awa Diop', 'visitor_phone' => '+221771234567', 'status' => VisitStatus::Completed, 'scheduled_at' => now()->subDay()]);
        $agent = $this->agencyAgent($a);
        $autre = Customer::factory()->create(['agency_id' => $a->id, 'phone' => '+221770000001']);

        $fait = false;
        DB::listen(function ($q) use (&$fait, $visite, $autre): void {
            if (! $fait && preg_match('/from "property_visits" where "property_visits"\."id" = \? .*limit 1$/i', $q->sql) === 1
                && ! str_contains(strtolower($q->sql), 'for update')) {
                $fait = true;
                DB::table('property_visits')->where('id', $visite->id)->update(['customer_id' => $autre->id]);
            }
        });

        $avant = Customer::query()->count();
        $reponse = $this->actingAsApi($agent)->postJson('/api/customers', [
            'first_name' => 'Moussa', 'last_name' => 'Sow', 'phone' => '+221779999999', 'property_visit_id' => $visite->id,
        ]);

        $this->assertTrue($fait, 'la lecture préalable a bien eu lieu');
        $reponse->assertStatus(422)->assertJsonPath('code', 'visit.customer_already_linked');
        $this->assertSame($avant, Customer::query()->count());
        $this->assertSame($autre->id, (int) $visite->fresh()->customer_id);
    }

    public function test_meme_visiteur_la_seconde_rend_422_pas_le_doublon(): void
    {
        $a = Agency::factory()->create();
        $bien = Property::factory()->create(['agency_id' => $a->id]);
        $visite = PropertyVisit::factory()->create(['property_id' => $bien->id, 'visitor_id' => null, 'customer_id' => null,
            'visitor_name' => 'Awa Diop', 'visitor_phone' => '+221771234567', 'status' => VisitStatus::Completed, 'scheduled_at' => now()->subDay()]);
        $agent = $this->agencyAgent($a);
        $autre = Customer::factory()->create(['agency_id' => $a->id, 'phone' => '+221771234567']);

        $fait = false;
        DB::listen(function ($q) use (&$fait, $visite, $autre): void {
            if (! $fait && preg_match('/from "property_visits" where "property_visits"\."id" = \? .*limit 1$/i', $q->sql) === 1
                && ! str_contains(strtolower($q->sql), 'for update')) {
                $fait = true;
                DB::table('property_visits')->where('id', $visite->id)->update(['customer_id' => $autre->id]);
            }
        });

        $avant = Customer::query()->count();
        $reponse = $this->actingAsApi($agent)->postJson('/api/customers', [
            'first_name' => 'Moussa', 'last_name' => 'Sow', 'phone' => '+221771234567', 'property_visit_id' => $visite->id,
        ]);

        $this->assertTrue($fait, 'la lecture préalable a bien eu lieu');
        $reponse->assertStatus(422)->assertJsonPath('code', 'visit.customer_already_linked');
        $this->assertSame($avant, Customer::query()->count());
        $this->assertSame($autre->id, (int) $visite->fresh()->customer_id);
    }
}
