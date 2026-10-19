<?php

namespace Tests\Feature\Search;

use App\Models\Address;
use App\Models\Enums\ContractType;
use App\Models\Enums\PropertyType;
use App\Models\Property;
use App\Services\Search\PropertySearchService;
use GuzzleHttp\Client as Guzzle;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Scout\EngineManager;
use Meilisearch\Client as Meilisearch;
use Psr\Http\Client\ClientInterface;
use Psr\Http\Message\RequestInterface;
use Psr\Http\Message\ResponseInterface;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

/**
 * TCK-984 (P55.03) — la requête de page (nominale ou élargie) ne demande au moteur que `id` :
 * `hydrate()` ne lit rien d'autre dans un hit et recharge tout depuis la base. La page rendue,
 * elle, reste entière.
 *
 * Le test lit les requêtes que le client Meilisearch envoie réellement : la projection n'a aucun
 * autre effet observable, puisque l'hydratation relit la base.
 */
class PropertySearchProjectionTest extends TestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    /** @var list<array{path: string, body: array<string, mixed>}> */
    private array $envois = [];

    /** @var list<int> */
    private array $villas = [];

    protected function setUp(): void
    {
        parent::setUp();
        foreach (['Dakar', 'Dakar', 'Saly'] as $ville) {
            $this->villas[] = $this->publier(PropertyType::Villa, $ville)->id;
        }
        $this->publier(PropertyType::Studio, 'Dakar');
        $this->indexProperties();
        $this->enregistrerLesEnvois();
    }

    public function test_la_requete_nominale_ne_demande_que_l_identifiant(): void
    {
        $resultat = app(PropertySearchService::class)->search(['q' => 'villa', 'placements' => false]);

        $pages = array_values(array_filter($this->envois, fn (array $e) => str_ends_with($e['path'], '/search') && isset($e['body']['hitsPerPage'])));
        $this->assertCount(1, $pages);
        $this->assertSame(['id'], $pages[0]['body']['attributesToRetrieve'] ?? null);

        $this->assertPageEntiere($resultat);
    }

    public function test_la_requete_elargie_ne_demande_que_l_identifiant(): void
    {
        $resultat = app(PropertySearchService::class)->search(['q' => 'villa Mbour', 'placements' => false]);
        $this->assertSame('widened', $resultat['search']['strategy']);

        $multi = array_values(array_filter($this->envois, fn (array $e) => str_ends_with($e['path'], '/multi-search')));
        $this->assertCount(1, $multi);
        $this->assertSame(['id'], $multi[0]['body']['queries'][0]['attributesToRetrieve'] ?? null);

        $this->assertPageEntiere($resultat);
    }

    /** @param  array<string, mixed>  $resultat */
    private function assertPageEntiere(array $resultat): void
    {
        $this->assertSame(3, $resultat['meta']['total']);
        $this->assertEqualsCanonicalizing($this->villas, array_column($resultat['data'], 'id'));
        foreach ($resultat['data'] as $bien) {
            $this->assertNotEmpty($bien['title'], 'la page est hydratée depuis la base, pas depuis le hit');
            $this->assertArrayHasKey('price', $bien);
        }
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

    private function publier(PropertyType $type, string $ville): Property
    {
        $bien = Property::factory()->published()->create([
            'title' => 'Demeure '.$ville,
            'description' => 'Vue dégagée.',
            'type' => $type,
            'contract_type' => ContractType::Rent,
        ]);
        Address::create([
            'addressable_type' => Property::class,
            'addressable_id' => $bien->id,
            'city' => $ville,
            'neighborhood' => 'Centre',
        ]);

        return $bien;
    }
}
