<?php

namespace Tests\Feature\Api;

use App\Models\Activity;
use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingKind;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\ContractType;
use App\Models\Enums\Currency;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\Enums\RentPeriod;
use App\Models\Property;
use App\Models\User;
use App\Services\Crm\AcceptanceStageChange;
use App\Services\Crm\CustomerSuggestedStageQuery;
use App\Services\Privacy\DataExportBuilder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2874 (ADR-0110 § 8) — accepter une candidature ou une offre passe la fiche en Négociation
 * (depuis Prospect ou Qualifié seulement), journalisé, avec un retour arrière dans les 24 h par le
 * personnel de l'agence de la fiche, si l'étape n'a pas changé depuis.
 */
class BookingAcceptanceStageTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    private User $client;

    private Customer $customer;

    private Property $monthly;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo('2026-11-15 10:00:00');

        $this->agency = Agency::factory()->create();
        $this->agent = User::factory()->withAgentProfile($this->agency)->create();
        $this->client = User::factory()->create();
        $this->customer = Customer::factory()->create([
            'agency_id' => $this->agency->id, 'user_id' => $this->client->id,
            'pipeline_stage' => CustomerPipelineStage::Qualified,
        ]);
        $this->monthly = Property::factory()->published()->create([
            'agency_id' => $this->agency->id, 'currency' => Currency::XOF,
            'contract_type' => ContractType::Rent, 'rent_period' => RentPeriod::Monthly, 'price' => '300000',
        ]);
    }

    private function application(): Booking
    {
        Sanctum::actingAs($this->agent);

        return Booking::query()->findOrFail($this->postJson('/api/bookings', [
            'kind' => 'application', 'property_id' => $this->monthly->id,
            'customer_id' => $this->customer->id, 'start_date' => '2026-12-01',
        ])->assertCreated()->json('data.id'));
    }

    private function confirm(Booking $booking): TestResponse
    {
        Sanctum::actingAs($this->agent);

        return $this->postJson("/api/bookings/{$booking->id}/confirm")->assertOk();
    }

    private function undo(?User $as = null): TestResponse
    {
        Sanctum::actingAs($as ?? $this->agent);

        return $this->postJson("/api/customers/{$this->customer->id}/pipeline-stage/undo");
    }

    private function stage(): CustomerPipelineStage
    {
        return $this->customer->refresh()->pipeline_stage;
    }

    public function test_ac3_accepting_an_application_moves_a_qualified_customer_to_negotiating(): void
    {
        $booking = $this->application();

        $this->confirm($booking)
            ->assertJsonPath('data.status', 'confirmed')
            ->assertJsonPath('data.stage_change.from', 'qualified')
            ->assertJsonPath('data.stage_change.to', 'negotiating')
            ->assertJsonPath('data.stage_change.undoable_until', '2026-11-16T10:00:00+00:00')
            ->assertJsonPath('data.stage_change.undone_at', null);

        $this->assertSame(CustomerPipelineStage::Negotiating, $this->stage());

        // Journalisé comme tout changement d'étape (la forme que relit l'étape proposée), avec le fait.
        $ligne = Activity::query()->where('subject_type', $this->customer->getMorphClass())
            ->where('subject_id', $this->customer->id)->latest('id')->firstOrFail();
        $this->assertSame('updated', $ligne->event);
        $this->assertSame('negotiating', data_get($ligne->attribute_changes, 'attributes.pipeline_stage'));
        $this->assertSame('qualified', data_get($ligne->attribute_changes, 'old.pipeline_stage'));
        $this->assertSame(AcceptanceStageChange::CAUSE, $ligne->properties->get('cause'));
        $this->assertSame($booking->id, $ligne->properties->get('booking_id'));
        $this->assertSame($this->agent->id, (int) $ligne->causer_id);
        $this->assertSame(1, Activity::query()->where('subject_type', $this->customer->getMorphClass())
            ->where('subject_id', $this->customer->id)
            ->whereRaw("(attribute_changes->'attributes'->>'pipeline_stage') = 'negotiating'")->count(), 'une seule ligne');

        // L'étape confirmée n'est plus proposée.
        $this->assertNull(app(CustomerSuggestedStageQuery::class)->suggestionFor($this->customer->refresh()));
    }

    public function test_ac3_undo_within_the_hour_puts_the_customer_back_to_qualified(): void
    {
        $booking = $this->application();
        $this->confirm($booking);
        $this->travel(50)->minutes();

        $this->undo()->assertOk()->assertJsonPath('data.pipeline_stage', 'qualified');

        $this->assertSame(CustomerPipelineStage::Qualified, $this->stage());
        Sanctum::actingAs($this->agent);
        $this->getJson("/api/bookings/{$booking->id}")
            ->assertOk()
            ->assertJsonPath('data.stage_change.from', 'qualified')
            ->assertJsonPath('data.stage_change.undoable_until', null)
            ->assertJsonPath('data.stage_change.undone_at', '2026-11-15T10:50:00+00:00');
        $ligne = Activity::query()->where('subject_type', $this->customer->getMorphClass())
            ->where('subject_id', $this->customer->id)->latest('id')->firstOrFail();
        $this->assertSame(AcceptanceStageChange::UNDO_CAUSE, $ligne->properties->get('cause'));

        // Défait une fois : il n'y a plus rien à défaire.
        $this->undo()->assertStatus(409)->assertJsonPath('code', 'customer.stage_undo_unavailable');
    }

    public function test_ac3_a_customer_already_won_does_not_move(): void
    {
        $this->customer->update(['pipeline_stage' => CustomerPipelineStage::Converted]);

        $this->confirm($this->application())->assertJsonPath('data.stage_change', null);

        $this->assertSame(CustomerPipelineStage::Converted, $this->stage());
    }

    public function test_a_lost_customer_and_a_new_lead_do_not_move(): void
    {
        foreach ([CustomerPipelineStage::Lost, CustomerPipelineStage::Lead] as $etape) {
            // Un bien par passage : une seconde candidature acceptée sur le même bien est refusée (409).
            $this->monthly = Property::factory()->published()->create([
                'agency_id' => $this->agency->id, 'currency' => Currency::XOF,
                'contract_type' => ContractType::Rent, 'rent_period' => RentPeriod::Monthly, 'price' => '300000',
            ]);
            $this->customer->update(['pipeline_stage' => $etape]);
            $this->confirm($this->application())->assertJsonPath('data.stage_change', null);
            $this->assertSame($etape, $this->stage(), $etape->value);
        }
    }

    public function test_a_confirmed_stay_does_not_move_the_customer(): void
    {
        $stay = Booking::factory()->create([
            'property_id' => Property::factory()->published()->create(['agency_id' => $this->agency->id, 'rent_period' => RentPeriod::Daily])->id,
            'customer_id' => $this->customer->id, 'agency_id' => $this->agency->id, 'kind' => BookingKind::Stay,
            'status' => BookingStatus::Pending,
        ]);

        $this->confirm($stay)->assertJsonPath('data.stage_change', null);

        $this->assertSame(CustomerPipelineStage::Qualified, $this->stage());
    }

    public function test_undo_after_another_stage_change_is_409(): void
    {
        $this->confirm($this->application());
        Sanctum::actingAs($this->agent);
        $this->patchJson("/api/customers/{$this->customer->id}/pipeline-stage", ['pipeline_stage' => 'converted'])->assertOk();

        $this->undo()->assertStatus(409)->assertJsonPath('code', 'customer.stage_undo_unavailable');

        $this->assertSame(CustomerPipelineStage::Converted, $this->stage());
    }

    /** Une étape écrite hors journal (import, écriture directe) : l'étape lue fait foi, pas le journal. */
    public function test_undo_after_a_stage_written_outside_the_journal_is_409(): void
    {
        $this->confirm($this->application());
        DB::table('customers')->where('id', $this->customer->id)->update(['pipeline_stage' => 'converted']);

        $this->undo()->assertStatus(409)->assertJsonPath('code', 'customer.stage_undo_unavailable');

        $this->assertSame(CustomerPipelineStage::Converted, $this->stage());
    }

    public function test_undo_after_24_hours_is_422(): void
    {
        $this->confirm($this->application());
        $this->travel(24)->hours();
        $this->travel(1)->minutes();

        $this->undo()->assertStatus(422)->assertJsonPath('code', 'customer.stage_undo_expired');

        $this->assertSame(CustomerPipelineStage::Negotiating, $this->stage());
    }

    public function test_undo_without_an_acceptance_is_409(): void
    {
        $this->undo()->assertStatus(409)->assertJsonPath('code', 'customer.stage_undo_unavailable');
    }

    public function test_only_the_staff_of_the_customer_agency_may_undo(): void
    {
        $this->confirm($this->application());

        $this->undo($this->client)->assertForbidden();
        $this->undo(User::factory()->withAgentProfile(Agency::factory()->create())->create())->assertForbidden();

        $this->assertSame(CustomerPipelineStage::Negotiating, $this->stage());
    }

    public function test_the_customer_does_not_read_the_stage_change(): void
    {
        $booking = $this->application();
        $this->confirm($booking);

        Sanctum::actingAs($this->client);
        $this->getJson("/api/bookings/{$booking->id}")->assertOk()->assertJsonMissingPath('data.stage_change');
    }

    /** Le changement d'étape n'entre pas dans l'export des données du client (il dit l'étape de sa fiche). */
    public function test_the_customer_data_export_does_not_carry_the_stage_change(): void
    {
        $booking = $this->application();
        $this->confirm($booking);
        $this->assertIsArray($booking->refresh()->metadata['stage_change'] ?? null, 'prémisse : écrit sur la réservation');

        $lignes = app(DataExportBuilder::class)->payloads($this->client)['bookings.json'];

        $this->assertCount(1, $lignes);
        $this->assertArrayNotHasKey('stage_change', (array) ($lignes[0]['metadata'] ?? []));
    }

    /** Le fil de la fiche montre le passage, comme tout changement d'étape (la ligne du journal est écrite à la main). */
    public function test_the_customer_timeline_shows_the_stage_change(): void
    {
        $this->confirm($this->application());
        Sanctum::actingAs($this->agent);

        $etapes = collect($this->getJson("/api/customers/{$this->customer->id}/timeline?filter[type]=stage")->assertOk()->json('data'))
            ->where('type', 'stage')->values();

        $this->assertCount(1, $etapes);
        $this->assertSame(['qualified', 'negotiating'], [$etapes[0]['from'], $etapes[0]['to']]);
    }

    /**
     * Le chemin de la contre-offre acceptée par le client passe par `BookingService::confirm()` : la
     * fiche avance aussi (l'offre est acceptée), et le geste est journalisé au nom du client.
     */
    public function test_an_offer_confirmed_by_an_accepted_counter_offer_moves_the_customer_too(): void
    {
        $sale = Property::factory()->published()->create([
            'agency_id' => $this->agency->id, 'currency' => Currency::XOF,
            'contract_type' => ContractType::Sale, 'rent_period' => null, 'price' => '95000000',
        ]);
        Sanctum::actingAs($this->agent);
        $id = $this->postJson('/api/bookings', [
            'kind' => 'offer', 'property_id' => $sale->id, 'customer_id' => $this->customer->id, 'total_amount' => 85000000,
        ])->assertCreated()->json('data.id');
        $counter = $this->postJson("/api/bookings/{$id}/counter-offers", ['amount' => 90000000])->assertCreated()->json('data.counter_offer.id');

        Sanctum::actingAs($this->client);
        $this->postJson("/api/bookings/{$id}/counter-offers/{$counter}/accept")->assertOk();

        $this->assertSame(CustomerPipelineStage::Negotiating, $this->stage());
    }
}
