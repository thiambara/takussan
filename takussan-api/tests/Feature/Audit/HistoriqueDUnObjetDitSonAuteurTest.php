<?php

namespace Tests\Feature\Audit;

use App\Models\Activity;
use App\Models\Agency;
use App\Models\Lease;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\ApiTestCase;

/**
 * TCK-2763 — l'historique d'un objet (`GET /api/audit-log/{entity}/{id}`, l'onglet « Historique »
 * de la fiche d'un bail) dit QUI : `causer: {id, name}` comme la piste d'audit de l'agence, sans
 * l'adresse, et `causer: null` pour un acte système. La relation était déjà chargée : aucune
 * requête de plus.
 */
class HistoriqueDUnObjetDitSonAuteurTest extends ApiTestCase
{
    use RefreshDatabase;

    private function logOn(Lease $lease, ?User $causer, string $description): Activity
    {
        $logger = activity()->performedOn($lease)->event('lease_rent_reviewed');
        if ($causer !== null) {
            $logger->causedBy($causer);
        }

        /** @var Activity */
        return $logger->log($description);
    }

    /** @return array{0: Agency, 1: Lease} */
    private function bailDeLAgence(): array
    {
        $agency = Agency::factory()->create();
        $lease = Lease::factory()->create(['agency_id' => $agency->id]);
        Activity::query()->where('subject_type', $lease->getMorphClass())->where('subject_id', $lease->id)->delete();

        return [$agency, $lease];
    }

    public function test_l_evenement_d_un_utilisateur_porte_son_nom_et_l_acte_systeme_un_auteur_nul(): void
    {
        [$agency, $lease] = $this->bailDeLAgence();
        $auteur = User::factory()->create(['first_name' => 'Awa', 'last_name' => 'Diop', 'email' => 'awa.diop@example.test']);
        $this->logOn($lease, $auteur, 'par-awa');
        $this->logOn($lease, null, 'systeme');

        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $rows = collect($this->apiGet("/api/audit-log/lease/{$lease->id}")->assertOk()->json('data'))->keyBy('description');

        $this->assertSame(['id' => $auteur->id, 'name' => 'Awa Diop'], $rows['par-awa']['causer']);
        $this->assertArrayHasKey('causer', $rows['systeme']);
        $this->assertNull($rows['systeme']['causer']);
        // L'onglet n'a pas besoin de l'adresse : elle ne sort pas.
        $this->assertStringNotContainsString('awa.diop@example.test', $this->apiGet("/api/audit-log/lease/{$lease->id}")->getContent());
    }

    public function test_un_auteur_supprime_donne_un_auteur_nul(): void
    {
        [$agency, $lease] = $this->bailDeLAgence();
        $auteur = User::factory()->create();
        $this->logOn($lease, $auteur, 'par-un-supprime');
        $auteur->delete();

        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $row = collect($this->apiGet("/api/audit-log/lease/{$lease->id}")->assertOk()->json('data'))
            ->firstWhere('description', 'par-un-supprime');

        $this->assertNull($row['causer']);
    }

    public function test_le_nombre_de_requetes_ne_depend_pas_du_nombre_d_auteurs(): void
    {
        [$agency, $lease] = $this->bailDeLAgence();
        $this->logOn($lease, User::factory()->create(), 'un');
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        $compter = function () use ($lease): int {
            DB::flushQueryLog();
            DB::enableQueryLog();
            $this->apiGet("/api/audit-log/lease/{$lease->id}")->assertOk();
            $n = count(DB::getQueryLog());
            DB::disableQueryLog();

            return $n;
        };

        $compter(); // la première lecture amorce ce que la requête met en cache (profil actif, agence)
        $avecUn = $compter();
        foreach (range(1, 4) as $i) {
            $this->logOn($lease, User::factory()->create(), "autre-{$i}");
        }

        $this->assertSame($avecUn, $compter());
    }
}
