<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Guarantor;
use App\Models\Lease;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\User;
use App\Services\Account\AccountDeletionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\ApiTestCase;

/**
 * TCK-1993 (P175.01) — la caution porte son agence (`guarantors.agency_id`), posée à la création :
 * elle ne dépend plus de la vie de son auteur. Avant, `GuarantorPolicy` lisait l'agence par
 * `addedBy->agency_id`, et une caution dont l'auteur avait effacé son compte n'était plus lisible
 * par personne dans l'agence.
 */
class CautionApresEffacementDeLAuteurTest extends ApiTestCase
{
    use RefreshDatabase;

    private const MIGRATION = '2026_10_23_230000_add_agency_id_to_guarantors_table.php';

    private Agency $agency;

    private User $auteur;

    private User $collegue;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->auteur = User::factory()->withAgentProfile($this->agency)->create();
        $this->collegue = User::factory()->withAgentProfile($this->agency)->create();
        $this->admin = User::factory()->create();
        AgencyAdminProfile::factory()->create(['user_id' => $this->admin->id, 'agency_id' => $this->agency->id]);
    }

    private function creerParLAuteur(): int
    {
        return (int) $this->actingAsApi($this->auteur)->postJson('/api/guarantors', [
            'first_name' => 'Awa',
            'last_name' => 'Ndiaye',
            'phone' => '+221770000001',
        ])->assertCreated()->json('data.id');
    }

    public function test_la_caution_creee_porte_l_agence_de_son_auteur(): void
    {
        $id = $this->creerParLAuteur();

        $this->assertSame($this->agency->id, (int) DB::table('guarantors')->where('id', $id)->value('agency_id'));
    }

    public function test_l_agence_lit_et_modifie_la_caution_apres_l_effacement_de_son_auteur(): void
    {
        $id = $this->creerParLAuteur();

        app(AccountDeletionService::class)->anonymize($this->auteur->fresh(), false);

        $this->actingAsApi($this->collegue->fresh())->getJson("/api/guarantors/{$id}")->assertOk();
        $this->actingAsApi($this->admin->fresh())->getJson("/api/guarantors/{$id}")->assertOk();
        $this->actingAsApi($this->admin->fresh())
            ->putJson("/api/guarantors/{$id}", ['occupation' => 'Commerçante'])
            ->assertOk();
    }

    public function test_une_autre_agence_ne_lit_toujours_pas_la_caution(): void
    {
        $id = $this->creerParLAuteur();
        $etranger = User::factory()->withAgentProfile(Agency::factory()->create())->create();

        $this->actingAsApi($etranger)->getJson("/api/guarantors/{$id}")->assertForbidden();
    }

    public function test_la_caution_creee_depuis_un_bail_porte_l_agence_du_bail(): void
    {
        $property = Property::factory()->create(['agency_id' => $this->agency->id]);
        $lease = Lease::factory()->create(['property_id' => $property->id, 'agency_id' => $this->agency->id]);

        $id = $this->actingAsApi($this->admin)->postJson("/api/leases/{$lease->id}/guarantors", [
            'first_name' => 'Moussa',
            'last_name' => 'Diop',
        ])->assertCreated()->json('data.guarantor_id');

        $this->assertSame($this->agency->id, (int) DB::table('guarantors')->where('id', $id)->value('agency_id'));
    }

    public function test_la_migration_rattrape_les_cautions_existantes(): void
    {
        $autre = Agency::factory()->create();
        $property = Property::factory()->create(['agency_id' => $autre->id]);

        // Rattachée à un bail : l'agence du bail, même si l'auteur est d'une autre agence.
        $parBail = Guarantor::factory()->create(['added_by_id' => $this->auteur->id]);
        Lease::factory()->create(['property_id' => $property->id, 'agency_id' => $autre->id, 'guarantor_id' => $parBail->id]);

        // Sans bail, auteur effacé (profil supprimé en douceur) : l'agence de ses profils.
        $parAuteur = Guarantor::factory()->create(['added_by_id' => $this->collegue->id]);
        AgentProfile::query()->where('user_id', $this->collegue->id)->delete();
        $this->collegue->delete();

        // Auteur dans deux agences, sans bail : rien à déduire.
        $ambigu = User::factory()->withAgentProfile($this->agency)->withAgentProfile($autre)->create();
        $indecidable = Guarantor::factory()->create(['added_by_id' => $ambigu->id]);

        $migration = require database_path('migrations/'.self::MIGRATION);
        $migration->down();
        $migration->up();

        $agence = fn (Guarantor $g) => DB::table('guarantors')->where('id', $g->id)->value('agency_id');
        $this->assertSame($autre->id, (int) $agence($parBail));
        $this->assertSame($this->agency->id, (int) $agence($parAuteur));
        $this->assertNull($agence($indecidable));
    }
}
