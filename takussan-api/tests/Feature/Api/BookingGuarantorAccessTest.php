<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\ContractType;
use App\Models\Enums\Currency;
use App\Models\Enums\RentPeriod;
use App\Models\Guarantor;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2893 (ADR-0110 § 3) — qui rattache et retire un garant (`BookingPolicy::manageGuarantors`) :
 * le client de la réservation, qui le déclare, et le personnel de l'agence du bien. Ni le bailleur,
 * ni un autre candidat au même bien, ni le personnel d'une autre agence. Le client qui rattache ne
 * relit pas la liste : elle est au seul personnel.
 */
class BookingGuarantorAccessTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    private User $client;

    private User $landlord;

    private Booking $booking;

    private Property $monthly;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo('2026-11-15 10:00:00');

        $this->agency = Agency::factory()->create();
        $this->agent = User::factory()->withAgentProfile($this->agency)->create();
        $this->client = User::factory()->create();
        $this->landlord = User::factory()->create();
        $this->materializeRoleProfile($this->landlord, 'owner', $this->agency);
        $customer = Customer::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->client->id]);
        $this->monthly = Property::factory()->published()->create([
            'agency_id' => $this->agency->id, 'user_id' => $this->landlord->id, 'currency' => Currency::XOF,
            'contract_type' => ContractType::Rent, 'rent_period' => RentPeriod::Monthly, 'price' => '300000',
        ]);

        Sanctum::actingAs($this->agent);
        $this->booking = Booking::query()->findOrFail($this->postJson('/api/bookings', [
            'kind' => 'application', 'property_id' => $this->monthly->id, 'customer_id' => $customer->id, 'start_date' => '2026-12-01',
        ])->assertCreated()->json('data.id'));
    }

    private function comme(User $user): static
    {
        $this->flushHeaders();
        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($user);

        return $this;
    }

    public function test_the_landlord_another_applicant_and_another_agency_neither_attach_nor_remove(): void
    {
        $garant = $this->comme($this->agent)->postJson("/api/bookings/{$this->booking->id}/guarantors", [
            'first_name' => 'Ibrahima', 'last_name' => 'Dieng',
        ])->assertCreated()->json('data.guarantor_id');

        $autreCandidat = User::factory()->create();
        $this->comme($autreCandidat)->postJson("/api/public/properties/{$this->monthly->slug}/booking-request", [
            'start_date' => '2026-12-01', 'end_date' => '2027-12-01', 'guests' => 1,
        ])->assertCreated();

        $refuses = [
            'le bailleur' => $this->landlord,
            'un autre candidat au même bien' => $autreCandidat,
            'l\'agent d\'une autre agence' => User::factory()->withAgentProfile(Agency::factory()->create())->create(),
        ];
        foreach ($refuses as $qui => $user) {
            $this->comme($user)->postJson("/api/bookings/{$this->booking->id}/guarantors", ['first_name' => 'X', 'last_name' => 'Y'])
                ->assertForbidden();
            $this->deleteJson("/api/bookings/{$this->booking->id}/guarantors/{$garant}")->assertForbidden();
            $this->assertSame(1, $this->booking->guarantors()->count(), $qui);
        }
        $this->assertSame(1, Guarantor::query()->count());
    }

    public function test_the_applicant_declares_a_guarantor_but_does_not_read_the_list_nor_attach_someone_else_s(): void
    {
        $this->comme($this->client)->postJson("/api/bookings/{$this->booking->id}/guarantors", [
            'first_name' => 'Ibrahima', 'last_name' => 'Dieng', 'relationship_to_tenant' => 'son frère',
        ])->assertCreated()->assertJsonPath('data.guarantors_count', 1);

        $this->getJson("/api/bookings/{$this->booking->id}")->assertOk()
            ->assertJsonMissingPath('data.guarantors')
            ->assertJsonMissingPath('data.has_guarantor')
            ->assertJsonPath('data.dossier.required', 5);

        // Une fiche de l'agence que le candidat ne lit pas ne se rattache pas par son identifiant.
        $deLAgence = Guarantor::factory()->create(['added_by_id' => $this->agent->id, 'agency_id' => $this->agency->id]);
        $this->postJson("/api/bookings/{$this->booking->id}/guarantors", ['guarantor_id' => $deLAgence->id])->assertForbidden();
        $this->assertSame(1, $this->booking->guarantors()->count());
    }
}
