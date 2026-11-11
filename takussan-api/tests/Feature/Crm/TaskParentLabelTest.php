<?php

namespace Tests\Feature\Crm;

use App\Models\Address;
use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\Enums\Capability;
use App\Models\Property;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2595 — le nom du bien parent d'une tâche se lit sous la règle de LECTURE du bien
 * (`PropertyPolicy::view`), plus sous celle de son écriture : l'agent sans `properties.update_any`
 * lisait « Un bien ». Aucune lecture élargie : un bien qu'il ne peut ouvrir reste `null`.
 */
class TaskParentLabelTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $x;

    private User $agent;

    private Property $f2;

    protected function setUp(): void
    {
        parent::setUp();

        $this->x = $this->agence();
        // Un rôle d'agence SANS `properties.update_any` (ni `properties.update_own` sur un bien d'autrui).
        $role = AgencyRole::factory()->for($this->x)->withCapabilities([Capability::PropertiesCreate])->create();
        $this->agent = $this->personnel($this->x, agencyRole: $role);
        $this->f2 = $this->bienDe($this->x, public: false);
        $this->f2->update(['title' => 'F2 · Grand Yoff']);
        Address::factory()->create(['addressable_type' => Property::class, 'addressable_id' => $this->f2->id, 'neighborhood' => 'Grand Yoff']);
    }

    private function tache(Property $parent): Task
    {
        return Task::factory()->create([
            'title' => "Faire signer l'état des lieux d'entrée",
            'taskable_type' => Property::class,
            'taskable_id' => $parent->id,
            'assigned_to_id' => $this->agent->id,
            'created_by_id' => $this->personnel($this->x)->id,
        ]);
    }

    /** @return array<string, mixed> */
    private function parentLu(Task $task): array
    {
        Sanctum::actingAs($this->agent);
        $liste = collect($this->getJson('/api/tasks')->assertOk()->json('data'))->firstWhere('id', $task->id);
        $this->assertNotNull($liste, 'la tâche assignée sort dans la liste');
        $this->assertSame($liste['taskable'], $this->getJson("/api/tasks/{$task->id}")->assertOk()->json('data.taskable'));

        return $liste['taskable'];
    }

    /** AC1 (R) — l'agent qui ouvre le bien de son agence en lit le titre, le quartier et la vignette. */
    public function test_ac1_l_agent_sans_update_any_lit_le_titre_du_bien(): void
    {
        $this->assertFalse($this->agent->can('update', $this->f2), 'prémisse : l\'agent ne modifie pas ce bien');
        $this->assertTrue($this->agent->can('view', $this->f2), 'prémisse : l\'agent ouvre ce bien');

        $this->f2->addMedia(UploadedFile::fake()->image('salon.jpg'))->toMediaCollection('photos');
        $parent = $this->parentLu($this->tache($this->f2));

        $this->assertSame('property', $parent['type']);
        $this->assertSame('F2 · Grand Yoff', $parent['label']);
        $this->assertSame('Grand Yoff', $parent['subtitle']);
        $this->assertNull($parent['phone']);
        $this->assertIsString($parent['cover_url']);
    }

    /** Aucune lecture élargie : le bien privé d'un bailleur hors agence ne se lit pas par la tâche. */
    public function test_un_bien_que_l_agent_n_ouvre_pas_reste_anonyme(): void
    {
        $prive = $this->bienDe(null, public: false);
        $prive->update(['title' => 'Villa du bailleur']);
        Address::factory()->create(['addressable_type' => Property::class, 'addressable_id' => $prive->id, 'neighborhood' => 'Ngor']);
        $this->assertFalse($this->agent->can('view', $prive), 'prémisse : l\'agent n\'ouvre pas ce bien');

        $parent = $this->parentLu($this->tache($prive));

        $this->assertSame(['type' => 'property', 'id' => $prive->id, 'label' => null, 'phone' => null, 'subtitle' => null, 'cover_url' => null], $parent);
    }

    /** Le client : nom, téléphone et `subtitle` en E.164 sous `CustomerPolicy::view` (inchangé). */
    public function test_le_client_lisible_porte_son_telephone_en_subtitle(): void
    {
        $fiche = $this->ficheClient($this->x, null, ['first_name' => 'Awa', 'last_name' => 'Diop', 'phone' => '77 123 45 67', 'added_by_id' => $this->agent->id]);
        $task = Task::factory()->forCustomer($fiche)->create(['assigned_to_id' => $this->agent->id, 'created_by_id' => $this->agent->id]);

        Sanctum::actingAs($this->agent);
        $parent = $this->getJson("/api/tasks/{$task->id}")->assertOk()->json('data.taskable');

        $this->assertSame('Awa Diop', $parent['label']);
        $this->assertSame($fiche->fresh()->phone, $parent['phone']);
        $this->assertSame('+221771234567', $parent['subtitle']);
        $this->assertNull($parent['cover_url']);
    }
}
