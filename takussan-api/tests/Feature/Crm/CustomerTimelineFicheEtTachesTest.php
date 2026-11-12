<?php

namespace Tests\Feature\Crm;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\ContactGestureChannel;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\Task;
use App\Models\User;
use App\Services\Crm\ContactGestureService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Spatie\Activitylog\Models\Activity;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2589 (vérification C/C2, d1 a) — le fil reprend ce que l'onglet « Activité » retiré portait
 * seul : la création de la fiche, les modifications de son identité et de son contact (les NOMS des
 * champs, jamais leurs valeurs), la création d'une tâche et son passage à « faite ». Même lecture
 * que `GET …/activity` : tout lecteur de la fiche, aucun geste de l'agence pour qui n'en est pas.
 */
class CustomerTimelineFicheEtTachesTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $agence;

    private User $admin;

    private User $bailleurAuteur;

    private Customer $fiche;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $this->agence = $this->agence();
        $this->admin = $this->personnel($this->agence, 'agency_admin');
        $this->bailleurAuteur = $this->bailleur($this->agence);
        $this->fiche = $this->ficheClient($this->agence, null, [
            'added_by_id' => $this->bailleurAuteur->id,
            'pipeline_stage' => CustomerPipelineStage::Lead,
            'phone' => '+221770000001',
        ]);
        Activity::query()->delete();
    }

    /** @return list<array<string, mixed>> */
    private function fil(string $query = '?per_page=50'): array
    {
        return $this->getJson("/api/customers/{$this->fiche->id}/timeline{$query}")->assertOk()->json('data');
    }

    /** @param  list<array<string, mixed>>  $fil */
    private function suite(array $fil): array
    {
        return array_map(fn (array $e) => $e['type'].':'.($e['milestone'] ?? ''), $fil);
    }

    /** Le scénario du vérificateur : fiche modifiée (prénom, nom, téléphone), tâche créée puis faite. */
    public function test_la_modification_de_la_fiche_et_la_tache_creee_puis_faite_entrent_au_fil(): void
    {
        Sanctum::actingAs($this->admin);
        Carbon::setTestNow('2026-11-10 09:00:00');
        $this->putJson("/api/customers/{$this->fiche->id}", ['first_name' => 'Awa', 'last_name' => 'Ndiaye', 'phone' => '+221770000099'])->assertOk();
        Carbon::setTestNow('2026-11-10 10:00:00');
        $tache = $this->postJson('/api/tasks', [
            'title' => 'Rappeler pour le F3',
            'description' => 'Description interne de la tâche',
            'taskable_id' => $this->fiche->id,
            'taskable_type' => Customer::class,
        ])->assertCreated()->json('data.id');
        Carbon::setTestNow('2026-11-10 11:00:00');
        $this->patchJson("/api/tasks/{$tache}", ['status' => 'done'])->assertOk();
        Carbon::setTestNow();

        $fil = $this->fil();

        $this->assertSame(['task:done', 'task:created', 'record:updated'], $this->suite($fil));
        [$faite, $creee, $modifiee] = $fil;
        $this->assertSame(['id' => $tache, 'title' => 'Rappeler pour le F3'], $faite['task']);
        $this->assertSame($creee['task'], $faite['task']);
        $this->assertSame($this->admin->id, $faite['causer']['id']);
        $this->assertSame(['first_name', 'last_name', 'phone'], $modifiee['fields']);
        $this->assertSame($this->admin->id, $modifiee['causer']['id']);
        // Les noms des champs, jamais leurs valeurs ; jamais la description d'une tâche.
        $json = json_encode($fil);
        $this->assertStringNotContainsString('770000099', $json);
        $this->assertStringNotContainsString('Ndiaye', $json);
        $this->assertStringNotContainsString('interne', $json);
    }

    public function test_la_creation_de_la_fiche_entre_au_fil(): void
    {
        $neuve = $this->ficheClient($this->agence, null, ['added_by_id' => $this->admin->id]);

        Sanctum::actingAs($this->admin);
        $fil = $this->getJson("/api/customers/{$neuve->id}/timeline")->assertOk()->json('data');

        $this->assertSame(['record:created'], $this->suite($fil));
        $this->assertSame([], $fil[0]['fields']);
    }

    /** L'étape a son type ; les liens et la pièce d'identité n'entrent pas ; un champ effacé, si. */
    public function test_seuls_les_champs_d_identite_et_de_contact_font_une_modification(): void
    {
        Carbon::setTestNow('2026-11-10 09:00:00');
        $this->fiche->update(['pipeline_stage' => CustomerPipelineStage::Qualified]);
        Carbon::setTestNow('2026-11-10 10:00:00');
        $this->fiche->update(['user_id' => User::factory()->create()->id, 'id_type' => 'passport']);
        Carbon::setTestNow('2026-11-10 11:00:00');
        $this->fiche->update(['email' => null]);
        Carbon::setTestNow('2026-11-10 12:00:00');
        $this->fiche->update(['status' => 'inactive', 'pipeline_stage' => CustomerPipelineStage::Lead]);
        Carbon::setTestNow();
        $this->assertGreaterThanOrEqual(4, Activity::query()->where('subject_type', Customer::class)->count());

        Sanctum::actingAs($this->admin);
        $fil = $this->fil();

        // La dernière mise à jour porte l'étape ET le statut : une entrée de chaque type.
        $this->assertSame(['stage:', 'record:updated', 'record:updated', 'stage:'], $this->suite($fil));
        $this->assertSame(['status'], $fil[1]['fields']);
        $this->assertSame(['email'], $fil[2]['fields']);
    }

    /** Même lecture que `GET …/activity` : le bailleur auteur lit la vie de sa fiche, pas les gestes de l'agence. */
    public function test_le_bailleur_auteur_lit_la_fiche_et_les_taches_comme_au_journal(): void
    {
        Sanctum::actingAs($this->admin);
        $this->putJson("/api/customers/{$this->fiche->id}", ['occupation' => 'Enseignante'])->assertOk();
        Task::factory()->create(['taskable_type' => Customer::class, 'taskable_id' => $this->fiche->id, 'title' => 'Envoyer les biens']);
        app(ContactGestureService::class)->onCustomer($this->fiche, $this->admin, ContactGestureChannel::Call);
        $this->app['auth']->forgetGuards();

        Sanctum::actingAs($this->bailleurAuteur);
        $journal = $this->getJson("/api/customers/{$this->fiche->id}/activity?per_page=50")->assertOk()->json('data');
        $fil = $this->fil();

        $this->assertEqualsCanonicalizing(['record:updated', 'task:created'], $this->suite($fil));
        $this->assertEqualsCanonicalizing(
            array_map(fn (array $e) => $e['id'], $journal),
            array_map(fn (array $e) => $e['id'], $fil),
            'le fil et le journal rendent les mêmes entrées de la fiche et de ses tâches',
        );
    }

    public function test_le_filtre_par_type_accepte_record_et_task(): void
    {
        Sanctum::actingAs($this->admin);
        $this->putJson("/api/customers/{$this->fiche->id}", ['first_name' => 'Awa'])->assertOk();
        Task::factory()->create(['taskable_type' => Customer::class, 'taskable_id' => $this->fiche->id]);

        $this->assertSame(['record:updated'], $this->suite($this->fil('?filter[type]=record')));
        $this->assertSame(['task:created'], $this->suite($this->fil('?filter[type]=task')));
    }

    /** D'une tâche, seuls sa création et son passage à « faite » : ni un renommage, ni « en cours », ni l'annulation. */
    public function test_seuls_la_creation_et_le_passage_a_faite_d_une_tache_entrent(): void
    {
        $tache = Task::factory()->create(['taskable_type' => Customer::class, 'taskable_id' => $this->fiche->id, 'title' => 'Avant']);
        $tache->update(['title' => 'Après']);
        $tache->update(['status' => 'in_progress']);
        $tache->update(['status' => 'cancelled']);
        $this->assertSame(4, Activity::query()->where('subject_type', Task::class)->count());

        Sanctum::actingAs($this->admin);
        $fil = $this->fil();

        $this->assertSame(['task:created'], $this->suite($fil));
        // Le titre courant, pas celui du jour de la création.
        $this->assertSame('Après', $fil[0]['task']['title']);
    }

    /** Une tâche d'une AUTRE fiche n'entre pas au fil de celle-ci. */
    public function test_la_tache_d_une_autre_fiche_n_entre_pas(): void
    {
        $autre = $this->ficheClient($this->agence);
        Task::factory()->create(['taskable_type' => Customer::class, 'taskable_id' => $autre->id]);

        Sanctum::actingAs($this->admin);
        $this->assertSame([], $this->fil());
    }

    public function test_le_nombre_de_requetes_ne_depend_pas_du_nombre_d_entrees(): void
    {
        Sanctum::actingAs($this->admin);
        $compter = function (): int {
            DB::flushQueryLog();
            DB::enableQueryLog();
            $this->fil();
            $n = count(DB::getQueryLog());
            DB::disableQueryLog();

            return $n;
        };
        $remplir = function (int $n): void {
            for ($i = 0; $i < $n; $i++) {
                $this->fiche->update(['occupation' => "Métier {$i} ".uniqid()]);
                $tache = Task::factory()->create(['taskable_type' => Customer::class, 'taskable_id' => $this->fiche->id, 'created_by_id' => $this->personnel($this->agence)->id]);
                $tache->update(['status' => 'done']);
            }
        };

        $remplir(1);
        $compter();
        $petite = $compter();
        $remplir(6);
        $grande = $compter();

        $this->assertCount(21, $this->fil());
        $this->assertSame($petite, $grande, "{$petite} requêtes pour 3 entrées, {$grande} pour 21");
    }
}
