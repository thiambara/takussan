<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Concerns\HasQueryBuilder;
use App\Models\KycDossier;
use App\Models\Property;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Symfony\Component\Finder\Finder;
use Tests\ApiTestCase;

/**
 * TCK-1401 (P151.01) — une virgule dans un texte libre reste du texte. spatie découpe toute valeur
 * de filtre au délimiteur `,` : « Diop, Awa » arrivait en tableau à un rappel typé `string`, et la
 * liste rendait 500. Les filtres de texte libre posent `->delimiter('')`.
 */
class RechercheAvecVirguleTest extends ApiTestCase
{
    use RefreshDatabase;

    /** @return list<class-string<Model>> les modèles à `HasQueryBuilder` qui déclarent une recherche */
    private function modelesAvecRecherche(): array
    {
        $modeles = [];
        foreach (Finder::create()->files()->in(app_path('Models'))->name('*.php') as $file) {
            $class = 'App\\Models\\'.str_replace(['/', '.php'], ['\\', ''], $file->getRelativePathname());
            if (! class_exists($class) || (new \ReflectionClass($class))->isAbstract()) {
                continue;
            }
            if (! in_array(HasQueryBuilder::class, class_uses_recursive($class), true)) {
                continue;
            }
            $champs = (new \ReflectionClass($class))->getStaticPropertyValue('requestSearchFields', []);
            if (! empty($champs)) {
                $modeles[] = $class;
            }
        }

        return $modeles;
    }

    private function requete(array $filter): Request
    {
        return Request::create('/', 'GET', ['filter' => $filter]);
    }

    public function test_chaque_recherche_declaree_accepte_une_virgule(): void
    {
        // La recherche des modèles indexés passe par Scout : le moteur `collection` la sert sans
        // Meilisearch, et c'est la valeur reçue par le rappel qui est éprouvée ici.
        config(['scout.driver' => 'collection']);

        $modeles = $this->modelesAvecRecherche();
        $this->assertContains(Property::class, $modeles);

        foreach ($modeles as $modele) {
            try {
                $modele::buildQuery(request: $this->requete(['search' => 'Diop, Awa']))->get();
            } catch (\TypeError $e) {
                $this->fail("{$modele} : filter[search] avec une virgule lève ".Str::limit($e->getMessage(), 160));
            }
        }
    }

    public function test_la_ville_d_un_bien_accepte_une_virgule(): void
    {
        $agency = Agency::factory()->create();
        Property::factory()->create(['agency_id' => $agency->id]);

        $this->assertIsIterable(Property::buildQuery(request: $this->requete(['city' => 'Dakar, Plateau']))->get());
    }

    public function test_le_type_de_sujet_kyc_accepte_une_virgule(): void
    {
        $this->assertCount(0, KycDossier::buildQuery(request: $this->requete(['subject_type' => 'a,b']))->get());
    }

    public function test_la_recherche_du_journal_d_agence_garde_la_virgule(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $property = Property::factory()->create(['agency_id' => $agency->id]);
        activity()->performedOn($property)->event('updated')->log('relance Diop, Awa');
        activity()->performedOn($property)->event('updated')->log('relance Diop');

        $descriptions = collect($this->apiGet('/api/activity-log?filter[search]=Diop,%20Awa')->assertOk()->json('data'))
            ->pluck('description')->all();

        $this->assertSame(['relance Diop, Awa'], $descriptions);
    }
}
