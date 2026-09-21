<?php

namespace Tests\Feature\Media;

use App\Jobs\Media\ApplyWatermarkJob;
use App\Models\Address;
use App\Models\Agency;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\User;
use App\Services\Media\WatermarkTrace;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Queue;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\RemoteDiskFake;
use Tests\TestCase;

/**
 * TCK-539 — R2 de la seconde passe adverse : la décision de filigrane ne doit ni coûter une
 * requête par bien, ni changer la FORME de la liste publique.
 *
 * Mesuré par le vérificateur, page de 10 biens, agence sans filigrane : 35 requêtes au lieu de
 * 5, 10 lectures d'`agencies`, et un bloc `agency` dans chaque élément — `requiresWatermark()`
 * chargeait la relation, que `PropertyResource` émet dès qu'elle est chargée.
 *
 * Le contrôle est RELATIF : le même endpoint pour 2 biens et pour 7 doit coûter le même nombre
 * de requêtes. Un seuil absolu mesurerait le reste de l'endpoint, pas ce défaut.
 */
class WatermarkListQueryCountTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        RemoteDiskFake::install('r2-media');
        RemoteDiskFake::install('r2-private');
    }

    /**
     * `[filigrane exigé, état de la trace, photo servie ?]` :
     * - `complete` : filigranées, ou exemptées sans filigrane — la trace suffit, rien n'est lu ;
     * - `attente` : produites, pas encore filigranées — la règle doit être lue, rien n'est servi ;
     * - `absente` : produites avant la trace (données existantes) — la règle doit être lue. Sans
     *   filigrane, c'est EXACTEMENT le cas mesuré par le vérificateur (35 requêtes).
     *
     * @return array<string, array{bool, string, bool}>
     */
    public static function scenarios(): array
    {
        return [
            'filigrane requis, traces complètes' => [true, 'complete', true],
            'agence sans filigrane, conversions exemptées' => [false, 'complete', true],
            'filigrane requis, en attente du worker' => [true, 'attente', false],
            'agence sans filigrane, photos antérieures à la trace' => [false, 'absente', true],
            'filigrane requis, photos antérieures à la trace' => [true, 'absente', false],
        ];
    }

    /** @return list<Property> */
    private function biens(int $nombre, bool $filigrane, string $trace): array
    {
        $biens = [];
        for ($i = 0; $i < $nombre; $i++) {
            // Une agence PAR bien : le pire cas pour un N+1 sur `agencies`.
            $agency = Agency::factory()->create([
                'primary_admin_id' => User::factory()->create()->id,
                'settings' => ['watermark_enabled' => $filigrane],
            ]);
            $property = Property::factory()->published()->create(['agency_id' => $agency->id]);
            Address::create([
                'addressable_type' => Property::class,
                'addressable_id' => $property->id,
                'city' => 'Dakar',
                'country' => 'SN',
                'latitude' => 14.7,
                'longitude' => -17.5,
            ]);

            $trace === 'attente' ? Queue::fake([ApplyWatermarkJob::class]) : null;
            $media = $property->addMedia(UploadedFile::fake()->image("villa-{$i}.jpg", 1200, 900))->toMediaCollection('photos');
            if ($trace === 'absente') {
                $media->refresh()->setCustomProperty(WatermarkTrace::KEY, [])->setCustomProperty(WatermarkTrace::EXEMPT_KEY, [])->save();
            }
            $biens[] = $property;
        }

        return $biens;
    }

    /** @return array{int, int, array<int, array<string, mixed>>} requêtes, lectures d'`agencies`, éléments */
    private function mesurer(string $uri, string $cle): array
    {
        DB::flushQueryLog();
        DB::enableQueryLog();
        $elements = $this->getJson($uri)->assertOk()->json($cle);
        $log = DB::getQueryLog();
        DB::disableQueryLog();

        return [
            count($log),
            collect($log)->filter(fn (array $q) => str_contains($q['query'], '"agencies"'))->count(),
            $elements,
        ];
    }

    #[DataProvider('scenarios')]
    public function test_public_list_cost_and_shape_do_not_depend_on_the_number_of_properties(bool $filigrane, string $trace, bool $servie): void
    {
        $this->biens(2, $filigrane, $trace);
        [$petit, $lecturesPetit, $elements] = $this->mesurer('/api/public/properties', 'data');
        $this->assertCount(2, $elements);

        $this->biens(5, $filigrane, $trace);
        [$grand, $lecturesGrand, $elements] = $this->mesurer('/api/public/properties', 'data');
        $this->assertCount(7, $elements);

        $this->assertSame($petit, $grand, "Requêtes : {$petit} pour 2 biens, {$grand} pour 7.");
        $this->assertLessThanOrEqual(1, $lecturesGrand, "Lectures d'`agencies` pour 7 biens : {$lecturesGrand}.");

        foreach ($elements as $element) {
            $this->assertArrayNotHasKey('agency', $element, 'La liste publique n\'émet pas de bloc `agency`.');
            $servie
                ? $this->assertNotNull($element['main_photo_url'])
                : $this->assertNull($element['main_photo_url'], 'Filigrane exigé, non couverte par la trace : non servie.');
        }
    }

    #[DataProvider('scenarios')]
    public function test_map_cost_does_not_depend_on_the_number_of_properties(bool $filigrane, string $trace, bool $servie): void
    {
        $uri = '/api/public/properties/map?bounds=14.0,-18.0,15.0,-17.0';

        $this->biens(2, $filigrane, $trace);
        [$petit] = $this->mesurer($uri, 'features');

        $this->biens(5, $filigrane, $trace);
        [$grand, $lectures, $features] = $this->mesurer($uri, 'features');

        $this->assertCount(7, $features);
        $this->assertSame($petit, $grand, "Requêtes de la carte : {$petit} pour 2 biens, {$grand} pour 7.");
        $this->assertLessThanOrEqual(1, $lectures);
        foreach ($features as $feature) {
            $this->assertSame($servie, $feature['properties']['thumbnail'] !== null);
        }
    }

    /**
     * `fields[properties]=…` (spatie, `Property::buildQuery()`) retire `agency_id` du SELECT.
     * L'ancienne lecture passait par `$property->agency`, donc par cet attribut absent : `null`,
     * « pas de filigrane », et la conversion NUE servie. La décision se prend désormais par
     * `properties.id`. La liste publique n'applique pas `fields[]` : c'est la console qui l'expose.
     */
    public function test_a_sparse_fieldset_without_agency_id_does_not_serve_an_unwatermarked_conversion(): void
    {
        $this->biens(1, true, 'attente');
        $admin = User::factory()->create();
        $this->materializeRoleProfile($admin, 'super_admin');
        Sanctum::actingAs($admin);

        $element = $this->getJson('/api/properties?fields[properties]=id,title,slug')->assertOk()->json('data.0');

        $this->assertArrayNotHasKey('status', $element, 'Précondition : le SELECT est bien restreint.');
        $this->assertNull($element['main_photo_url'], 'Filigrane exigé et pas encore posé : rien de servi, même sans `agency_id` lu.');
    }

    /** @return array<string, array{string}> */
    public static function acteursSansRaw(): array
    {
        return [
            'agent de l\'agence, sans viewRaw' => ['agent'],
            'super-admin, sans ?raw=1' => ['super_admin'],
        ];
    }

    /**
     * Troisième passe adverse, F1 — `test_2d` du vérificateur, à l'identique : `include=agency`
     * fait charger la relation par spatie ALORS QUE `agency_id` n'est pas sélectionné, donc à
     * `null`. La croire rendait « pas de filigrane », et la conversion nue était servie.
     */
    #[DataProvider('acteursSansRaw')]
    public function test_include_agency_with_a_sparse_fieldset_does_not_serve_an_unwatermarked_conversion(string $acteur): void
    {
        [$property] = $this->biens(1, true, 'attente');
        $user = User::factory()->create();
        $acteur === 'agent'
            ? AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $property->agency_id])
            : $this->materializeRoleProfile($user, 'super_admin');
        Sanctum::actingAs($user);

        $media = $property->getFirstMedia('photos');
        $this->assertSame($acteur === 'super_admin', Gate::forUser($user)->allows('viewRaw', $media), 'Précondition : viewRaw.');

        foreach ([
            '/api/properties?fields[properties]=id,title,slug&include=agency',
            '/api/properties?include=agency',
            '/api/properties',
        ] as $uri) {
            $element = collect($this->getJson($uri)->assertOk()->json('data'))->firstWhere('id', $property->id);

            $this->assertNotNull($element, "Précondition : le bien est listé ({$uri}).");
            $this->assertNull($element['main_photo_url'], "{$uri} : filigrane exigé et pas encore posé, rien ne doit être servi.");
        }
    }

    /** Une relation qui ne correspond pas à la clé n'est pas crue : c'est `properties.id` qui tranche. */
    public function test_a_loaded_agency_relation_that_does_not_match_agency_id_is_not_trusted(): void
    {
        [$property] = $this->biens(1, true, 'attente');
        $sansFiligrane = Agency::factory()->create([
            'primary_admin_id' => User::factory()->create()->id,
            'settings' => ['watermark_enabled' => false],
        ]);

        $fresh = Property::query()->find($property->id);
        $fresh->setRelation('agency', $sansFiligrane);
        $this->assertFalse($fresh->agencyRelationIsReliable());
        $this->assertTrue($fresh->requiresWatermark());

        $partiel = Property::query()->select('id', 'title')->find($property->id);
        $partiel->setRelation('agency', null);
        $this->assertFalse($partiel->agencyRelationIsReliable(), '`agency_id` non sélectionné : relation non crue.');
        $this->assertTrue($partiel->requiresWatermark());

        $complet = Property::query()->with('agency')->find($property->id);
        $this->assertTrue($complet->agencyRelationIsReliable());
        $this->assertTrue($complet->requiresWatermark());
    }

    /**
     * Le même filtre que `requiresWatermark()` dans `WatermarkRequirement::attach()` : un bien
     * dont la relation n'est pas digne de foi entre dans le LOT, pas dans une requête à lui.
     *
     * On compte les seules lectures de la règle (`properties left join agencies`) : la console
     * a par ailleurs un N+1 antérieur à la branche (relevé par la passe adverse 2), que ce test
     * n'a pas à mesurer.
     */
    public function test_console_sparse_include_agency_reads_the_rule_once_for_the_whole_list(): void
    {
        $admin = User::factory()->create();
        $this->materializeRoleProfile($admin, 'super_admin');
        Sanctum::actingAs($admin);

        $this->biens(7, true, 'attente');

        DB::flushQueryLog();
        DB::enableQueryLog();
        $elements = $this->getJson('/api/properties?fields[properties]=id,title,slug&include=agency')->assertOk()->json('data');
        $lectures = collect(DB::getQueryLog())->filter(fn (array $q) => str_contains($q['query'], 'left join "agencies"'))->count();
        DB::disableQueryLog();

        $this->assertCount(7, $elements);
        $this->assertSame(1, $lectures, "Lectures de la règle pour 7 biens : {$lectures}.");
    }
}
