<?php

namespace Tests\Feature\Http;

use App\Http\Responses\PaginationMeta;
use App\Models\Agency;
use App\Models\BankStatement;
use App\Models\BankStatementLine;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * TCK-1220 (P108.03) — cinq listes rendaient `XResource::collection($paginator)` tel quel : Laravel
 * y ajoutait `links` (`first`, `last`, `prev`, `next`) et un `meta` à lui (`path`, `links`, `from`,
 * `to`), hors de {@see PaginationMeta}, avec des URL tirées du schéma, de l'hôte et du port de la
 * requête — l'hôte interne sur le chemin du front, que `forceRootUrl` ne corrige pas.
 *
 * Chaque route rend désormais `{ data, meta }`, `meta` réduit aux quatre clés canoniques, et `data`
 * résolu comme avant : un `whenHas()` non satisfait reste absent, il ne sort pas en `{}`.
 */
class EnveloppeDePaginationDesListesDeRessourcesTest extends TestCase
{
    use RefreshDatabase;

    private function assertEnveloppeCanonique(TestResponse $reponse, int $idAttendu): void
    {
        $reponse->assertOk();
        $corps = $reponse->json();

        $this->assertSame(['data', 'meta'], array_keys($corps));
        $this->assertEqualsCanonicalizing(PaginationMeta::KEYS, array_keys($corps['meta']));
        $this->assertSame($idAttendu, $corps['data'][0]['id']);
        $this->assertStringNotContainsString('{}', (string) $reponse->getContent());
    }

    /** @return array{Agency, User, Property} */
    private function portefeuille(): array
    {
        $agency = Agency::factory()->create(['slug' => 'sahel-homes']);
        $agent = User::factory()->create(['username' => 'awa-diop']);
        AgentProfile::factory()->create(['user_id' => $agent->id, 'agency_id' => $agency->id]);
        $property = Property::factory()->published()->create(['user_id' => $agent->id, 'agency_id' => $agency->id]);

        return [$agency, $agent, $property];
    }

    public function test_la_liste_publique_des_biens(): void
    {
        [, , $property] = $this->portefeuille();

        $this->assertEnveloppeCanonique($this->getJson('/api/public/properties?per_page=1'), $property->id);
    }

    public function test_le_portefeuille_public_d_une_agence(): void
    {
        [, , $property] = $this->portefeuille();

        $this->assertEnveloppeCanonique(
            $this->getJson('/api/public/agencies/sahel-homes/properties?per_page=1'),
            $property->id,
        );
    }

    public function test_le_portefeuille_public_d_un_agent(): void
    {
        [, , $property] = $this->portefeuille();

        $this->assertEnveloppeCanonique(
            $this->getJson('/api/public/agents/awa-diop/properties?per_page=1'),
            $property->id,
        );
    }

    public function test_les_releves_bancaires_et_leurs_lignes(): void
    {
        $agency = Agency::factory()->create();
        $admin = User::factory()->create(['agency_id' => $agency->id]);
        $agency->update(['primary_admin_id' => $admin->id]);
        $statement = BankStatement::factory()->create(['agency_id' => $agency->id]);
        $line = BankStatementLine::factory()->create(['bank_statement_id' => $statement->id]);

        $this->assertEnveloppeCanonique(
            $this->actingAs($admin)->getJson("/api/agencies/{$agency->id}/bank-statements"),
            $statement->id,
        );
        $this->assertEnveloppeCanonique(
            $this->actingAs($admin)->getJson("/api/bank-statements/{$statement->id}/lines"),
            $line->id,
        );
    }
}
