<?php

namespace Tests\Feature\Lecture;

use App\Models\Agency;
use App\Models\Guarantor;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-3006 — `CautionsLisibles` ne lit plus que la colonne `guarantors.agency_id` : le repli sur
 * l'agence de l'auteur (`addedBy->agency_id`) est tombé. Une caution écrite sans agence par un
 * auteur d'UNE seule agence (profil actif) était lue par ce repli ; la reprise de données la rattache
 * à cette agence, pour que son personnel la lise encore. Les autres restent sans agence, comme le
 * repli les laissait.
 */
class CautionsSansAgenceRattacheesTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private const MIGRATION = 'database/migrations/2026_11_28_120000_rattacher_les_cautions_sans_agence_a_leur_auteur.php';

    public function test_la_caution_sans_agence_d_un_auteur_d_une_seule_agence_y_est_rattachee(): void
    {
        $a = Agency::factory()->create();
        $b = Agency::factory()->create();

        $agentDeA = $this->agencyAgent($a);
        $bailleurDeDeuxAgences = User::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $bailleurDeDeuxAgences->id, 'agency_id' => $a->id]);
        OwnerProfile::factory()->create(['user_id' => $bailleurDeDeuxAgences->id, 'agency_id' => $b->id]);
        $suspendu = $this->agencyAgent($a);
        AgentProfile::query()->where('user_id', $suspendu->id)->update(['status' => 'suspended']);
        $parti = $this->agencyAgent($a);
        AgentProfile::query()->where('user_id', $parti->id)->delete();

        $rattachee = Guarantor::factory()->create(['added_by_id' => $agentDeA->id, 'agency_id' => null]);
        $ambigue = Guarantor::factory()->create(['added_by_id' => $bailleurDeDeuxAgences->id, 'agency_id' => null]);
        $duSuspendu = Guarantor::factory()->create(['added_by_id' => $suspendu->id, 'agency_id' => null]);
        $duParti = Guarantor::factory()->create(['added_by_id' => $parti->id, 'agency_id' => null]);
        $dejaPosee = Guarantor::factory()->create(['added_by_id' => $agentDeA->id, 'agency_id' => $b->id]);

        $admin = $this->agencyAdmin($a);
        $this->actingAsApi($admin)->getJson("/api/guarantors/{$rattachee->id}")->assertForbidden();

        (require base_path(self::MIGRATION))->up();

        $this->assertSame($a->id, $rattachee->fresh()->agency_id);
        $this->assertNull($ambigue->fresh()->agency_id);
        $this->assertNull($duSuspendu->fresh()->agency_id);
        $this->assertNull($duParti->fresh()->agency_id);
        $this->assertSame($b->id, $dejaPosee->fresh()->agency_id);
        $this->actingAsApi($admin)->getJson("/api/guarantors/{$rattachee->id}")->assertOk();
    }
}
