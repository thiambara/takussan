<?php

namespace Tests\Feature\Api\Admin;

use App\Models\ScheduledTaskRun;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

class HealthcheckJobsTest extends TestCase
{
    use RefreshDatabase;

    public function test_healthcheck_isolates_failed_sms_driver(): void
    {
        config(['sms.default_driver' => 'broken']);
        $this->actingAsRole('super_admin');

        $this->getJson('/api/admin/health')
            ->assertOk()
            ->assertJsonPath('data.db.status', 'ok')
            ->assertJsonPath('data.sms.status', 'failed');
    }

    public function test_agency_admin_is_forbidden(): void
    {
        $this->actingAsRole('agency_admin');

        $this->getJson('/api/admin/health')->assertForbidden();
        $this->getJson('/api/admin/jobs/failed')->assertForbidden();
        $this->getJson('/api/admin/scheduler')->assertForbidden();
    }

    public function test_failed_jobs_list_truncates_payload(): void
    {
        $this->actingAsRole('super_admin');
        DB::table('failed_jobs')->insert([
            'uuid' => (string) Str::uuid(),
            'connection' => 'database',
            'queue' => 'default',
            'payload' => str_repeat('x', 1500),
            'exception' => 'boom',
            'failed_at' => now(),
        ]);

        $this->getJson('/api/admin/jobs/failed')
            ->assertOk()
            ->assertJsonPath('data.0.queue', 'default');

        $this->assertLessThanOrEqual(1025, strlen($this->getJson('/api/admin/jobs/failed')->json('data.0.payload')));
    }

    public function test_retry_all_is_bounded_to_500_jobs(): void
    {
        $this->actingAsRole('super_admin');
        for ($i = 0; $i < 501; $i++) {
            DB::table('failed_jobs')->insert([
                'uuid' => (string) Str::uuid(),
                'connection' => 'database',
                'queue' => 'default',
                'payload' => '{}',
                'exception' => 'boom',
                'failed_at' => now(),
            ]);
        }

        $this->postJson('/api/admin/jobs/failed/retry-all')->assertStatus(409);
    }

    public function test_delete_failed_job_is_audited(): void
    {
        $this->actingAsRole('super_admin');
        $id = DB::table('failed_jobs')->insertGetId([
            'uuid' => (string) Str::uuid(),
            'connection' => 'database',
            'queue' => 'default',
            'payload' => '{}',
            'exception' => 'boom',
            'failed_at' => now(),
        ]);

        $this->deleteJson("/api/admin/jobs/failed/{$id}")->assertOk();

        $this->assertTrue(Activity::query()->where('event', 'super_admin_job_deleted')->exists());
    }

    /**
     * D4 — AC4 : « au-delà de 20 jobs échoués, les suivants sont atteignables ».
     *
     * `failed_jobs.failed_at` est un `timestamp(0)` : une rafale d'échecs — le cas courant — pose
     * des dizaines de lignes à la MÊME valeur. Sans départ-égalité, PostgreSQL ne garantit aucun
     * ordre stable entre deux requêtes LIMIT/OFFSET, et la pagination PERD des lignes : mesuré
     * avant correctif, 200 jobs lus sur 10 pages rendaient 197 identifiants distincts.
     *
     * ⚠ Le test d'AC4 côté front mocke `fetchFailedJobs` entièrement — il vérifie que la page 2
     * est demandée, jamais qu'un job y soit atteignable. Il resterait vert. Celui-ci lit la base.
     */
    public function test_pagination_reaches_every_job_when_all_failed_in_the_same_second(): void
    {
        $this->actingAsRole('super_admin');

        $instant = now()->startOfSecond();
        $rows = [];
        for ($i = 0; $i < 200; $i++) {
            $rows[] = [
                'uuid' => (string) Str::uuid(),
                'connection' => 'database',
                'queue' => 'default',
                'payload' => '{}',
                'exception' => 'boom',
                // La MÊME seconde pour les 200 : c'est la condition qui rend l'ordre ambigu.
                'failed_at' => $instant,
            ];
        }
        DB::table('failed_jobs')->insert($rows);

        $vus = [];
        for ($page = 1; $page <= 10; $page++) {
            $response = $this->getJson("/api/admin/jobs/failed?page={$page}&per_page=20")->assertOk();
            foreach ($response->json('data') as $job) {
                $vus[] = $job['id'];
            }
        }

        $this->assertCount(200, $vus, 'Les 10 pages doivent rendre 200 lignes.');
        // Le cœur de l'assertion : autant d'identifiants DISTINCTS que de lignes lues. Un doublon
        // ici signifie qu'une autre ligne n'est atteignable par AUCUNE page.
        $this->assertCount(200, array_unique($vus), 'Chaque job doit être vu une fois et une seule.');
    }

    /**
     * D5 — une trace accentuée faisait rendre 500 à TOUTE la liste.
     *
     * `substr($payload, 0, 1021)` coupait en OCTETS : quand l'octet 1021 tombait au milieu d'une
     * séquence UTF-8, `JsonResponse` levait `Malformed UTF-8 characters` — et c'est la réponse
     * ENTIÈRE qui mourait, pas la seule ligne fautive. La colonne `exception` porte des traces de
     * pile brutes (non échappées en `\uXXXX` contrairement au payload JSON) : dans un dépôt
     * francophone, le cas est le cas normal.
     */
    public function test_multibyte_trace_longer_than_the_cut_does_not_break_the_list(): void
    {
        $this->actingAsRole('super_admin');
        DB::table('failed_jobs')->insert([
            'uuid' => (string) Str::uuid(),
            'connection' => 'database',
            'queue' => 'default',
            // 1500 caractères, 3000 octets : la coupe à 1021 OCTETS tombe au milieu d'un « é ».
            'payload' => str_repeat('é', 1500),
            'exception' => str_repeat('à', 1500),
            'failed_at' => now(),
        ]);

        $response = $this->getJson('/api/admin/jobs/failed')->assertOk();

        foreach (['payload', 'exception'] as $champ) {
            $valeur = $response->json("data.0.{$champ}");
            $this->assertTrue(mb_check_encoding($valeur, 'UTF-8'), "`{$champ}` doit rester de l'UTF-8 valide.");
            // La coupe est en CARACTÈRES : 1021 + les trois points de suspension.
            $this->assertSame(1024, mb_strlen($valeur));
            $this->assertStringEndsWith('...', $valeur);
        }
    }

    /**
     * D9 — supprimer un job DÉJÀ supprimé rendait 200 et écrivait une entrée d'audit.
     *
     * Deux exploitants sur la même page : la cible du dialogue est un instantané pris au clic, elle
     * ne se rafraîchit pas. Le second confirme la suppression de #7 déjà parti, l'écran dit
     * « fait », et le journal d'audit enregistre une suppression qui n'a pas eu lieu. `retry()` et
     * `find()` rendaient déjà 404 dans ce cas.
     */
    public function test_deleting_an_already_deleted_job_is_a_404_and_writes_no_audit_entry(): void
    {
        $this->actingAsRole('super_admin');
        $id = DB::table('failed_jobs')->insertGetId([
            'uuid' => (string) Str::uuid(),
            'connection' => 'database',
            'queue' => 'default',
            'payload' => '{}',
            'exception' => 'boom',
            'failed_at' => now(),
        ]);

        $this->deleteJson("/api/admin/jobs/failed/{$id}")->assertOk();
        $this->deleteJson("/api/admin/jobs/failed/{$id}")->assertNotFound();

        // Une seule suppression a eu lieu : le journal ne doit pas en compter deux.
        $this->assertSame(
            1,
            Activity::query()->where('event', 'super_admin_job_deleted')->count(),
        );
    }

    /**
     * D10 — `per_page` n'était ni validé ni borné : `?per_page=100000` rendait tout, `?per_page=0`
     * rendait 200. Le front n'envoie que 20, mais l'endpoint est désormais atteignable depuis le
     * menu — une borne qui dépend de l'appelant n'est pas une borne.
     */
    public function test_per_page_is_bounded(): void
    {
        $this->actingAsRole('super_admin');

        $this->getJson('/api/admin/jobs/failed?per_page=100000')->assertStatus(422);
        $this->getJson('/api/admin/jobs/failed?per_page=0')->assertStatus(422);
        $this->getJson('/api/admin/jobs/failed?per_page=abc')->assertStatus(422);
        $this->getJson('/api/admin/jobs/failed?per_page=100')->assertOk();
        $this->getJson('/api/admin/jobs/failed')->assertOk();
    }

    public function test_scheduler_returns_last_run(): void
    {
        $this->actingAsRole('super_admin');
        ScheduledTaskRun::query()->create([
            'task' => 'daily-cleanup',
            'last_run_at' => now(),
            'duration_ms' => 123,
            'status' => 'finished',
        ]);

        $this->getJson('/api/admin/scheduler')
            ->assertOk()
            ->assertJsonPath('data.0.task', 'daily-cleanup');
    }
}
