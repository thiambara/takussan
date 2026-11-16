<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Enums\BookingKind;
use App\Models\Enums\OfferFinancing;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2870 (ADR-0110 § 1) — chaque condition neuve se demande sous `fields[bookings]` (elle est
 * dans `Booking::$queryFields`), est omise quand le fieldset ne la lit pas, et `entry_amount`,
 * dérivé, ne sort que quand TOUTES les colonnes qu'il lit sont lues — jamais un montant faux.
 */
class BookingResourceFieldsTest extends TestCase
{
    use RefreshDatabase;

    private User $agent;

    private Booking $application;

    private Booking $offer;

    protected function setUp(): void
    {
        parent::setUp();
        $agency = Agency::factory()->create();
        $this->agent = User::factory()->withAgentProfile($agency)->create();
        $bien = Property::factory()->create(['agency_id' => $agency->id]);
        $this->application = Booking::factory()->create([
            'property_id' => $bien->id, 'agency_id' => $agency->id, 'kind' => BookingKind::Application,
            'total_amount' => '300000', 'term_months' => 12, 'renewable' => true,
            'security_deposit_months' => 2, 'security_deposit_amount' => '600000',
            'advance_months_at_booking' => 1, 'agency_fee_months_at_booking' => '1.00',
        ]);
        $this->offer = Booking::factory()->create([
            'property_id' => $bien->id, 'agency_id' => $agency->id, 'kind' => BookingKind::Offer,
            'financing' => OfferFinancing::Mixed, 'signature_within_days' => 45, 'conditions' => 'Sous réserve du prêt',
        ]);
        Sanctum::actingAs($this->agent);
    }

    /** @return array<int, array<string, mixed>> */
    private function lignes(string $fields): array
    {
        return collect($this->getJson('/api/bookings?fields[bookings]='.$fields)->assertOk()->json('data'))->keyBy('id')->all();
    }

    public function test_each_condition_is_a_permitted_field(): void
    {
        $lignes = $this->lignes('id,agency_id,kind,term_months,renewable,security_deposit_months,security_deposit_amount,advance_months_at_booking,agency_fee_months_at_booking,financing,signature_within_days,conditions,total_amount');

        $a = $lignes[$this->application->id];
        $this->assertSame(12, $a['term_months']);
        $this->assertTrue($a['renewable']);
        $this->assertSame(2, $a['security_deposit_months']);
        $this->assertEquals(600000, $a['security_deposit_amount']);
        $this->assertSame(1, $a['advance_months_at_booking']);
        $this->assertEquals(1, $a['agency_fee_months_at_booking']);
        $this->assertNull($a['financing']);
        // 300 000 × 1 + 600 000 + 300 000 × 1
        $this->assertEquals(1200000, $a['entry_amount']);

        $o = $lignes[$this->offer->id];
        $this->assertSame('mixed', $o['financing']);
        $this->assertSame(45, $o['signature_within_days']);
        $this->assertSame('Sous réserve du prêt', $o['conditions']);
        $this->assertNull($o['term_months']);
        $this->assertNull($o['entry_amount'], 'une offre n\'a rien à verser à l\'entrée');
    }

    public function test_a_condition_not_read_is_omitted_and_the_entry_amount_is_never_partial(): void
    {
        // Sans `advance_months_at_booking` ni `agency_fee_months_at_booking`, le montant serait faux.
        $a = $this->lignes('id,agency_id,kind,total_amount,term_months,security_deposit_amount')[$this->application->id];

        $this->assertSame(12, $a['term_months']);
        $this->assertArrayNotHasKey('financing', $a);
        $this->assertArrayNotHasKey('renewable', $a);
        $this->assertArrayNotHasKey('entry_amount', $a);
    }

    public function test_an_application_recorded_before_the_conditions_has_no_invented_entry_amount(): void
    {
        $this->application->forceFill(['term_months' => null, 'security_deposit_months' => null, 'security_deposit_amount' => null, 'advance_months_at_booking' => null, 'agency_fee_months_at_booking' => null])->saveQuietly();

        $this->assertNull($this->getJson("/api/bookings/{$this->application->id}")->assertOk()->json('data.entry_amount'));
    }
}
