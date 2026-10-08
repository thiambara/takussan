<?php

namespace Tests\Feature\Governance;

use App\Models\Activity;
use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Enums\Capability;
use App\Models\Integration;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Services\Membership\AgencyRoleService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;

/**
 * TCK-601 (AC15, ADR-0044 §3) — les actes de gouvernance laissent une trace, en liste blanche : la
 * différence exacte des capacités d'un rôle, l'ancien et le nouveau taux de commission, un drapeau
 * pour les identifiants d'une intégration — jamais un RIB ni un secret.
 */
class GovernanceAuditTest extends ApiTestCase
{
    use RefreshDatabase;

    private const RIB_TEMOIN = 'SN08SN0100152000048500003035';

    private const SECRET_TEMOIN = 'sk_live_temoin_601';

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    /** La ligne entière, toutes colonnes, telle qu'elle est stockée. */
    private function journalBrut(): string
    {
        return DB::table('activity_log')->get()->toJson();
    }

    public function test_remplacer_les_capacites_d_un_role_ecrit_la_difference_exacte(): void
    {
        $agency = Agency::factory()->create();
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $roles = app(AgencyRoleService::class);
        $role = $roles->create($agency, ['name' => 'Gestion', 'base_profile_type' => AgencyRoleBaseType::Agent->value]);
        $roles->replaceCapabilities($role, [Capability::CrmExport, Capability::PaymentsExport]);
        $this->actingAsWithStepUp($admin);

        $this->apiPut("/api/agencies/{$agency->id}/roles/{$role->id}/capabilities", [
            'capabilities' => [Capability::PaymentsExport->value, Capability::ReportsExport->value],
        ])->assertOk();

        $entry = Activity::query()->where('event', 'role_capabilities_changed')->latest('id')->first();
        $this->assertSame([Capability::ReportsExport->value], $entry->properties['added']);
        $this->assertSame([Capability::CrmExport->value], $entry->properties['removed']);
        $this->assertSame($admin->id, $entry->causer_id);
        $this->assertSame($agency->id, $entry->agency_id);

        // Un remplacement identique n'écrit rien.
        $count = Activity::query()->where('event', 'role_capabilities_changed')->count();
        $roles->replaceCapabilities($role->fresh(), [Capability::PaymentsExport, Capability::ReportsExport]);
        $this->assertSame($count, Activity::query()->where('event', 'role_capabilities_changed')->count());
    }

    public function test_creer_cloner_et_affecter_un_role_se_lisent_au_journal(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $roles = app(AgencyRoleService::class);
        $source = $roles->replaceCapabilities(
            $roles->create($agency, ['name' => 'Source', 'base_profile_type' => AgencyRoleBaseType::Agent->value]),
            [Capability::CrmExport],
        );

        $clone = $roles->create($agency, ['name' => 'Clone', 'base_profile_type' => AgencyRoleBaseType::Agent->value, 'clone_from' => $source->id]);
        $created = Activity::query()->where('event', 'role_created')->where('subject_id', $clone->id)->sole();
        $this->assertSame($source->id, $created->properties['clone_from']);
        $this->assertSame([Capability::CrmExport->value], $created->properties['capabilities']);
        // Le `created` du modèle ne double pas l'entrée.
        $this->assertSame(0, Activity::query()->where('subject_type', AgencyRole::class)->where('event', 'created')->count());

        $agent = AgentProfile::factory()->create(['agency_id' => $agency->id]);
        $previous = $agent->agency_role_id;
        $roles->assign($agent, $clone);
        $assigned = Activity::query()->where('event', 'role_assigned')->where('subject_id', $agent->id)->sole();
        $this->assertEqualsCanonicalizing(['from_role_id' => $previous, 'to_role_id' => $clone->id, 'role' => 'Clone'], $assigned->properties->all());
        $this->assertSame(0, Activity::query()->where('subject_type', AgentProfile::class)->where('subject_id', $agent->id)->where('event', 'updated')->count());
    }

    public function test_le_rib_d_un_bailleur_n_entre_jamais_au_journal(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $owner = OwnerProfile::factory()->create(['agency_id' => $agency->id, 'rib' => self::RIB_TEMOIN, 'tax_id' => 'NINEA-TEMOIN-601']);

        $owner->update(['rib' => strrev(self::RIB_TEMOIN), 'id_document_number' => 'PIECE-TEMOIN-601']);
        $owner->update(['status' => 'inactive', 'rib' => self::RIB_TEMOIN]);

        $journal = $this->journalBrut();
        foreach ([self::RIB_TEMOIN, strrev(self::RIB_TEMOIN), 'NINEA-TEMOIN-601', 'PIECE-TEMOIN-601'] as $temoin) {
            $this->assertStringNotContainsString($temoin, $journal);
        }
        // Le statut, lui, est tracé.
        $status = Activity::query()->where('subject_type', OwnerProfile::class)->where('event', 'updated')->sole();
        $this->assertSame('inactive', $status->attribute_changes['attributes']['status']);
        $this->assertSame(['status'], array_keys($status->attribute_changes['attributes']));
    }

    public function test_le_taux_de_commission_de_l_agence_porte_ancien_et_nouveau(): void
    {
        // Relue : spatie prend l'ancien état en mémoire et le nouveau en base — un modèle tout juste
        // créé, sans ses défauts de colonne, ferait passer `moderation_required` de null à false.
        $agency = Agency::factory()->create(['commission_rate' => 10])->refresh();
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        $agency->update(['commission_rate' => 12.5, 'description' => 'Texte libre non tracé']);

        $entry = Activity::query()->where('subject_type', Agency::class)->where('subject_id', $agency->id)->where('event', 'updated')->sole();
        $this->assertEquals(10, $entry->attribute_changes['old']['commission_rate']);
        $this->assertEquals(12.5, $entry->attribute_changes['attributes']['commission_rate']);
        $this->assertSame(['commission_rate'], array_keys($entry->attribute_changes['attributes']));
        $this->assertSame($agency->id, $entry->agency_id);
    }

    public function test_les_identifiants_d_une_integration_se_lisent_par_un_drapeau(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $integration = Integration::factory()->create(['agency_id' => $agency->id, 'provider' => 'stripe', 'credentials' => ['api_key' => self::SECRET_TEMOIN]]);

        $integration->update(['credentials' => ['api_key' => strrev(self::SECRET_TEMOIN)]]);
        $integration->update(['last_used_at' => now(), 'health_status' => 'healthy']);

        $entries = Activity::query()->where('subject_type', Integration::class)->orderBy('id')->get();
        $this->assertSame(['created', 'updated'], $entries->pluck('event')->all());
        $this->assertTrue($entries[0]->attribute_changes['attributes']['credentials_changed']);
        $this->assertSame(['credentials_changed' => true], $entries[1]->attribute_changes['attributes']);

        $journal = $this->journalBrut();
        $this->assertStringNotContainsString(self::SECRET_TEMOIN, $journal);
        $this->assertStringNotContainsString(strrev(self::SECRET_TEMOIN), $journal);
    }
}
