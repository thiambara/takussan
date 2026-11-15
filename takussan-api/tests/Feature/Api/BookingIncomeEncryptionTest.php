<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingKind;
use App\Models\Enums\ContractType;
use App\Models\Enums\Currency;
use App\Models\Enums\RentPeriod;
use App\Models\Property;
use App\Models\User;
use App\Services\Booking\BookingConditions;
use App\Services\Privacy\DataExportBuilder;
use App\Services\Privacy\PersonalDataAccessLogger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Spatie\Activitylog\Models\Activity;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * TCK-2893 (ADR-0110 § 4, ADR-0070) — le revenu mensuel déclaré du candidat : chiffré en base,
 * jamais servi en clair par `BookingResource` (le masque et le rapport au loyer, arrondi au dixième,
 * au seul personnel de l'agence du bien), absent du journal d'activité, lu en clair par l'admin de
 * l'agence seul, sous step-up, journalisé.
 */
class BookingIncomeEncryptionTest extends TestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private const REVENU = '950000';

    private Agency $agency;

    private User $agent;

    private User $client;

    private User $landlord;

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
        $this->landlord = User::factory()->create();
        $this->materializeRoleProfile($this->landlord, 'owner', $this->agency);
        $this->customer = Customer::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->client->id]);
        $this->monthly = Property::factory()->published()->create([
            'agency_id' => $this->agency->id, 'user_id' => $this->landlord->id, 'currency' => Currency::XOF,
            'contract_type' => ContractType::Rent, 'rent_period' => RentPeriod::Monthly, 'price' => '300000',
        ]);
    }

    private function application(): Booking
    {
        Sanctum::actingAs($this->agent);
        $id = $this->postJson('/api/bookings', [
            'kind' => 'application', 'property_id' => $this->monthly->id, 'customer_id' => $this->customer->id,
            'start_date' => '2026-12-01', 'declared_monthly_income' => (int) self::REVENU,
        ])->assertCreated()->json('data.id');

        return Booking::query()->findOrFail($id);
    }

    private function comme(User $user): static
    {
        $this->flushHeaders();
        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($user);

        return $this;
    }

    public function test_ac2_the_income_is_encrypted_in_base_and_served_masked_with_its_ratio_to_the_rent(): void
    {
        $booking = $this->application();

        $brut = DB::table('bookings')->where('id', $booking->id)->value('declared_monthly_income');
        $this->assertStringNotContainsString(self::REVENU, $brut);
        $this->assertSame(self::REVENU, Crypt::decryptString($brut));

        $reponse = $this->comme($this->agent)->getJson("/api/bookings/{$booking->id}")->assertOk()
            ->assertJsonPath('data.income_to_rent_ratio', 3.2)
            ->assertJsonPath('data.declared_monthly_income_masked', '••••')
            ->assertJsonPath('data.has_guarantor', false)
            ->assertJsonMissingPath('data.declared_monthly_income');
        $this->assertStringNotContainsString(self::REVENU, (string) $reponse->getContent());

        // La liste, sous un sparse fieldset qui ne lit ni la nature ni le montant : mêmes valeurs (le
        // verdict « personnel » lit l'agence, `BookingCustomerFacts::servesStaff`).
        $liste = $this->getJson('/api/bookings?fields[bookings]=id,status,agency_id')->assertOk()
            ->assertJsonPath('data.0.income_to_rent_ratio', 3.2)
            ->assertJsonPath('data.0.declared_monthly_income_masked', '••••');
        $this->assertStringNotContainsString(self::REVENU, (string) $liste->getContent());

        // Hors des sparse fieldsets (ADR-0070 § 4).
        $this->getJson('/api/bookings?fields[bookings]=id,declared_monthly_income')->assertStatus(400);
    }

    public function test_the_ratio_is_rounded_to_the_tenth_half_up_and_only_for_an_application(): void
    {
        $this->assertSame(3.2, BookingConditions::incomeToRentRatio(BookingKind::Application, '950000', '300000.00'));
        $this->assertSame(3.3, BookingConditions::incomeToRentRatio('application', '1000000', '300000'));
        $this->assertSame(3.2, BookingConditions::incomeToRentRatio('application', '315000', '100000'));
        $this->assertSame(3.1, BookingConditions::incomeToRentRatio('application', '314999', '100000'));
        $this->assertNull(BookingConditions::incomeToRentRatio('stay', '950000', '300000'));
        $this->assertNull(BookingConditions::incomeToRentRatio('application', null, '300000'));
        $this->assertNull(BookingConditions::incomeToRentRatio('application', '950000', '0.00'));
    }

    public function test_the_applicant_the_landlord_and_the_public_tunnel_never_receive_the_income_nor_its_ratio(): void
    {
        $booking = $this->application();

        foreach (['le candidat' => $this->client, 'le bailleur' => $this->landlord] as $qui => $lecteur) {
            $corps = (string) $this->comme($lecteur)->getJson("/api/bookings/{$booking->id}")->assertOk()
                ->assertJsonMissingPath('data.income_to_rent_ratio')
                ->assertJsonMissingPath('data.declared_monthly_income_masked')
                ->assertJsonMissingPath('data.guarantors')
                ->assertJsonMissingPath('data.has_guarantor')
                ->getContent();
            $this->assertStringNotContainsString(self::REVENU, $corps, $qui);
        }

        $candidat = User::factory()->create();
        $corps = (string) $this->comme($candidat)->postJson("/api/public/properties/{$this->monthly->slug}/booking-request", [
            'start_date' => '2026-12-01', 'end_date' => '2027-12-01', 'guests' => 1, 'declared_monthly_income' => 870000,
        ])->assertCreated()->assertJsonMissingPath('data.income_to_rent_ratio')->getContent();
        $this->assertStringNotContainsString('870000', $corps);
        $this->assertSame('870000', Booking::query()->latest('id')->firstOrFail()->declared_monthly_income);
    }

    public function test_ac4_another_applicant_on_the_same_property_reads_neither_guarantor_nor_income(): void
    {
        $booking = $this->application();
        $this->comme($this->agent)->postJson("/api/bookings/{$booking->id}/guarantors", ['first_name' => 'Ibrahima', 'last_name' => 'Dieng'])->assertCreated();

        $autre = User::factory()->create();
        $this->comme($autre)->postJson("/api/public/properties/{$this->monthly->slug}/booking-request", [
            'start_date' => '2026-12-01', 'end_date' => '2027-12-01', 'guests' => 1,
        ])->assertCreated();

        $this->getJson("/api/bookings/{$booking->id}")->assertForbidden();
        $corps = (string) $this->getJson('/api/bookings')->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonMissingPath('data.0.income_to_rent_ratio')
            ->assertJsonMissingPath('data.0.guarantors')
            ->getContent();
        $this->assertStringNotContainsString(self::REVENU, $corps);
        $this->assertStringNotContainsString('Ibrahima', $corps);
    }

    public function test_an_offer_or_a_stay_cannot_declare_an_income(): void
    {
        $sale = Property::factory()->published()->create([
            'agency_id' => $this->agency->id, 'currency' => Currency::XOF, 'contract_type' => ContractType::Sale, 'price' => '95000000',
        ]);
        Sanctum::actingAs($this->agent);
        $this->postJson('/api/bookings', [
            'kind' => 'offer', 'property_id' => $sale->id, 'customer_id' => $this->customer->id,
            'total_amount' => 90000000, 'declared_monthly_income' => 950000,
        ])->assertStatus(422)->assertJsonPath('code', 'booking.field_not_for_kind');

        $daily = Property::factory()->published()->create([
            'agency_id' => $this->agency->id, 'currency' => Currency::XOF, 'contract_type' => ContractType::Rent,
            'rent_period' => RentPeriod::Daily, 'price' => '20000',
        ]);
        $this->comme(User::factory()->create())->postJson("/api/public/properties/{$daily->slug}/booking-request", [
            'start_date' => '2026-12-01', 'end_date' => '2026-12-03', 'guests' => 1, 'declared_monthly_income' => 950000,
        ])->assertStatus(422)->assertJsonPath('code', 'booking.field_not_for_kind');
        $this->assertDatabaseCount('bookings', 0);
    }

    public function test_the_income_never_enters_the_activity_log(): void
    {
        $booking = $this->application();
        $booking->update(['declared_monthly_income' => '1200000', 'notes' => 'relu']);

        $journal = Activity::query()->where('subject_type', $booking->getMorphClass())->where('subject_id', $booking->id)->get();
        $this->assertNotEmpty($journal);
        $tout = $journal->map(fn (Activity $a) => json_encode([$a->properties, $a->attribute_changes]))->implode('');
        $this->assertStringNotContainsString('declared_monthly_income', $tout);
        $this->assertStringNotContainsString(self::REVENU, $tout);
        $this->assertStringNotContainsString('1200000', $tout);
    }

    public function test_the_agency_admin_reads_the_income_in_clear_under_step_up_and_it_is_logged(): void
    {
        $booking = $this->application();
        $admin = $this->agencyAdmin($this->agency);

        $this->comme($admin)->getJson("/api/bookings/{$booking->id}/sensitive")
            ->assertForbidden()->assertJsonPath('code', 'two_factor_step_up_required');

        $this->flushHeaders();
        $this->app['auth']->forgetGuards();
        $this->actingAsWithStepUp($admin->fresh());
        $this->getJson("/api/bookings/{$booking->id}/sensitive")->assertOk()
            ->assertExactJson(['data' => ['id' => $booking->id, 'declared_monthly_income' => 950000]]);

        $ligne = Activity::query()->where('log_name', PersonalDataAccessLogger::LOG_NAME)->sole();
        $this->assertSame(PersonalDataAccessLogger::SURFACE_BOOKING_SENSITIVE, $ligne->properties->get('surface'));
        $this->assertSame($this->agency->id, (int) $ligne->properties->get('agency_id'));

        foreach ([$this->agent, $this->landlord, $this->client, $this->agencyAdmin(Agency::factory()->create())] as $lecteur) {
            $this->flushHeaders();
            $this->app['auth']->forgetGuards();
            $this->actingAsWithStepUp(tap($lecteur, fn (User $u) => $u->two_factor_enabled || $u->forceFill(['two_factor_enabled' => true, 'two_factor_secret' => self::TEST_TWO_FACTOR_SECRET])->save())->fresh());
            $this->getJson("/api/bookings/{$booking->id}/sensitive")->assertForbidden();
        }
        $this->assertSame(1, Activity::query()->where('log_name', PersonalDataAccessLogger::LOG_NAME)->count());
    }

    public function test_the_applicant_s_own_archive_carries_the_income_and_the_author_s_does_not(): void
    {
        $booking = $this->application();
        $archive = app(DataExportBuilder::class);

        $duCandidat = collect($archive->payloads($this->client)['bookings.json'])->firstWhere('id', $booking->id);
        $this->assertSame(self::REVENU, $duCandidat['declared_monthly_income']);

        // L'agent qui l'a saisie n'en reçoit que l'acte ; une ligne entière (bailleur du bien) passe par
        // `toArray()`, dont `Booking::$hidden` retire le revenu.
        $deLAuteur = collect($archive->payloads($this->agent)['bookings.json'])->firstWhere('id', $booking->id);
        $this->assertNotNull($deLAuteur);
        $this->assertArrayNotHasKey('declared_monthly_income', $deLAuteur);
        $this->assertArrayNotHasKey('declared_monthly_income', $booking->fresh()->toArray());
    }
}
