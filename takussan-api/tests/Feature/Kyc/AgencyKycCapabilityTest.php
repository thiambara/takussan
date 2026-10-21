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
        // TCK-1148 (P82.05) — la lecture suit la même règle que le dépôt : sans la capacité, l'admin
        // ne lit plus le dossier. Avant, « la lecture reste à l'admin » (200).
        $this->apiGet("/api/agencies/{$agency->id}/kyc", $headers)->assertForbidden();
    }

    /**
     * TCK-1148 (P82.05) — le membre qui tient `agency.update_kyc` lit le dossier qu'il soumet, et
     * ses pièces ; l'admin dont le rôle retire la capacité ne lit ni l'un ni les autres.
     */
    public function test_le_membre_qui_tient_la_capacite_lit_le_dossier_et_ses_pieces(): void
    {
        $agency = Agency::factory()->create();
        $user = User::factory()->create();
        $profile = AgentProfile::factory()->create([
            'user_id' => $user->id,
            'agency_id' => $agency->id,
            'agency_role_id' => $this->customRole($agency, AgencyRoleBaseType::Agent, [Capability::AgencyUpdateKyc])->id,
        ]);
        $this->actingAs($user, 'sanctum');
        $headers = ['X-Profile-Id' => "agent:{$profile->id}"];
        $url = $this->upload($agency, $headers)->assertCreated()->json('data.documents.0.signed_url');

        $this->apiGet("/api/agencies/{$agency->id}/kyc", $headers)->assertOk()->assertJsonCount(1, 'data.documents');
        $this->get($url, $headers)->assertOk();

        $admin = User::factory()->create(['two_factor_enabled' => true, 'two_factor_secret' => self::TEST_TWO_FACTOR_SECRET]);
        $adminProfile = AgencyAdminProfile::factory()->create([
            'user_id' => $admin->id,
            'agency_id' => $agency->id,
            'agency_role_id' => $this->customRole($agency, AgencyRoleBaseType::AgencyAdmin, [Capability::AgencyUpdate])->id,
        ]);
        $this->actingAs($admin, 'sanctum');
        $adminHeaders = ['X-Profile-Id' => "agency_admin:{$adminProfile->id}"];
        $this->apiGet("/api/agencies/{$agency->id}/kyc", $adminHeaders)->assertForbidden();
        $this->get($url, $adminHeaders)->assertForbidden();
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
