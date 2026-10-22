<?php

namespace Tests\Feature\Api;

use App\Exceptions\ApiError;
use App\Http\Filters\ExactIdentifierFilter;
use App\Models\Agency;
use App\Models\Concerns\HasQueryBuilder;
use App\Models\Document;
use App\Models\MaintenanceRequest;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Spatie\QueryBuilder\Exceptions\InvalidFilterQuery;
use Symfony\Component\Finder\Finder;
use Tests\TestCase;

/**
 * Un filtre exact sur une colonne d'identifiant (`id`, `*_id`) refuse en 400 une valeur non
 * entière (`App\Http\Filters\ExactIdentifierFilter`).
 *
 * Relevé le 2026-09-24, vérification de TCK-576 : `filter[property_id]=abc` rendait 500 sur
 * `/api/leases`, `/api/properties`, `/api/invoices`, `/api/maintenance-requests` — PostgreSQL
 * refuse la conversion (`SQLSTATE[22P02]`), et la réponse accusait le serveur d'une requête
 * fautive du client.
 */
class FiltreIdentifiantTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<string, array{0: string}> */
    public static function valeursInvalides(): array
    {
        return [
            'texte' => ['abc'],
            'négatif' => ['-1'],
            'décimal' => ['1.5'],
            'trop grand pour un bigint' => ['99999999999999999999'],
            'liste dont un élément est invalide' => ['1,abc'],
        ];
    }

    #[DataProvider('valeursInvalides')]
    public function test_une_valeur_non_entiere_est_refusee_en_400(string $valeur): void
    {
        $agency = Agency::factory()->create();
        Sanctum::actingAs(User::factory()->withAgentProfile($agency)->create());

        $this->getJson('/api/properties?filter[user_id]='.urlencode($valeur))
            ->assertStatus(400)
            ->assertJsonPath('code', 'filter.identifier_invalid')
            ->assertJsonPath('params.filter', 'user_id');
    }

    public function test_un_identifiant_entier_filtre_toujours_seul_ou_en_liste(): void
    {
        $agency = Agency::factory()->create();
        $moi = User::factory()->withAgentProfile($agency)->create();
        $collegue = User::factory()->withAgentProfile($agency)->create();
        $tiers = User::factory()->withAgentProfile($agency)->create();
        $mien = Property::factory()->create(['user_id' => $moi->id, 'agency_id' => $agency->id]);
        $sien = Property::factory()->create(['user_id' => $collegue->id, 'agency_id' => $agency->id]);
        Property::factory()->create(['user_id' => $tiers->id, 'agency_id' => $agency->id]);
        Sanctum::actingAs($moi);

        $this->getJson('/api/properties?filter[user_id]='.$moi->id)
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.id', $mien->id);

        $ids = collect($this->getJson("/api/properties?filter[user_id]={$moi->id},{$collegue->id}")
            ->assertOk()
            ->json('data'))->pluck('id')->sort()->values()->all();
        $this->assertSame(collect([$mien->id, $sien->id])->sort()->values()->all(), $ids);
    }

    public function test_la_regle_couvre_tout_filtre_exact_d_identifiant_declare_par_un_modele(): void
    {
        // `users.added_by_id` : un `*_id` déclaré par `User::$requestFilterable`, sans route dédiée.
        $request = Request::create('/', 'GET', ['filter' => ['added_by_id' => 'abc']]);

        $this->expectException(ApiError::class);
        User::buildQuery(request: $request)->get();
    }

    /**
     * TCK-1403 (P151.05) — `parent_id` des biens est un rappel écrit à la main (pour accepter
     * `null`) : sa branche non nulle juge la valeur comme tout filtre d'identifiant.
     */
    #[DataProvider('valeursInvalides')]
    public function test_le_parent_d_un_bien_refuse_une_valeur_non_entiere_en_400(string $valeur): void
    {
        $agency = Agency::factory()->create();
        Sanctum::actingAs(User::factory()->withAgentProfile($agency)->create());

        $this->getJson('/api/properties?filter[parent_id]='.urlencode($valeur))
            ->assertStatus(400)
            ->assertJsonPath('code', 'filter.identifier_invalid')
            ->assertJsonPath('params.filter', 'parent_id');
        $this->getJson('/api/properties?filter[parent_id]=null')->assertOk();
    }

    /**
     * TCK-1403 (P151.05) — le titulaire des moyens de reversement se cherche avant la règle
     * `integer` : un identifiant illisible est un titulaire introuvable, donc 403, plus un 500.
     */
    public function test_le_titulaire_des_moyens_de_reversement_illisible_est_refuse(): void
    {
        $agency = Agency::factory()->create();
        Sanctum::actingAs(User::factory()->withAgentProfile($agency)->create());

        $this->getJson('/api/payout-methods?filter[user_id]=abc')->assertForbidden();
    }

    /**
     * TCK-1411 (P151.03) — tout filtre exact sur une colonne entière ou booléenne refuse `abc`
     * avant PostgreSQL : un identifiant en 400 (`ExactIdentifierFilter`, y compris les clés
     * étrangères qui ne finissent pas par `_id`), un entier ou un booléen en 422. La liste se
     * dérive des colonnes : un filtre typé neuf, non déclaré, rougit ici.
     */
    public function test_chaque_filtre_exact_d_une_colonne_entiere_ou_booleenne_refuse_abc(): void
    {
        $vus = 0;
        foreach (Finder::create()->files()->in(app_path('Models'))->name('*.php') as $file) {
            $class = 'App\\Models\\'.str_replace(['/', '.php'], ['\\', ''], $file->getRelativePathname());
            if (! class_exists($class) || (new \ReflectionClass($class))->isAbstract()
                || ! in_array(HasQueryBuilder::class, class_uses_recursive($class), true)) {
                continue;
            }
            $table = (new $class)->getTable();
            foreach ((new \ReflectionClass($class))->getStaticPropertyValue('requestFilterable', []) as $champ) {
                if (ExactIdentifierFilter::garde($champ) || str_contains($champ, '.') || ! Schema::hasColumn($table, $champ)) {
                    continue;
                }
                if (! preg_match('/^(int|bool)/', Schema::getColumnType($table, $champ))) {
                    continue;
                }
                $vus++;
                try {
                    $class::buildQuery(request: Request::create('/', 'GET', ['filter' => [$champ => 'abc']]))->get();
                    $this->fail("{$class} : filter[{$champ}]=abc n'est pas refusé");
                } catch (ApiError|ValidationException) {
                    // attendu : 400 ou 422, jamais une erreur de PostgreSQL
                }
            }
        }

        $this->assertGreaterThanOrEqual(20, $vus, 'le relevé des filtres typés ne trouve plus sa cible');
    }

    /** TCK-1411 (P151.03) — une valeur lisible filtre toujours, par type. */
    public function test_un_filtre_type_lisible_filtre_toujours(): void
    {
        $agent = User::factory()->create();
        $mienne = MaintenanceRequest::factory()->create(['assigned_to' => $agent->id]);
        MaintenanceRequest::factory()->create();
        $ids = MaintenanceRequest::buildQuery(request: Request::create('/', 'GET', ['filter' => ['assigned_to' => (string) $agent->id]]))->pluck('id')->all();
        $this->assertSame([$mienne->id], $ids);

        $verifie = Document::factory()->create(['is_verified' => true]);
        $nonVerifie = Document::factory()->create(['is_verified' => false]);
        $ids = Document::buildQuery(request: Request::create('/', 'GET', ['filter' => ['is_verified' => 'true']]))->pluck('id')->all();
        $this->assertContains($verifie->id, $ids);
        $this->assertNotContains($nonVerifie->id, $ids);

        $deux = Property::factory()->create(['bedrooms' => 2]);
        $trois = Property::factory()->create(['bedrooms' => 3]);
        $ids = Property::buildQuery(request: Request::create('/', 'GET', ['filter' => ['bedrooms' => '2']]))->pluck('id')->all();
        $this->assertContains($deux->id, $ids);
        $this->assertNotContains($trois->id, $ids);
    }

    /** TCK-1411 (P151.03) — `published_at` exact n'avait aucun lecteur : il n'est plus un filtre. */
    public function test_published_at_n_est_plus_un_filtre_exact_des_biens(): void
    {
        $this->expectException(InvalidFilterQuery::class);
        Property::buildQuery(request: Request::create('/', 'GET', ['filter' => ['published_at' => '2026-10-22']]))->get();
    }
}
