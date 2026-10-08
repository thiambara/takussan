<?php

namespace Tests\Feature\Kyc;

use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Enums\Capability;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use App\Services\Membership\AgencyRoleService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Tests\ApiTestCase;

/**
 * TCK-601 (AC9b) — déposer une pièce KYC d'agence et soumettre le dossier se jugent par la capacité
 * `agency.update_kyc`, plus par le seul profil d'admin.
 */
class AgencyKycCapabilityTest extends ApiTestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake();
    }

    /** @param  list<Capability>  $capabilities */
    private function customRole(Agency $agency, AgencyRoleBaseType $type, array $capabilities): AgencyRole
    {
        $roles = app(AgencyRoleService::class);
        $role = $roles->create($agency, ['name' => 'Rôle '.$type->value.' '.uniqid(), 'base_profile_type' => $type->value]);

        return $roles->replaceCapabilities($role, $capabilities);
    }

    private function upload(Agency $agency, array $headers): TestResponse
    {
        return $this->post("/api/agencies/{$agency->id}/kyc/documents", [
            'document_type' => 'rccm',
            'document' => UploadedFile::fake()->create('rccm.pdf', 20, 'application/pdf'),
        ], $headers + ['Accept' => 'application/json']);
    }

    public function test_un_agent_a_qui_un_role_donne_la_capacite_depose_une_piece(): void
    {
        $agency = Agency::factory()->create();
        $user = User::factory()->create();
        $profile = AgentProfile::factory()->create([
            'user_id' => $user->id,
            'agency_id' => $agency->id,
            'agency_role_id' => $this->customRole($agency, AgencyRoleBaseType::Agent, [Capability::AgencyUpdateKyc])->id,
        ]);

        $this->actingAs($user, 'sanctum');
        $this->upload($agency, ['X-Profile-Id' => "agent:{$profile->id}"])->assertCreated();
    }

    public function test_un_admin_dont_le_role_retire_la_capacite_est_refuse(): void
    {
        $agency = Agency::factory()->create();
        $user = User::factory()->create(['two_factor_enabled' => true, 'two_factor_secret' => self::TEST_TWO_FACTOR_SECRET]);
        $profile = AgencyAdminProfile::factory()->create([
            'user_id' => $user->id,
            'agency_id' => $agency->id,
            'agency_role_id' => $this->customRole($agency, AgencyRoleBaseType::AgencyAdmin, [Capability::AgencyUpdate])->id,
        ]);

        $this->actingAs($user, 'sanctum');
        $headers = ['X-Profile-Id' => "agency_admin:{$profile->id}"];
        $this->upload($agency, $headers)->assertForbidden();
        $this->apiPost("/api/agencies/{$agency->id}/kyc/submit", [], $headers)->assertForbidden();
        // La lecture reste à l'admin.
        $this->apiGet("/api/agencies/{$agency->id}/kyc", $headers)->assertOk();
    }

    public function test_l_admin_du_role_systeme_garde_le_depot(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        $this->upload($agency, [])->assertCreated();
    }

    /** Second chemin — la capacité tenue dans une AUTRE agence n'ouvre pas celle-ci. */
    public function test_la_capacite_d_une_autre_agence_n_ouvre_rien(): void
    {
        [$a, $b] = [Agency::factory()->create(), Agency::factory()->create()];
        $this->apiActingAsRole('agency_admin', ['agency' => $a]);

        $this->upload($b, [])->assertForbidden();
    }

    /** La capacité se juge sur l'agence du profil ACTIF : admin de B, mais agissant comme agent de A. */
    public function test_le_profil_actif_d_une_autre_agence_n_ouvre_pas_le_depot(): void
    {
        [$a, $b] = [Agency::factory()->create(), Agency::factory()->create()];
        $user = User::factory()->create(['two_factor_enabled' => true, 'two_factor_secret' => self::TEST_TWO_FACTOR_SECRET]);
        $agent = AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $a->id]);
        AgencyAdminProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $b->id]);

        $this->actingAs($user, 'sanctum');
        $this->upload($b, ['X-Profile-Id' => "agent:{$agent->id}"])->assertForbidden();
    }
}
