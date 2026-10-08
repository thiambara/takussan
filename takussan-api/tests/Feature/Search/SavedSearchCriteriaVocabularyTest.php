<?php

namespace Tests\Feature\Search;

use App\Models\Address;
use App\Models\Enums\TagType;
use App\Models\Property;
use App\Models\SavedSearch;
use App\Models\Tag;
use App\Models\User;
use App\Services\Model\SearchService;
use App\Support\SavedSearchCriteria;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

/**
 * TCK-599 (ADR-0050 §2, contrainte 10) — **un critère accepté est un critère appliqué.**
 *
 * Pour CHACUNE des clés de `SavedSearchCriteria::KEYS`, deux biens publics : `A` (la base) et
 * `B`, qui ne s'en écarte QUE par le champ que la clé filtre. L'alerte doit rendre `A` et jamais
 * `B` ; le témoin sans la clé rend les deux — c'est lui qui prouve que l'exclusion de `B` tient à
 * la clé, et non à un bien mal fabriqué. Une clé ajoutée à `KEYS` sans être lue par le moteur fait
 * rougir sa ligne ; une clé de `KEYS` sans ligne ici fait rougir le test de complétude.
 *
 * `lat`, `lng` et `radius_km` ne filtrent qu'ENSEMBLE (un point sans rayon ne borne rien) : leurs
 * trois lignes portent le même triplet, et chacune ablate la sienne dans le témoin.
 */
class SavedSearchCriteriaVocabularyTest extends TestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    private const POINT = ['lat' => 14.7, 'lng' => -17.45, 'radius_km' => 3];

    /** La base : un bien qui satisfait toutes les valeurs ci-dessous. */
    private const BASE = [
        'title' => 'Villa avec piscine',
        'description' => 'Belle maison lumineuse.',
        'type' => 'villa',
        'contract_type' => 'rent',
        'rent_period' => 'monthly',
        'price' => 200_000,
        'bedrooms' => 3,
        'bathrooms' => 2,
        'area' => 120,
        'furnished' => true,
        'featured' => true,
        'floor_number' => 2,
        'available_from' => '2026-10-15',
        'title_type' => 'titre_foncier',
        'condition' => 'new',
    ];

    private const BASE_ADDRESS = ['city' => 'Dakar', 'neighborhood' => 'Almadies', 'latitude' => 14.7, 'longitude' => -17.45];

    /**
     * clé → [clé, critères (forme exacte du front), écart de B sur le bien, écart de B sur l'adresse, tag de A]
     *
     * @return array<string, array{string, array<string, mixed>, array<string, mixed>, array<string, mixed>, ?string}>
     */
    public static function cles(): array
    {
        // ⚠ Pour une clé multi-valuée, le bien A porte la SECONDE valeur : une liste réduite à
        // son premier élément l'écarterait.
        return [
            'q' => ['q', ['q' => 'piscine'], ['title' => 'Villa vue mer'], [], null],
            'location' => ['location', ['location' => 'Almadies'], [], ['neighborhood' => 'Médina'], null],
            'city' => ['city', ['city' => 'Dakar'], [], ['city' => 'Thiès'], null],
            'cities' => ['cities', ['cities' => ['Dakar', 'Mbour']], [], ['city' => 'Saint-Louis'], null],
            'radius_km' => ['radius_km', self::POINT, [], ['latitude' => 14.9, 'longitude' => -17.2], null],
            'lat' => ['lat', self::POINT, [], ['latitude' => 14.9, 'longitude' => -17.2], null],
            'lng' => ['lng', self::POINT, [], ['latitude' => 14.9, 'longitude' => -17.2], null],
            'contract_type' => ['contract_type', ['contract_type' => 'rent'], ['contract_type' => 'sale', 'rent_period' => null], [], null],
            'type' => ['type', ['type' => ['house', 'villa']], ['type' => 'apartment'], [], null],
            'rent_period' => ['rent_period', ['rent_period' => 'monthly'], ['rent_period' => 'daily'], [], null],
            'price_min' => ['price_min', ['price_min' => 150_000], ['price' => 100_000], [], null],
            'price_max' => ['price_max', ['price_max' => 300_000], ['price' => 400_000], [], null],
            'bedrooms' => ['bedrooms', ['bedrooms' => 3], ['bedrooms' => 2], [], null],
            'bathrooms' => ['bathrooms', ['bathrooms' => 2], ['bathrooms' => 1], [], null],
            'area_min' => ['area_min', ['area_min' => 100], ['area' => 60], [], null],
            'area_max' => ['area_max', ['area_max' => 150], ['area' => 200], [], null],
            'furnished' => ['furnished', ['furnished' => true], ['furnished' => false], [], null],
            'featured' => ['featured', ['featured' => true], ['featured' => false], [], null],
            'floor_number' => ['floor_number', ['floor_number' => 2], ['floor_number' => 5], [], null],
            'available_from' => ['available_from', ['available_from' => '2026-11-01'], ['available_from' => '2026-12-01'], [], null],
            'title_type' => ['title_type', ['title_type' => 'titre_foncier'], ['title_type' => 'bail'], [], null],
            'condition' => ['condition', ['condition' => ['renovated', 'new']], ['condition' => 'good'], [], null],
            'tags' => ['tags', ['tags' => 'Piscine'], [], [], 'Piscine'],
        ];
    }

    public function test_chaque_cle_du_vocabulaire_a_sa_ligne(): void
    {
        $this->assertEqualsCanonicalizing(SavedSearchCriteria::KEYS, array_keys(self::cles()));
        $this->assertCount(23, SavedSearchCriteria::KEYS);
    }

    /**
     * **AC9** — chaque clé écarte le bien qu'elle doit écarter.
     *
     * @param  array<string, mixed>  $criteres
     * @param  array<string, mixed>  $ecartBien
     * @param  array<string, mixed>  $ecartAdresse
     */
    #[DataProvider('cles')]
    public function test_chaque_cle_filtre_l_alerte(string $cle, array $criteres, array $ecartBien, array $ecartAdresse, ?string $tag): void
    {
        $a = $this->bien([], [], $tag);
        $b = $this->bien($ecartBien, $ecartAdresse, null);
        $this->indexProperties();

        $this->assertSame([$a->id], $this->captes($criteres), "« {$cle} » : B ne diffère que par elle, l'alerte doit l'écarter");

        // Témoin : sans la clé éprouvée, les deux biens sortent.
        $temoin = $criteres;
        unset($temoin[$cle]);
        $this->assertEqualsCanonicalizing([$a->id, $b->id], $this->captes($temoin), "témoin de « {$cle} » : les deux biens sortent sans elle");
    }

    /**
     * Une ligne antérieure à la migration peut porter une clé hors vocabulaire : elle n'atteint
     * jamais le moteur, même le jour où `buildFilter()` apprendrait à lire une clé de ce nom.
     */
    public function test_une_cle_hors_vocabulaire_n_atteint_pas_le_moteur(): void
    {
        $this->assertSame(
            ['city' => 'Dakar', 'type' => 'house,villa'],
            SavedSearchCriteria::toSearchParams(['agency_id' => 3, 'neighborhoods' => ['Ngor'], 'city' => 'Dakar', 'type' => ['house', 'villa']]),
        );
    }

    /**
     * **AC9** — la fabrique et le seeder n'écrivent que le vocabulaire. Le seeder exige tout le
     * contexte de semis pour s'exécuter : ses clés sont relevées dans sa source (le tableau
     * `criteria` littéral), et le relevé doit en trouver au moins une, sans quoi il ne prouve rien.
     */
    public function test_la_fabrique_et_le_seeder_n_ecrivent_que_le_vocabulaire(): void
    {
        $fabrique = array_keys(SavedSearch::factory()->make()->criteria);
        $this->assertNotEmpty($fabrique);
        $this->assertSame([], array_diff($fabrique, SavedSearchCriteria::KEYS), 'fabrique');

        $source = (string) file_get_contents(database_path('seeders/Crm/SavedSearchSeeder.php'));
        $this->assertSame(1, preg_match("/'criteria' => \\[(.*?)\\n\\s*\\],/s", $source, $bloc), 'le tableau criteria du seeder');
        preg_match_all("/^\\s*'([a-z_]+)' =>/m", $bloc[1], $cles);
        $this->assertNotEmpty($cles[1]);
        $this->assertSame([], array_diff($cles[1], SavedSearchCriteria::KEYS), 'seeder');
    }

    /** **AC9** — une clé hors vocabulaire rend 422 à la création ET à la modification. */
    public function test_une_cle_inconnue_rend_422_a_la_creation_comme_a_la_modification(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/saved-searches', ['name' => 'Ancienne', 'criteria' => ['max_price' => 1]])
            ->assertUnprocessable()->assertJsonValidationErrors('criteria');
        $this->assertDatabaseCount('saved_searches', 0);

        $search = $this->postJson('/api/saved-searches', ['name' => 'Juste', 'criteria' => ['price_max' => 1]])
            ->assertCreated()->json('data.id');
        $this->patchJson("/api/saved-searches/{$search}", ['criteria' => ['max_price' => 1]])
            ->assertUnprocessable()->assertJsonValidationErrors('criteria');
        $this->assertSame(['price_max' => 1], SavedSearch::find($search)->criteria);
    }

    /**
     * verif-599 m4 — le vocabulaire est fermé sur les VALEURS : chaque forme ci-dessous rend 422,
     * sur le compte comme pour le visiteur, et rien n'est stocké.
     *
     * @return array<string, array{array<string, mixed>}>
     */
    public static function valeursRefusees(): array
    {
        return [
            'type imbriqué' => [['type' => [['villa']]]],
            'type objet' => [['type' => ['a' => 'villa']]],
            'tags objet' => [['tags' => ['a' => ['b' => 'c']]]],
            'condition imbriquée' => [['condition' => ['x' => ['y' => 1]]]],
            'condition inconnue' => [['condition' => ['new', 'neuf']]],
            'condition inconnue en chaîne' => [['condition' => 'new,neuf']],
            'rayon sans point' => [['radius_km' => 2]],
            'latitude seule' => [['lat' => 14.7]],
            'point sans latitude' => [['radius_km' => 2, 'lng' => -17.45]],
            'point sans longitude' => [['radius_km' => 2, 'lat' => 14.7]],
            'rayon nul' => [['radius_km' => 0, 'lat' => 14.7, 'lng' => -17.45]],
            'contrat hors énumération' => [['contract_type' => 'louer']],
            'titre hors énumération' => [['title_type' => 'acte']],
        ];
    }

    #[DataProvider('valeursRefusees')]
    public function test_une_valeur_hors_vocabulaire_rend_422(array $criteres): void
    {
        Sanctum::actingAs(User::factory()->create());
        $this->postJson('/api/saved-searches', ['name' => 'Piège', 'criteria' => $criteres])
            ->assertUnprocessable();

        $this->app['auth']->forgetGuards();
        $this->postJson('/api/public/search-alerts', [
            'criteria' => $criteres, 'frequency' => 'daily', 'channel' => 'email',
            'email' => 'awa@exemple.sn', 'locale' => 'fr', 'consent' => true,
        ])->assertUnprocessable();

        $this->assertDatabaseCount('saved_searches', 0);
    }

    /** Les deux formes d'une clé multi-valuée — liste du front, chaîne de l'URL — restent acceptées. */
    public function test_les_deux_formes_d_une_liste_sont_acceptees(): void
    {
        Sanctum::actingAs(User::factory()->create());

        foreach ([['type' => 'house,villa', 'condition' => 'new,renovated'], ['type' => ['house', 'villa'], 'condition' => ['new']]] as $i => $criteres) {
            $this->postJson('/api/saved-searches', ['name' => "Forme {$i}", 'criteria' => $criteres])->assertCreated();
        }
    }

    /** La forme du front passe telle quelle (tableaux de `type`/`condition`, booléens, `cities`). */
    public function test_la_forme_exacte_du_front_est_acceptee(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->postJson('/api/saved-searches', [
            'name' => 'Toutes les clés',
            'criteria' => [
                'q' => 'piscine', 'location' => 'Almadies', 'city' => 'Dakar', 'cities' => ['Dakar'],
                'radius_km' => 3, 'lat' => 14.7, 'lng' => -17.45, 'contract_type' => 'rent',
                'type' => ['type', 'villa'], 'rent_period' => 'monthly', 'price_min' => 1, 'price_max' => 2,
                'bedrooms' => 3, 'bathrooms' => 2, 'area_min' => 1, 'area_max' => 2, 'furnished' => true,
                'featured' => true, 'floor_number' => 2, 'available_from' => '2026-11-01',
                'title_type' => 'titre_foncier', 'condition' => ['new'], 'tags' => 'Piscine',
            ],
            'notification_frequency' => 'off',
        ])->assertCreated();
    }

    /**
     * **AC10** — une ligne au vocabulaire ancien filtre encore après la migration ; une ligne à clé
     * inconnue est comptée dans le journal de la migration, sans être modifiée.
     */
    public function test_la_migration_de_vocabulaire_reecrit_l_ancien_et_journalise_l_inconnu(): void
    {
        Log::spy();
        $user = User::factory()->create();
        $ancienne = $this->ligneBrute($user, 'Ancienne', ['max_price' => 300000, 'min_area' => 100, 'neighborhoods' => ['Almadies']]);
        $inconnue = $this->ligneBrute($user, 'Inconnue', ['price_max' => 300000, 'surface_utile' => 80]);
        $bon = $this->bien([], [], null);
        $this->bien(['price' => 400_000], [], null);
        $this->bien(['area' => 60], [], null);
        $this->bien([], ['neighborhood' => 'Médina'], null);
        $this->indexProperties();

        (require database_path('migrations/2026_10_08_599100_normalize_saved_search_criteria_vocabulary.php'))->up();

        $this->assertEquals(['price_max' => 300000, 'area_min' => 100, 'location' => 'Almadies'], SavedSearch::find($ancienne)->criteria);
        $this->assertSame([$bon->id], $this->captes(SavedSearch::find($ancienne)->criteria), 'l\'ancienne ligne filtre encore');
        $this->assertEquals(['price_max' => 300000, 'surface_utile' => 80], SavedSearch::find($inconnue)->criteria, 'non modifiée');
        Log::shouldHaveReceived('warning')->withArgs(fn (string $canal, array $c) => $canal === 'saved_search_criteria.unknown_keys'
            && $c['rows'] === 1 && $c['keys'] === ['surface_utile'])->once();
    }

    /** **AC14** — une ligne `instant` existante vaut `daily` après la migration. */
    public function test_la_migration_ramene_instant_a_daily(): void
    {
        $user = User::factory()->create();
        $id = $this->ligneBrute($user, 'Instant', ['city' => 'Dakar'], 'instant');
        $hebdo = $this->ligneBrute($user, 'Hebdo', ['city' => 'Dakar'], 'weekly');

        (require database_path('migrations/2026_10_08_599110_retire_instant_saved_search_frequency.php'))->up();

        $this->assertSame('daily', SavedSearch::find($id)->notification_frequency);
        $this->assertSame('weekly', SavedSearch::find($hebdo)->notification_frequency);
    }

    /** Une ligne écrite AVANT la fermeture du vocabulaire : par la base, comme l'avait fait l'ancien code. */
    private function ligneBrute(User $user, string $nom, array $criteres, string $frequence = 'daily'): int
    {
        return (int) DB::table('saved_searches')->insertGetId([
            'user_id' => $user->id, 'name' => $nom, 'criteria' => json_encode($criteres),
            'notification_frequency' => $frequence, 'is_active' => true, 'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    /** @return list<int> */
    private function captes(array $criteres): array
    {
        $search = SavedSearch::factory()->create([
            'user_id' => User::factory()->create()->id,
            'criteria' => $criteres,
        ]);

        return app(SearchService::class)->getMatchingProperties($search, null, now())['properties']->modelKeys();
    }

    /**
     * @param  array<string, mixed>  $ecart
     * @param  array<string, mixed>  $ecartAdresse
     */
    private function bien(array $ecart, array $ecartAdresse, ?string $tag): Property
    {
        $bien = Property::factory()->published()->create([...self::BASE, ...$ecart, 'published_at' => now()->subHour()]);
        Address::create([
            'addressable_type' => Property::class,
            'addressable_id' => $bien->id,
            'country' => 'SN',
            ...self::BASE_ADDRESS,
            ...$ecartAdresse,
        ]);
        if ($tag !== null) {
            $bien->tags()->attach(Tag::factory()->create(['name' => $tag, 'type' => TagType::Feature]));
        }

        return $bien;
    }
}
