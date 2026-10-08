<?php

namespace Tests\Feature\Audit;

use App\Jobs\Audit\ExportActivityLogJob;
use App\Models\Activity;
use App\Models\Agency;
use App\Models\Payout;
use App\Models\PlatformPayout;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use App\Services\Audit\ActivityLogExporter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Tests\ApiTestCase;

/**
 * TCK-601 (AD9, ADR-0044 §3) — le journal d'une agence est celui de ses SUJETS, quel qu'en soit
 * l'acteur, et rien d'une autre agence : ni par la liste, ni par l'historique d'un objet, ni par
 * l'export synchrone ou asynchrone. Les identifiants personnels n'y paraissent jamais.
 */
class AgencyAuditScopeTest extends ApiTestCase
{
    use RefreshDatabase;

    private function logOn(object $subject, ?User $causer, string $description, array $properties = []): Activity
    {
        $logger = activity()->performedOn($subject)->event('updated')->withProperties($properties);
        if ($causer !== null) {
            $logger->causedBy($causer);
        }

        /** @var Activity */
        return $logger->log($description);
    }

    private function adminOnly(Agency $agency): User
    {
        // Sans le pont `agency_id` de la fabrique : un seul `AgencyAdminProfile`, rien d'autre.
        $user = User::factory()->create();
        AgencyAdminProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agency->id]);

        return $user;
    }

    /** @return list<string> */
    private function descriptions(string $uri, array $headers = []): array
    {
        return collect($this->apiGet($uri, $headers)->assertOk()->json('data'))->pluck('description')->all();
    }

    private function exportCsv(array $headers = []): string
    {
        return $this->apiGet('/api/activity-logs/export?format=csv', $headers)->assertOk()->streamedContent();
    }

    /** AC10 — l'acte d'un admin qui n'a QU'un profil d'admin est visible de l'autre admin. */
    public function test_l_acte_d_un_autre_admin_est_visible(): void
    {
        $agency = Agency::factory()->create();
        $property = Property::factory()->create(['agency_id' => $agency->id]);
        $this->logOn($property, $this->adminOnly($agency), 'temoin-admin-2');

        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        $this->assertContains('temoin-admin-2', $this->descriptions('/api/activity-log'));
        $this->assertStringContainsString('temoin-admin-2', $this->exportCsv());
    }

    /** AC11 — un acte système (acteur nul) sur un sujet de l'agence est visible. */
    public function test_un_acte_systeme_sur_un_sujet_de_l_agence_est_visible(): void
    {
        $agency = Agency::factory()->create();
        $this->logOn(Property::factory()->create(['agency_id' => $agency->id]), null, 'temoin-systeme');

        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        $this->assertContains('temoin-systeme', $this->descriptions('/api/audit-log'));
    }

    /** AC12 — un bailleur de A et de B agit chez B : A ne le voit ni en liste ni en export ; B oui. */
    public function test_l_acte_d_un_bailleur_commun_chez_b_n_apparait_pas_chez_a(): void
    {
        [$a, $b] = [Agency::factory()->create(), Agency::factory()->create()];
        $landlord = User::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $landlord->id, 'agency_id' => $a->id]);
        OwnerProfile::factory()->create(['user_id' => $landlord->id, 'agency_id' => $b->id]);
        $this->logOn(Property::factory()->create(['agency_id' => $b->id]), $landlord, 'temoin-chez-b');

        $this->apiActingAsRole('agency_admin', ['agency' => $a]);
        $this->assertNotContains('temoin-chez-b', $this->descriptions('/api/activity-log'));
        $this->assertStringNotContainsString('temoin-chez-b', $this->exportCsv());

        $this->apiActingAsRole('agency_admin', ['agency' => $b]);
        $this->assertContains('temoin-chez-b', $this->descriptions('/api/activity-log'));
        $this->assertStringContainsString('temoin-chez-b', $this->exportCsv());
    }

    /** AC12b (1/2) — l'export asynchrone est réparti avec l'agence du profil ACTIF. */
    public function test_l_export_asynchrone_recoit_l_agence_active(): void
    {
        Queue::fake();
        [$a, $b] = [Agency::factory()->create(), Agency::factory()->create()];
        $admin = User::factory()->create();
        $profileA = AgencyAdminProfile::factory()->create(['user_id' => $admin->id, 'agency_id' => $a->id]);
        AgencyAdminProfile::factory()->create(['user_id' => $admin->id, 'agency_id' => $b->id]);

        $now = now()->toDateTimeString();
        $rows = [];
        for ($i = 0; $i < 5001; $i++) {
            $rows[] = ['log_name' => 'default', 'description' => 'remplissage', 'event' => 'updated', 'agency_id' => $a->id, 'created_at' => $now, 'updated_at' => $now];
        }
        foreach (array_chunk($rows, 1000) as $chunk) {
            DB::table('activity_log')->insert($chunk);
        }

        $this->actingAs($admin, 'sanctum');
        $this->apiGet('/api/activity-logs/export?format=csv', ['X-Profile-Id' => "agency_admin:{$profileA->id}"])
            ->assertStatus(202);

        Queue::assertPushed(ExportActivityLogJob::class, fn (ExportActivityLogJob $job): bool => $job->agencyId === $a->id);
    }

    /** AC12b (2/2) — exécuté hors requête, le job rend les entrées de A et aucune de B. */
    public function test_le_fichier_du_job_porte_l_agence_active_et_elle_seule(): void
    {
        Storage::fake();
        Notification::fake();
        [$a, $b] = [Agency::factory()->create(), Agency::factory()->create()];
        $admin = User::factory()->create();
        AgencyAdminProfile::factory()->create(['user_id' => $admin->id, 'agency_id' => $a->id]);
        AgencyAdminProfile::factory()->create(['user_id' => $admin->id, 'agency_id' => $b->id]);
        $this->logOn(Property::factory()->create(['agency_id' => $a->id]), $admin, 'temoin-job-a');
        $this->logOn(Property::factory()->create(['agency_id' => $b->id]), $admin, 'temoin-job-b');

        // Un worker n'a pas de requête : rien n'y porte le profil actif.
        $this->app->instance('request', Request::create('/'));
        (new ExportActivityLogJob($admin, ['format' => 'csv'], $a->id))->handle(app(ActivityLogExporter::class));

        $files = Storage::allFiles('exports/audit');
        $this->assertCount(1, $files);
        $content = Storage::get($files[0]);
        $this->assertStringContainsString('temoin-job-a', $content);
        $this->assertStringNotContainsString('temoin-job-b', $content);
    }

    /** AC13 — l'historique d'un objet : borné à l'agence, et au type EXACT (pas de `LIKE`). */
    public function test_l_historique_d_un_objet_est_borne_a_l_agence_et_au_type_exact(): void
    {
        [$a, $b] = [Agency::factory()->create(), Agency::factory()->create()];
        $payout = Payout::factory()->create(['agency_id' => $b->id]);
        $platformPayout = PlatformPayout::factory()->create(['id' => $payout->id, 'agency_id' => $b->id]);
        $this->logOn($payout, null, 'temoin-reversement');
        $this->logOn($platformPayout, null, 'temoin-reversement-plateforme');

        $this->apiActingAsRole('agency_admin', ['agency' => $a]);
        foreach (['activity-log', 'audit-log'] as $prefix) {
            $this->assertSame([], $this->descriptions("/api/{$prefix}/payout/{$payout->id}"), "{$prefix} : A lit B");
        }

        $this->apiActingAsRole('agency_admin', ['agency' => $b]);
        foreach (['activity-log', 'audit-log'] as $prefix) {
            $rows = collect($this->apiGet("/api/{$prefix}/payout/{$payout->id}")->assertOk()->json('data'));
            $this->assertContains('temoin-reversement', $rows->pluck('description'));
            $this->assertNotContains('temoin-reversement-plateforme', $rows->pluck('description'));
            $this->assertSame([$payout->getMorphClass()], $rows->pluck('subject_type')->unique()->values()->all());
        }

        // Un type qui n'est pas un modèle n'est pas un motif : 404.
        $this->apiGet("/api/audit-log/out/{$payout->id}")->assertNotFound();
    }

    /** AC13b — les identifiants personnels de `properties` sont expurgés partout, les clés restent. */
    public function test_les_identifiants_personnels_sont_expurges_partout(): void
    {
        $agency = Agency::factory()->create();
        $this->logOn(Property::factory()->create(['agency_id' => $agency->id]), null, 'temoin-expurge', [
            'attributes' => [
                'rib' => 'RIBTEMOIN', 'iban' => 'IBANTEMOIN', 'tax_id' => 'TAXTEMOIN',
                'ninea' => 'NINEATEMOIN', 'rib_pro' => 'RIBPROTEMOIN', 'title' => 'Villa conservée',
                'distribution' => 'conservee',
            ],
        ]);
        $temoins = ['RIBTEMOIN', 'IBANTEMOIN', 'TAXTEMOIN', 'NINEATEMOIN', 'RIBPROTEMOIN'];

        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $list = $this->apiGet('/api/activity-log')->assertOk();
        $byEntity = $this->apiGet('/api/activity-log/property/'.Activity::query()->value('subject_id'))->assertOk();
        $agencyExport = $this->exportCsv();

        $this->apiActingAsRole('super_admin');
        $platform = $this->apiGet('/api/admin/audit')->assertOk();
        $platformExport = $this->exportCsv();

        foreach ([$list->getContent(), $byEntity->getContent(), $agencyExport, $platform->getContent(), $platformExport] as $i => $body) {
            foreach ($temoins as $temoin) {
                $this->assertStringNotContainsString($temoin, $body, "surface {$i} : {$temoin}");
            }
        }

        $attributes = collect($list->json('data'))->firstWhere('description', 'temoin-expurge')['properties']['attributes'];
        $this->assertSame('[REDACTED]', $attributes['rib']);
        $this->assertSame('[REDACTED]', $attributes['ninea']);
        $this->assertSame('Villa conservée', $attributes['title']);
        $this->assertSame('conservee', $attributes['distribution']);
        $this->assertSame('[REDACTED]', collect($platform->json('data'))->firstWhere('description', 'temoin-expurge')['properties']['attributes']['iban']);
    }

    /** Second chemin — un admin suspendu ne lit plus le journal ni ne l'exporte. */
    public function test_un_admin_suspendu_perd_le_journal(): void
    {
        $agency = Agency::factory()->create();
        $this->logOn(Property::factory()->create(['agency_id' => $agency->id]), null, 'temoin-suspendu');
        $user = User::factory()->create();
        AgencyAdminProfile::factory()->suspended()->create(['user_id' => $user->id, 'agency_id' => $agency->id]);

        $this->actingAs($user, 'sanctum');

        $this->apiGet('/api/activity-log')->assertForbidden();
        $this->apiGet('/api/activity-logs/export?format=csv')->assertForbidden();
    }

    /** ADR-0044 §3 — à la création, un enfant prend l'agence de son parent ; un `User`, aucune. */
    public function test_la_creation_rattache_l_agence_du_sujet(): void
    {
        $agency = Agency::factory()->create();
        $property = Property::factory()->create(['agency_id' => $agency->id]);

        $this->assertSame($agency->id, $this->logOn($property, null, 'p')->fresh()->agency_id);
        $this->assertSame($agency->id, $this->logOn($agency, null, 'a')->fresh()->agency_id);
        $this->assertNull($this->logOn(User::factory()->create(), null, 'u')->fresh()->agency_id);
        $this->assertSame($agency->id, activity()->withProperties(['agency_id' => $agency->id])->log('explicite')->fresh()->agency_id);
    }
}
