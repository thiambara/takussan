<?php

namespace Tests\Feature\Payments;

use App\Models\Address;
use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\Currency;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentFrequency;
use App\Models\Integration;
use App\Models\Lease;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2851 — la carte « Mon logement » de l'accueil du locataire, lue dans `GET /api/me/rent-summary` :
 * la fin du bail, la photo et le lieu du logement, l'agent qui le gère (sans aucun contact : le
 * locataire lui écrit par la messagerie), et les moyens de paiement en ligne réellement ouverts.
 */
class TenantRentSummaryLeaseCardTest extends TestCase
{
    use RefreshDatabase;

    private User $tenant;

    private User $agent;

    private Agency $agency;

    private Lease $lease;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        Carbon::setTestNow('2026-11-11 10:00:00');

        $this->agency = Agency::factory()->create(['currency' => Currency::XOF, 'phone' => '+221338000000']);
        $this->agent = User::factory()->create([
            'first_name' => 'Sokhna',
            'last_name' => 'Sène',
            'phone' => '+221779998877',
            'email' => 'sokhna.sene@agence.test',
        ]);
        AgentProfile::query()->create(['user_id' => $this->agent->id, 'agency_id' => $this->agency->id, 'status' => AgentProfileStatus::Active]);

        $this->tenant = User::factory()->create();
        $landlord = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $landlord->id, 'agency_id' => $this->agency->id]);
        Address::factory()->create([
            'addressable_type' => Property::class,
            'addressable_id' => $property->id,
            'street' => 'Villa 112, rue SC-3',
            'neighborhood' => 'Sacré-Cœur 3',
            'city' => 'Dakar',
        ]);
        $property->addMedia(UploadedFile::fake()->image('facade.jpg'))->toMediaCollection('photos');

        $this->lease = Lease::factory()->create([
            'agency_id' => $this->agency->id,
            'property_id' => $property->id,
            'landlord_id' => $landlord->id,
            'agent_id' => $this->agent->id,
            'tenant_id' => Customer::factory()->create(['user_id' => $this->tenant->id, 'agency_id' => $this->agency->id])->id,
            'status' => LeaseStatus::Active,
            'currency' => Currency::XOF,
            'start_date' => '2025-09-01',
            'end_date' => '2027-08-31',
            'monthly_rent' => 250_000,
            'payment_frequency' => PaymentFrequency::Monthly,
            'payment_day' => 1,
        ]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function summary(): TestResponse
    {
        Sanctum::actingAs($this->tenant);

        return $this->getJson('/api/me/rent-summary')->assertOk();
    }

    public function test_ac1_la_fin_du_bail_la_photo_le_lieu_et_l_agent_sans_contact(): void
    {
        $response = $this->summary();

        $response->assertJsonPath('data.lease.end_date', '2027-08-31')
            ->assertJsonPath('data.lease.agent.user_id', $this->agent->id)
            ->assertJsonPath('data.lease.agent.name', 'Sokhna Sène')
            ->assertJsonPath('data.lease.property.address_line', 'Sacré-Cœur 3, Dakar');
        $this->assertArrayHasKey('avatar_url', $response->json('data.lease.agent'));
        $this->assertSame(['user_id', 'name', 'avatar_url'], array_keys($response->json('data.lease.agent')));
        $this->assertNotEmpty($response->json('data.lease.property.cover_url'));

        $body = $response->getContent();
        $this->assertStringNotContainsString('779998877', $body, 'jamais le téléphone de l agente');
        $this->assertStringNotContainsString('sokhna.sene@agence.test', $body, 'jamais son courriel');
        $this->assertStringNotContainsString('Villa 112', $body, 'le quartier et la ville, jamais la rue');
    }

    public function test_ac2_l_agent_suspendu_n_est_plus_l_agent_du_bail(): void
    {
        AgentProfile::query()->where('user_id', $this->agent->id)->update(['status' => AgentProfileStatus::Suspended->value]);

        $this->summary()->assertJsonPath('data.lease.agent', null);
    }

    public function test_sans_agent_sur_le_bail_agent_est_null(): void
    {
        $this->lease->update(['agent_id' => null]);

        $this->summary()->assertJsonPath('data.lease.agent', null);
    }

    public function test_les_moyens_en_ligne_sont_ceux_que_la_passerelle_ouvre(): void
    {
        $this->summary()->assertJsonPath('data.online_means', []);

        Integration::factory()->create([
            'agency_id' => $this->agency->id,
            'provider' => 'wave',
            'is_active' => true,
            'credentials' => ['api_key' => 'wave_key', 'webhook_secret' => 'wave_secret'],
        ]);

        $this->summary()->assertJsonPath('data.online_means', ['wave']);
    }

    public function test_ac5_le_locataire_ecrit_a_l_agent_de_son_bail(): void
    {
        Sanctum::actingAs($this->tenant);

        $this->postJson('/api/conversations', [
            'participants' => [$this->agent->id],
            'initial_message' => 'Bonjour, une question sur mon bail.',
        ])->assertCreated();
    }

    public function test_l_agent_suspendu_n_est_plus_joignable_par_le_bail(): void
    {
        AgentProfile::query()->where('user_id', $this->agent->id)->update(['status' => AgentProfileStatus::Suspended->value]);
        Sanctum::actingAs($this->tenant);

        $this->postJson('/api/conversations', [
            'participants' => [$this->agent->id],
            'initial_message' => 'Bonjour',
        ])->assertUnprocessable();
    }

    public function test_le_bail_termine_ne_joint_plus_son_agent(): void
    {
        $this->lease->update(['status' => LeaseStatus::Terminated]);
        Sanctum::actingAs($this->tenant);

        $this->postJson('/api/conversations', [
            'participants' => [$this->agent->id],
            'initial_message' => 'Bonjour',
        ])->assertUnprocessable();
    }
}
