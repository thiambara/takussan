<?php

namespace Tests\Feature\Api;

use App\Models\Enums\MaintenancePriority;
use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-474 — `resolution_report` était validé et `$fillable` sans colonne : un `PATCH`
 * qui le portait rendait 500 (`SQLSTATE[42703] Undefined column`).
 *
 * La décision du ticket est le RETRAIT du champ, pas la création de la colonne : le
 * rapport d'intervention passe par `resolution_notes` (texte) et la collection média
 * `completion_photos`. `docs/models-spec.md` ne déclare pas `resolution_report`, aucune
 * ressource ne l'expose, et le front ne l'envoie jamais.
 *
 * ⚠ Le champ n'est pas seulement retiré des règles : il est `prohibited`. Un simple
 * retrait rendrait 200 en avalant la valeur en silence — ce que l'AC1 refuse au même
 * titre que le 500. Le client doit apprendre que le champ n'existe pas.
 */
class MaintenanceResolutionReportTest extends TestCase
{
    use RefreshDatabase;

    /**
     * AC1 — la réponse est déterministe et NOMME le champ. Jamais 500.
     *
     * ⚠ `assertStatus(422)` seul serait vert sur une requête qui refuserait tout : le
     * témoin `test_resolution_notes_still_writes_to_the_database` en dessous est ce qui
     * empêche ce fichier d'être vert pour la pire des raisons.
     */
    public function test_patching_resolution_report_is_422_and_never_500(): void
    {
        [$mr, $provider] = $this->scaffold();

        Sanctum::actingAs($provider);

        $this->patchJson("/api/maintenance-requests/{$mr->id}", [
            'resolution_report' => 'Intervention terminée, joint remplacé.',
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['resolution_report']);
    }

    /**
     * AC1 — le champ prohibé ne fait pas non plus passer le reste du corps : le refus
     * est global, et rien n'est écrit à moitié.
     */
    public function test_a_prohibited_report_does_not_write_the_rest_of_the_payload(): void
    {
        [$mr, $provider] = $this->scaffold();

        Sanctum::actingAs($provider);

        $this->patchJson("/api/maintenance-requests/{$mr->id}", [
            'resolution_notes' => 'Ne doit pas être écrit.',
            'resolution_report' => 'Intervention terminée.',
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['resolution_report']);

        $this->assertNull($mr->refresh()->resolution_notes);
    }

    /**
     * AC2 — le TÉMOIN : le champ qui porte réellement le rapport s'écrit toujours, et
     * la valeur est relue EN BASE, pas dans la réponse. Un test qui relit le payload
     * qu'il vient d'envoyer ne prouve pas l'écriture.
     */
    public function test_resolution_notes_still_writes_to_the_database(): void
    {
        [$mr, $provider] = $this->scaffold();

        Sanctum::actingAs($provider);

        $this->patchJson("/api/maintenance-requests/{$mr->id}", [
            'resolution_notes' => 'Joint remplacé, mise en eau vérifiée.',
        ])->assertOk();

        $this->assertSame(
            'Joint remplacé, mise en eau vérifiée.',
            DB::table('maintenance_requests')->where('id', $mr->id)->value('resolution_notes'),
        );
    }

    /**
     * AC3 — le versant `$fillable`, qui n'est PAS observable par la route.
     *
     * ⚠ Mesuré par ablation : remettre `resolution_report` dans `$fillable` laisse les
     * tests HTTP ci-dessus VERTS, parce que `prohibited` court-circuite avant `fill()`.
     * Les deux moitiés du correctif ne se gardent donc pas l'une l'autre — celle-ci
     * s'éprouve au niveau du modèle, seule couche où le `$fillable` s'observe. Sans
     * elle, tout autre chemin d'écriture en masse (service, factory, FormRequest futur)
     * ressusciterait le 500 sans qu'un test ne bouge.
     */
    public function test_the_model_refuses_to_mass_assign_the_ghost_field(): void
    {
        [$mr] = $this->scaffold();

        $mr->fill(['resolution_report' => 'Rapport joint hors HTTP.'])->save();

        $this->assertTrue($mr->exists);
        $this->assertNotContains('resolution_report', $mr->getFillable());
    }

    /**
     * AC4 — le relevé est pris à la SOURCE, pas au code. `information_schema` est la
     * seule autorité sur l'existence d'une colonne ; ce test épingle la décision du
     * ticket pour qu'une réapparition de `resolution_report` soit un choix explicite
     * et non un effet de bord.
     */
    public function test_information_schema_confirms_the_column_state(): void
    {
        $columns = DB::table('information_schema.columns')
            ->where('table_name', 'maintenance_requests')
            ->where('column_name', 'like', 'resolution%')
            ->pluck('data_type', 'column_name')
            ->all();

        $this->assertSame(['resolution_notes' => 'text'], $columns);
    }

    /** @return array{0: MaintenanceRequest, 1: User} */
    private function scaffold(): array
    {
        $owner = User::factory()->create();
        $provider = User::factory()->create();

        $property = Property::factory()->create(['user_id' => $owner->id]);

        $mr = MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'requester_id' => User::factory()->create()->id,
            'assigned_to' => $provider->id,
            'priority' => MaintenancePriority::Normal,
            'status' => MaintenanceStatus::Open,
        ]);

        return [$mr, $provider];
    }
}
