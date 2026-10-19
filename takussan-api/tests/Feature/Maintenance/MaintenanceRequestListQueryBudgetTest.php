<?php

namespace Tests\Feature\Maintenance;

use App\Models\Agency;
use App\Models\MaintenanceRequest;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\ApiTestCase;

/**
 * TCK-900 (P20.02) — la liste des demandes d'intervention ne relit pas les profils de l'appelant à
 * chaque ligne.
 *
 * `MaintenanceRequestResource` appelait deux fois par ligne `MaintenanceRequestPolicy::isPrincipalFor()`
 * (`seesQuote()` et `isPrincipal()`), qui résout chaque fois `User::staffAgencyId()` : mesuré le
 * 2026-10-15, six requêtes de profil par ligne, 36 requêtes pour 2 lignes et 96 pour 12.
 */
class MaintenanceRequestListQueryBudgetTest extends ApiTestCase
{
    use RefreshDatabase;

    private const URL = '/api/maintenance-requests?include=property&fields[properties]=id,title&per_page=20';

    public function test_les_requetes_de_profil_ne_croissent_pas_avec_le_nombre_de_lignes(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $property = Property::factory()->create(['user_id' => User::factory()->create()->id, 'agency_id' => $agency->id]);

        MaintenanceRequest::factory()->count(2)->create(['property_id' => $property->id]);
        [$deuxLignes, $profilsDeux] = $this->compterRequetes(2);

        MaintenanceRequest::factory()->count(10)->create(['property_id' => $property->id]);
        [$douzeLignes, $profilsDouze] = $this->compterRequetes(12);

        $this->assertSame($profilsDeux, $profilsDouze, "requêtes de profil : {$profilsDeux} pour 2 lignes, {$profilsDouze} pour 12");
        $this->assertSame($deuxLignes, $douzeLignes, "requêtes : {$deuxLignes} pour 2 lignes, {$douzeLignes} pour 12");
    }

    /** @return array{int, int} le total des requêtes, et celles qui lisent une table de profils */
    private function compterRequetes(int $lignesAttendues): array
    {
        DB::flushQueryLog();
        DB::enableQueryLog();
        $this->apiGet(self::URL)->assertOk()->assertJsonCount($lignesAttendues, 'data');
        $requetes = array_column(DB::getQueryLog(), 'query');
        DB::disableQueryLog();

        $profils = array_filter($requetes, fn (string $sql): bool => (bool) preg_match('/"(agent|agency_admin|platform)_profiles"/', $sql));

        return [count($requetes), count($profils)];
    }
}
