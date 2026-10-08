<?php

namespace Tests\Feature\Property;

use App\Models\Agency;
use App\Models\User;
use App\Services\Property\PrimaryAgentDesignator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-603 (ADR-0059 §6, verif-603 m4) — demander `agency_id` sur la liste pro y fait rendre
 * `primary_contact`, `primary_contact_source` et le bloc `agency` : sans préchargement, chaque bien
 * coûtait six requêtes de plus (agence, logo, moyenne des avis, `isAgentAt` du titulaire et du contact,
 * `isStaffAt` du contact) — 157 requêtes contre 37 sur 20 biens, relevé de verif-603.
 *
 * Le budget se juge en DIFFÉRENCE, à page égale : ce que coûte `agency_id` en plus, quel que soit le
 * nombre de lignes. Les requêtes par ligne qui existent déjà sans `agency_id` (médias du bien) ne sont
 * pas de ce ticket, et la différence les annule.
 */
class PropertyIndexQueryBudgetTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private const LIGNES = 20;

    /** Agence + médias + amorce (trois requêtes) : constant, quelle que soit la page. */
    private const SURCOUT_MAX = 8;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        Http::preventStrayRequests();

        $agency = $this->agence();
        $this->admin = $this->personnel($agency, 'agency_admin');
        for ($i = 0; $i < self::LIGNES; $i++) {
            $bien = $this->bienDe($agency, $this->bailleur($agency));
            $agent = $this->personnel($agency);
            app(PrimaryAgentDesignator::class)->designate($bien, $this->collaborateur($bien, $agent), $this->admin);
        }
    }

    private function requetes(string $champs): int
    {
        $this->actingAsApi($this->admin);
        $compte = 0;
        DB::listen(function () use (&$compte) {
            $compte++;
        });
        $reponse = $this->getJson('/api/properties?fields[properties]='.$champs.'&include=address,owner,collaborators&per_page='.self::LIGNES)
            ->assertOk();
        $this->assertCount(self::LIGNES, $reponse->json('data'));
        app('events')->forget('Illuminate\Database\Events\QueryExecuted');

        return $compte;
    }

    public function test_agency_id_ne_coute_pas_une_requete_par_bien(): void
    {
        $sans = $this->requetes('id,user_id,title');
        $avec = $this->requetes('id,user_id,agency_id,title');

        $this->assertLessThanOrEqual(
            self::SURCOUT_MAX,
            $avec - $sans,
            "agency_id coûte {$avec} requêtes contre {$sans} sans lui, sur ".self::LIGNES.' biens',
        );
    }

    /** L'amorce ne change pas ce qui est rendu : le contact, sa source, `is_agent` et l'agence. */
    public function test_la_page_amorcee_rend_ce_que_la_ligne_rendrait(): void
    {
        $this->actingAsApi($this->admin);
        $liste = $this->getJson('/api/properties?fields[properties]=id,user_id,agency_id,title&include=address,owner,collaborators&per_page=1')
            ->assertOk()->json('data.0');
        $fiche = $this->getJson('/api/properties/'.$liste['id'].'?fields[properties]=id,user_id,agency_id,title')
            ->assertOk()->json('data');

        $this->assertSame('designated', $liste['primary_contact_source']);
        foreach (['primary_contact', 'primary_contact_source', 'owner'] as $cle) {
            $this->assertSame($fiche[$cle], $liste[$cle], $cle);
        }
        $this->assertTrue($liste['primary_contact']['is_agent']);
        $this->assertFalse($liste['owner']['is_agent']);
        $this->assertSame(Agency::query()->value('id'), $liste['agency']['id']);
    }
}
