<?php

namespace Tests\Feature\Search;

use App\Jobs\SendSavedSearchAlerts;
use App\Models\Address;
use App\Models\Enums\Currency;
use App\Models\Property;
use App\Models\SavedSearch;
use App\Models\User;
use App\Services\Model\SearchService;
use App\Services\Radar\Targets\RadarDemandSignals;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use RuntimeException;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

/**
 * TCK-2470 (décision du porteur, 2026-11-04) — `saved_searches.results_count` est ÉCRIT : le nombre de biens publics que
 * les critères d'une recherche sauvegardée trouvent au moment du passage des alertes (`SendSavedSearchAlerts`), et à sa
 * création ou sa modification. Sans lui (colonne à défaut 0, jamais écrite), toute recherche sauvegardée active comptait
 * comme « sans résultat » pour les cibles de la demande du Radar (`RadarDemandSignals`).
 */
class SavedSearchResultsCountTest extends TestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        $this->freezeTime();
    }

    private function bien(string $type, int $prix): Property
    {
        $bien = Property::factory()->published()->create([
            'type' => $type, 'price' => $prix, 'currency' => Currency::XOF, 'published_at' => now()->subDays(2),
        ]);
        Address::create(['addressable_type' => Property::class, 'addressable_id' => $bien->id, 'city' => 'Dakar', 'neighborhood' => 'Almadies', 'country' => 'SN']);

        return $bien;
    }

    /** @param  array<string, mixed>  $criteria */
    private function recherche(User $user, string $nom, array $criteria, array $attributs = []): SavedSearch
    {
        return SavedSearch::create($attributs + [
            'user_id' => $user->id, 'name' => $nom, 'criteria' => $criteria, 'notification_frequency' => 'daily', 'is_active' => true,
        ]);
    }

    private function passage(): void
    {
        app()->call([new SendSavedSearchAlerts, 'handle']);
    }

    /** @return list<array<string, mixed>> les critères des signaux de demande tirés des recherches sauvegardées */
    private function signauxDesRecherches(): array
    {
        return collect(app(RadarDemandSignals::class)->collect()['signals'])
            ->filter(fn (array $s) => $s['sources']['saved_searches'] > 0)
            ->pluck('criteria')
            ->values()
            ->all();
    }

    public function test_le_passage_ecrit_le_nombre_de_biens_publics_et_seule_la_recherche_sans_resultat_reste_un_signal(): void
    {
        $user = User::factory()->create();
        $this->bien('apartment', 150_000);
        $this->bien('apartment', 180_000);
        // Déjà notifiées hier : la fenêtre du passage ne voit AUCUN bien neuf, le compte est donc celui de tout le catalogue.
        $trouve = $this->recherche($user, 'Appartements', ['type' => ['apartment'], 'price_max' => 200_000], ['last_notified_at' => now()->subDay()]);
        $vide = $this->recherche($user, 'Villas', ['type' => ['villa'], 'price_max' => 200_000], ['last_notified_at' => now()->subDay()]);
        $this->indexProperties();

        $this->assertCount(2, $this->signauxDesRecherches(), 'avant le passage, les deux comptent comme sans résultat');

        $this->passage();

        $this->assertSame(2, $trouve->fresh()->results_count);
        $this->assertSame(0, $vide->fresh()->results_count);
        $signaux = $this->signauxDesRecherches();
        $this->assertCount(1, $signaux);
        $this->assertSame(['villa'], $signaux[0]['types']);
    }

    public function test_un_premier_passage_reprend_le_total_de_l_alerte_et_une_frequence_off_est_comptee_aussi(): void
    {
        $user = User::factory()->create();
        $this->bien('apartment', 150_000);
        $premiere = $this->recherche($user, 'Première', ['type' => ['apartment']]);
        $muette = $this->recherche($user, 'Muette', ['type' => ['apartment']], ['notification_frequency' => 'off']);
        $inactive = $this->recherche($user, 'Inactive', ['type' => ['apartment']], ['is_active' => false]);
        $this->indexProperties();
        $comptees = new \ArrayObject;
        $this->app->instance(SearchService::class, new class($comptees) extends SearchService
        {
            public function __construct(private readonly \ArrayObject $comptees) {}

            public function countMatchingProperties(SavedSearch $search): int
            {
                $this->comptees[] = $search->id;

                return parent::countMatchingProperties($search);
            }
        });

        $this->passage();

        // La première alerte (aucune borne basse) connaît déjà le total : aucune requête de plus pour elle.
        $this->assertSame([$muette->id], $comptees->getArrayCopy());

        $this->assertSame(1, $premiere->fresh()->results_count);
        $this->assertNotNull($premiere->fresh()->last_notified_at, 'l\'alerte est partie');
        $this->assertSame(1, $muette->fresh()->results_count, 'une alerte coupée reste une demande : elle est comptée');
        $this->assertNull($muette->fresh()->last_notified_at);
        $this->assertSame(0, $inactive->fresh()->results_count, 'une recherche inactive n\'est pas lue');
    }

    public function test_un_compte_qui_echoue_laisse_le_precedent_et_n_empeche_pas_les_autres(): void
    {
        $user = User::factory()->create();
        $this->bien('apartment', 150_000);
        $fautive = $this->recherche($user, 'Fautive', ['type' => ['apartment']], ['last_notified_at' => now()->subDay(), 'results_count' => 7]);
        $saine = $this->recherche($user, 'Saine', ['type' => ['apartment']], ['last_notified_at' => now()->subDay()]);
        $this->indexProperties();
        $this->app->instance(SearchService::class, new class($fautive->id) extends SearchService
        {
            public function __construct(private readonly int $fautive) {}

            public function countMatchingProperties(SavedSearch $search): int
            {
                if ($search->id === $this->fautive) {
                    throw new RuntimeException('moteur indisponible');
                }

                return parent::countMatchingProperties($search);
            }
        });

        $this->passage();

        $this->assertSame(7, $fautive->fresh()->results_count, 'un échec laisse le compte précédent');
        $this->assertSame(1, $saine->fresh()->results_count);
    }

    /**
     * Revue de code du 2026-11-04 — le compte part APRÈS la réponse (`defer`, joué au `terminate()` du noyau, que les tests
     * HTTP appellent) : la réponse porte le compte d'avant (`null` à la création : pas encore compté), la base le compte neuf
     * dès la requête terminée.
     */
    public function test_la_creation_et_la_modification_comptent_les_biens_apres_la_reponse(): void
    {
        $user = User::factory()->create();
        $this->bien('apartment', 150_000);
        $this->indexProperties();
        Sanctum::actingAs($user);

        $id = $this->postJson('/api/saved-searches', ['name' => 'Appartements', 'criteria' => ['type' => ['apartment']]])
            ->assertCreated()
            ->assertJsonPath('data.results_count', null)
            ->json('data.id');
        $this->assertSame(1, SavedSearch::query()->findOrFail($id)->results_count);

        $this->patchJson("/api/saved-searches/{$id}", ['criteria' => ['type' => ['villa']]])
            ->assertOk()
            ->assertJsonPath('data.results_count', 1);
        $this->assertSame(0, SavedSearch::query()->findOrFail($id)->results_count);

        // Une modification qui ne touche pas aux critères ne relance aucun compte.
        SavedSearch::query()->whereKey($id)->update(['results_count' => 5]);
        $this->patchJson("/api/saved-searches/{$id}", ['name' => 'Villas'])->assertOk()->assertJsonPath('data.results_count', 5);
    }
}
