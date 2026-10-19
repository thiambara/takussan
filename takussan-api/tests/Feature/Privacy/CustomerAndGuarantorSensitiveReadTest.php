<?php

namespace Tests\Feature\Privacy;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\IdType;
use App\Models\Guarantor;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use App\Services\Privacy\PersonalDataAccessLogger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Activitylog\Models\Activity;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\Support\SessionsDImpersonation;

/**
 * TCK-955 (ADR-0070 § 5 et 6, amendé le 2026-10-19) — la pièce du client, et la pièce et le revenu
 * de la caution, se lisent en clair par une route dédiée : l'admin de l'agence du sujet (et le
 * super-admin, par `Gate::before`), sous step-up, journalisée ; jamais l'agent, le bailleur ni une
 * session d'impersonation.
 */
class CustomerAndGuarantorSensitiveReadTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;
    use SessionsDImpersonation;

    private const NUMERO = 'SN-998877';

    private const NUMERO_CAUTION = 'CNI-445566';

    private Agency $agency;

    private User $admin;

    private User $agent;

    private User $landlord;

    private Customer $client;

    private Guarantor $caution;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->admin = $this->agencyAdmin($this->agency);
        $this->agent = User::factory()->withTwoFactor()->withAgentProfile($this->agency)->create();
        $this->landlord = User::factory()->withTwoFactor()->create();
        $this->materializeRoleProfile($this->landlord, 'owner', $this->agency);

        $this->client = Customer::factory()->create([
            'agency_id' => $this->agency->id, 'added_by_id' => $this->agent->id,
            'id_type' => IdType::IdCard, 'id_number' => self::NUMERO,
        ]);
        $property = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->landlord->id]);
        Lease::factory()->create([
            'property_id' => $property->id, 'landlord_id' => $this->landlord->id,
            'tenant_id' => $this->client->id, 'agency_id' => $this->agency->id,
        ]);
        $this->caution = Guarantor::factory()->create([
            'added_by_id' => $this->agent->id,
            'id_type' => IdType::Passport, 'id_number' => self::NUMERO_CAUTION, 'monthly_income' => '800000.00',
        ]);
    }

    private function lignes(?string $surface = null): int
    {
        return Activity::query()
            ->where('log_name', PersonalDataAccessLogger::LOG_NAME)
            ->when($surface !== null, fn ($q) => $q->where('properties->surface', $surface))
            ->count();
    }

    private function comme(User $user): static
    {
        $this->flushHeaders();
        $this->app['auth']->forgetGuards();
        $this->actingAsWithStepUp($user->fresh());

        return $this;
    }

    /** AC1 et AC2 — l'admin lit la pièce du client sous step-up, et la lecture est journalisée une fois. */
    public function test_l_admin_lit_la_piece_du_client_sous_step_up_et_c_est_journalise(): void
    {
        $this->actingAs($this->admin, 'sanctum');
        $this->getJson("/api/customers/{$this->client->id}/sensitive")
            ->assertForbidden()->assertJsonPath('code', 'two_factor_step_up_required');
        $this->assertSame(0, $this->lignes());

        $this->comme($this->admin)->getJson("/api/customers/{$this->client->id}/sensitive")
            ->assertOk()
            ->assertExactJson(['data' => ['id' => $this->client->id, 'id_type' => 'id_card', 'id_number' => self::NUMERO]]);
        $this->getJson("/api/customers/{$this->client->id}/sensitive")->assertOk();

        $ligne = Activity::query()->where('log_name', PersonalDataAccessLogger::LOG_NAME)->sole();
        $this->assertSame(PersonalDataAccessLogger::SURFACE_CUSTOMER_SENSITIVE, $ligne->properties->get('surface'));
        $this->assertSame($this->admin->id, (int) $ligne->causer_id);
        $this->assertSame($this->client->id, (int) $ligne->subject_id);
        $this->assertSame($this->agency->id, (int) $ligne->agency_id);
    }

    /** AC3 — l'agent auteur, le bailleur, l'admin d'ailleurs et l'admin face à un client sans agence : 403, sans ligne. */
    public function test_les_autres_lecteurs_sont_refuses_sans_ligne(): void
    {
        $sansAgence = Customer::factory()->create(['agency_id' => null, 'added_by_id' => $this->agent->id, 'id_number' => 'X-1']);
        $refus = [
            'agent auteur' => [$this->agent, $this->client],
            'bailleur' => [$this->landlord, $this->client],
            'admin d\'une autre agence' => [$this->agencyAdmin(Agency::factory()->create()), $this->client],
            'admin, client sans agence' => [$this->admin, $sansAgence],
        ];
        foreach ($refus as $cas => [$lecteur, $client]) {
            $this->comme($lecteur)->getJson("/api/customers/{$client->id}/sensitive")
                ->assertForbidden()->assertJsonPath('code', 'http.forbidden');
        }
        $this->assertSame(0, $this->lignes());
    }

    /** AC3, amendement d'ADR-0070 — le super-admin lit sous step-up, client sans agence compris, et c'est journalisé. */
    public function test_le_super_admin_lit_par_gate_before_et_c_est_journalise(): void
    {
        $sansAgence = Customer::factory()->create(['agency_id' => null, 'id_number' => 'X-1']);
        $superAdmin = $this->apiActingAsRole('super_admin');

        $this->comme($superAdmin)->getJson("/api/customers/{$sansAgence->id}/sensitive")
            ->assertOk()->assertJsonPath('data.id_number', 'X-1');
        $this->getJson("/api/guarantors/{$this->caution->id}/sensitive")
            ->assertOk()->assertJsonPath('data.id_number', self::NUMERO_CAUTION);

        $this->assertSame(1, $this->lignes(PersonalDataAccessLogger::SURFACE_CUSTOMER_SENSITIVE));
        $this->assertSame(1, $this->lignes(PersonalDataAccessLogger::SURFACE_GUARANTOR_SENSITIVE));
    }

    /** AC4 — la caution : mêmes règles, revenu en nombre, ligne rattachée à l'agence validée. */
    public function test_la_caution_se_lit_par_l_admin_et_sa_ligne_est_dans_le_journal_de_l_agence(): void
    {
        $this->actingAs($this->admin, 'sanctum');
        $this->getJson("/api/guarantors/{$this->caution->id}/sensitive")
            ->assertForbidden()->assertJsonPath('code', 'two_factor_step_up_required');

        $this->comme($this->admin)->getJson("/api/guarantors/{$this->caution->id}/sensitive")
            ->assertOk()
            ->assertExactJson(['data' => [
                'id' => $this->caution->id, 'id_type' => 'passport',
                'id_number' => self::NUMERO_CAUTION, 'monthly_income' => 800000,
            ]]);

        $ligne = Activity::query()->where('log_name', PersonalDataAccessLogger::LOG_NAME)->sole();
        $this->assertSame(PersonalDataAccessLogger::SURFACE_GUARANTOR_SENSITIVE, $ligne->properties->get('surface'));
        $this->assertSame($this->agency->id, (int) $ligne->agency_id);

        $journal = $this->getJson('/api/audit-log?log_name='.PersonalDataAccessLogger::LOG_NAME)->assertOk()->json('data');
        $this->assertContains($ligne->id, array_column($journal, 'id'), 'la ligne est visible dans le journal de l\'agence');

        foreach ([$this->agent, $this->landlord, $this->agencyAdmin(Agency::factory()->create())] as $lecteur) {
            $this->comme($lecteur)->getJson("/api/guarantors/{$this->caution->id}/sensitive")
                ->assertForbidden()->assertJsonPath('code', 'http.forbidden');
        }
        $sansAgence = Guarantor::factory()->create(['added_by_id' => User::factory()->create()->id, 'id_number' => 'X-2']);
        $this->comme($this->admin)->getJson("/api/guarantors/{$sansAgence->id}/sensitive")->assertForbidden();
        $this->assertSame(1, $this->lignes());
    }

    /** AC5 — une session d'impersonation d'un admin d'agence est refusée sur les deux routes. */
    public function test_l_impersonation_est_refusee(): void
    {
        $session = $this->ouvrirUneSession(cible: $this->admin);

        foreach (["/api/customers/{$this->client->id}/sensitive", "/api/guarantors/{$this->caution->id}/sensitive"] as $uri) {
            $this->avecLeJeton($session['jeton'])->getJson($uri)
                ->assertForbidden()->assertJsonPath('code', 'impersonation.read_only');
        }
        $this->assertSame(0, $this->lignes());
    }
}
