<?php

namespace Tests\Feature\Property;

use App\Models\Agency;
use App\Models\Property;
use App\Models\User;
use App\Services\Property\PrimaryAgentDesignator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * Le budget de requêtes de la liste pro des biens (`GET /api/properties`), tenu par deux tickets.
 *
 * - **TCK-595 (AC15)** : la liste fait le même nombre de requêtes pour 2 biens et pour 20. Chaque
 *   bien a sa photo, un propriétaire distinct, agent de l'agence et pourvu d'un avatar : ce sont les
 *   trois lectures par ligne de `PropertyResource` (photo principale, avatar, `is_agent`).
 * - **TCK-603 (ADR-0059 §6, verif-603 m4)** : demander `agency_id` y fait rendre `primary_contact`,
 *   `primary_contact_source` et le bloc `agency`. Sans préchargement, chaque bien coûtait six requêtes
 *   de plus (agence, logo, moyenne des avis, `isAgentAt` du titulaire et du contact, `isStaffAt` du
 *   contact) : 157 requêtes contre 37 sur 20 biens, relevé de verif-603. Ce budget se juge en
 *   DIFFÉRENCE, à page égale : ce que coûte `agency_id` en plus, quel que soit le nombre de lignes.
 */
class PropertyIndexQueryBudgetTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private const LIGNES = 20;

    /** Agence + médias + amorce (trois requêtes) : constant, quelle que soit la page. */
    private const SURCOUT_MAX = 8;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        Http::preventStrayRequests();
    }

    private function listedProperty(Agency $agency): Property
    {
        $owner = User::factory()->withAgentProfile($agency)->create();
        $owner->addMedia(UploadedFile::fake()->image('avatar.jpg'))->toMediaCollection('avatar');
        $property = Property::factory()->create(['user_id' => $owner->id, 'agency_id' => $agency->id]);
        $property->addMedia(UploadedFile::fake()->image('photo.jpg'))->toMediaCollection('photos');

        return $property;
    }

    private function queries(): int
    {
        DB::flushQueryLog();
        DB::enableQueryLog();
        $response = $this->getJson('/api/properties?per_page=20')->assertOk();
        $count = count(DB::getQueryLog());
        DB::disableQueryLog();

        $first = $response->json('data.0');
        $this->assertNotNull($first['main_photo_url']);
        $this->assertNotNull($first['owner']['avatar_url']);
        $this->assertTrue($first['owner']['is_agent']);

        return $count;
    }

    /** TCK-603 — vingt biens d'agence, chacun avec un agent principal désigné ; rend l'admin. */
    private function lignesDesignees(): User
    {
        $agency = $this->agence();
        $admin = $this->personnel($agency, 'agency_admin');
        for ($i = 0; $i < self::LIGNES; $i++) {
            $bien = $this->bienDe($agency, $this->bailleur($agency));
            $agent = $this->personnel($agency);
            app(PrimaryAgentDesignator::class)->designate($bien, $this->collaborateur($bien, $agent), $admin);
        }

        return $admin;
    }

    private function requetes(User $admin, string $champs): int
    {
        $this->actingAsApi($admin);
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

    public function test_ac15_the_list_costs_the_same_for_two_and_twenty_properties(): void
    {
        $agency = Agency::factory()->create();
        $admin = $this->agencyAdmin($agency);
        foreach (range(1, 2) as $_) {
            $this->listedProperty($agency);
        }
        $this->actingAsApi($admin);
        $this->getJson('/api/properties?per_page=20')->assertOk();

        $two = $this->queries();
        foreach (range(1, 18) as $_) {
            $this->listedProperty($agency);
        }
        $twenty = $this->queries();

        $this->assertSame(20, count($this->getJson('/api/properties?per_page=20')->json('data')));
        $this->assertSame($two, $twenty, "2 biens : {$two} requêtes, 20 biens : {$twenty}");
    }

    public function test_is_agent_still_ignores_a_suspended_profile(): void
    {
        $agency = Agency::factory()->create();
        $admin = $this->agencyAdmin($agency);
        $property = $this->listedProperty($agency);
        $property->owner->agentProfiles()->update(['status' => 'suspended']);

        $this->actingAsApi($admin);

        $this->assertFalse($this->getJson('/api/properties?per_page=20')->assertOk()->json('data.0.owner.is_agent'));
    }

    public function test_agency_id_ne_coute_pas_une_requete_par_bien(): void
    {
        $admin = $this->lignesDesignees();
        $sans = $this->requetes($admin, 'id,user_id,title');
        $avec = $this->requetes($admin, 'id,user_id,agency_id,title');

        $this->assertLessThanOrEqual(
            self::SURCOUT_MAX,
            $avec - $sans,
            "agency_id coûte {$avec} requêtes contre {$sans} sans lui, sur ".self::LIGNES.' biens',
        );
    }

    /** L'amorce ne change pas ce qui est rendu : le contact, sa source, `is_agent` et l'agence. */
    public function test_la_page_amorcee_rend_ce_que_la_ligne_rendrait(): void
    {
        $this->actingAsApi($this->lignesDesignees());
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
