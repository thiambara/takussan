<?php

namespace Tests\Feature\Search;

use App\Models\Agency;
use App\Models\Concerns\HasQueryBuilder;
use App\Models\Customer;
use App\Models\Property;
use App\Models\User;
use GuzzleHttp\Client as Guzzle;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Laravel\Scout\EngineManager;
use Meilisearch\Client as Meilisearch;
use Psr\Http\Client\ClientInterface;
use Psr\Http\Message\RequestInterface;
use Psr\Http\Message\ResponseInterface;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

/**
 * TCK-1009 (P59.01) — `filter[search]` ne demande au moteur que la clé Scout.
 *
 * Le callback de {@see HasQueryBuilder} ne lit que les ids des hits
 * (`keys()`), jusqu'à `SEARCH_ID_CAP` = 5 000 : sans projection, Meilisearch rendait le document
 * entier de chaque correspondance (≈ 1,2 ko par bien, 6 Mo pour 5 000). La liste rendue, elle,
 * ne change pas : le test l'épingle à côté de la requête envoyée, qu'il lit sur le transport du
 * client Meilisearch (même montage que `PropertySearchProjectionTest`).
 */
class FilterSearchProjectionTest extends TestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    /** @var list<array{path: string, body: array<string, mixed>}> */
    private array $envois = [];

    /**
     * TCK-578 (ADR-0008, amendement du 2026-11-16) — la liste des biens des consoles cherche en SQL :
     * l'index des biens est public, il ne contient pas les brouillons qu'elle liste. Elle n'envoie
     * donc AUCUNE recherche au moteur — ni projection à vérifier.
     */
    public function test_la_liste_des_biens_n_interroge_pas_le_moteur(): void
    {
        $agency = Agency::factory()->create();
        $agent = User::factory()->withAgentProfile($agency)->create();
        $mien = Property::factory()->create(['user_id' => $agent->id, 'agency_id' => $agency->id, 'title' => 'Appartement Zorglub']);
        Property::factory()->create(['agency_id' => Agency::factory()->create()->id, 'title' => 'Appartement Zorglub voisin']);
        $this->indexProperties();
        $this->enregistrerLesEnvois();

        Sanctum::actingAs($agent);
        $this->getJson('/api/properties?filter[search]=zorglub&fields[properties]=id,title')
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.id', $mien->id)
            ->assertJsonPath('data.0.title', 'Appartement Zorglub');

        $this->assertSame([], array_values(array_filter(
            $this->envois,
            fn (array $e) => str_ends_with($e['path'], '/search') && str_contains($e['path'], 'properties'),
        )));
    }

    public function test_la_liste_des_clients_ne_demande_que_l_identifiant(): void
    {
        $agency = Agency::factory()->create();
        $agent = User::factory()->withAgentProfile($agency)->create();
        $client = Customer::factory()->create(['agency_id' => $agency->id, 'first_name' => 'Zorglub', 'last_name' => 'Ndiaye']);
        $this->indexSearchable(Customer::class);
        $this->enregistrerLesEnvois();

        Sanctum::actingAs($agent);
        $this->getJson('/api/customers?filter[search]=zorglub&fields[customers]=id,first_name')
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.id', $client->id)
            ->assertJsonPath('data.0.first_name', 'Zorglub');

        $this->assertSeuleLaCle('customers');
    }

    private function assertSeuleLaCle(string $index): void
    {
        $recherches = array_values(array_filter(
            $this->envois,
            fn (array $e) => str_ends_with($e['path'], '/search') && str_contains($e['path'], $index),
        ));
        $this->assertCount(1, $recherches, 'une seule recherche envoyée à l\'index '.$index);
        $this->assertSame(['id'], array_values(array_unique($recherches[0]['body']['attributesToRetrieve'] ?? ['(absent)'])));
    }

    private function enregistrerLesEnvois(): void
    {
        $envois = &$this->envois;
        $http = new class($envois) implements ClientInterface
        {
            private Guzzle $guzzle;

            /** @param  list<array{path: string, body: array<string, mixed>}>  $envois */
            public function __construct(private array &$envois)
            {
                $this->guzzle = new Guzzle;
            }

            public function sendRequest(RequestInterface $request): ResponseInterface
            {
                $this->envois[] = [
                    'path' => $request->getUri()->getPath(),
                    'body' => json_decode((string) $request->getBody(), true) ?? [],
                ];
                $request->getBody()->rewind();

                return $this->guzzle->sendRequest($request);
            }
        };

        $this->app->instance(Meilisearch::class, new Meilisearch(
            config('scout.meilisearch.host'),
            config('scout.meilisearch.key'),
            $http,
        ));
        app(EngineManager::class)->forgetDrivers();
    }
}
