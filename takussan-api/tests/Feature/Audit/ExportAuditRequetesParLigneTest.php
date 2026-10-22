<?php

namespace Tests\Feature\Audit;

use App\Models\Activity;
use App\Models\Agency;
use App\Models\User;
use App\Services\Audit\ActivityLogExporter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * TCK-1414 (P78.01) — `buildPayload()` ne relit plus les profils de l'auteur à chaque ligne.
 *
 * `causer_role` vient de `profileTypes()`, qui interroge `serviceProviderProfile` et les baux du
 * locataire quand la relation n'est pas préchargée : deux requêtes par ligne, mesurées 209 pour 100
 * lignes d'un même auteur. Le nombre de requêtes ne dépend plus du nombre de lignes.
 */
class ExportAuditRequetesParLigneTest extends TestCase
{
    use RefreshDatabase;

    private function journal(User $auteur, Agency $agency, int $lignes): void
    {
        for ($i = 0; $i < $lignes; $i++) {
            Activity::create([
                'log_name' => 'default',
                'description' => 'updated',
                'event' => 'updated',
                'subject_type' => Agency::class,
                'subject_id' => $agency->id,
                'causer_type' => User::class,
                'causer_id' => $auteur->id,
            ]);
        }
    }

    /** @return array{0: int, 1: list<array<string,mixed>>} */
    private function requetesDe(User $admin, Agency $agency): array
    {
        DB::flushQueryLog();
        DB::enableQueryLog();
        $payload = app(ActivityLogExporter::class)->buildPayload($admin, ['causer_id' => $admin->id], $agency->id);
        $requetes = count(DB::getQueryLog());
        DB::disableQueryLog();

        return [$requetes, $payload['rows']];
    }

    public function test_le_nombre_de_requetes_ne_depend_pas_du_nombre_de_lignes(): void
    {
        $agency = Agency::factory()->create();
        $admin = $this->actingAsRole('agency_admin', ['agency' => $agency]);

        $this->journal($admin, $agency, 10);
        [$pour10, $lignes10] = $this->requetesDe($admin, $agency);

        $this->journal($admin, $agency, 90);
        [$pour100, $lignes100] = $this->requetesDe($admin, $agency);

        $this->assertCount(10, $lignes10);
        $this->assertCount(100, $lignes100);
        $this->assertSame($pour10, $pour100, "10 lignes : {$pour10} requêtes ; 100 lignes : {$pour100}.");
    }

    public function test_le_role_de_l_auteur_reste_celui_de_profile_types(): void
    {
        $agency = Agency::factory()->create();
        $admin = $this->actingAsRole('agency_admin', ['agency' => $agency]);
        $this->journal($admin, $agency, 2);

        [, $lignes] = $this->requetesDe($admin, $agency);

        foreach ($lignes as $ligne) {
            $this->assertSame($admin->profileTypes()->first(), $ligne['causer_role']);
        }
        $this->assertSame('agency_admin', $lignes[0]['causer_role']);
    }

    /**
     * TCK-1416 (P78.02) — l'export de la console (`payloadForQuery`) précharge de même : avec le
     * seul `causer`, six requêtes par ligne (602 pour 100 lignes).
     */
    public function test_l_export_de_la_console_ne_fait_pas_de_requete_par_ligne(): void
    {
        $agency = Agency::factory()->create();
        $admin = $this->actingAsRole('agency_admin', ['agency' => $agency]);
        $exporter = app(ActivityLogExporter::class);
        $compter = function () use ($exporter, $admin): int {
            DB::flushQueryLog();
            DB::enableQueryLog();
            $exporter->payloadForQuery(Activity::query()->where('causer_id', $admin->id), 'audit');
            $n = count(DB::getQueryLog());
            DB::disableQueryLog();

            return $n;
        };

        $this->journal($admin, $agency, 10);
        $pour10 = $compter();
        $this->journal($admin, $agency, 90);
        $pour100 = $compter();

        $this->assertSame($pour10, $pour100, "10 lignes : {$pour10} requêtes ; 100 lignes : {$pour100}.");
    }
}
