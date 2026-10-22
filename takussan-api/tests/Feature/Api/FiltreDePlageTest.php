<?php

namespace Tests\Feature\Api;

use App\Models\Concerns\HasQueryBuilder;
use App\Models\PropertyVisit;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;
use Symfony\Component\Finder\Finder;
use Tests\TestCase;

/**
 * TCK-1409 (P151.02) — `RangeFilter` juge la valeur selon le cast de la colonne : un montant ou
 * une surface par la règle `numeric`, une date par la règle `date` (422 sinon, plus un 500 de
 * PostgreSQL) ; une borne haute en date seule sur un horodatage couvre tout le jour.
 */
class FiltreDePlageTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<class-string<Model>, list<string>> */
    private function plagesDeclarees(): array
    {
        $plages = [];
        foreach (Finder::create()->files()->in(app_path('Models'))->name('*.php') as $file) {
            $class = 'App\\Models\\'.str_replace(['/', '.php'], ['\\', ''], $file->getRelativePathname());
            if (! class_exists($class) || (new \ReflectionClass($class))->isAbstract()
                || ! in_array(HasQueryBuilder::class, class_uses_recursive($class), true)) {
                continue;
            }
            $champs = (new \ReflectionClass($class))->getStaticPropertyValue('requestRangeFilters', []);
            if (! empty($champs)) {
                $plages[$class] = $champs;
            }
        }

        return $plages;
    }

    public function test_chaque_plage_declaree_refuse_une_valeur_illisible_en_422(): void
    {
        $plages = $this->plagesDeclarees();
        $this->assertArrayHasKey(PropertyVisit::class, $plages);

        foreach ($plages as $modele => $champs) {
            foreach ($champs as $champ) {
                foreach (['min', 'max'] as $sens) {
                    $request = Request::create('/', 'GET', ['filter' => ["{$champ}_{$sens}" => 'abc']]);
                    try {
                        $modele::buildQuery(request: $request)->get();
                        $this->fail("{$modele} : filter[{$champ}_{$sens}]=abc n'est pas refusé");
                    } catch (ValidationException) {
                        // attendu : 422
                    }
                }
            }
        }
    }

    public function test_une_plage_lisible_filtre_toujours(): void
    {
        $request = Request::create('/', 'GET', ['filter' => ['scheduled_at_min' => '2026-10-01T00:00:00Z']]);

        $this->assertCount(0, PropertyVisit::buildQuery(request: $request)->get());
    }

    public function test_une_borne_haute_en_date_seule_couvre_tout_le_jour_d_un_horodatage(): void
    {
        $visite = PropertyVisit::factory()->create(['scheduled_at' => Carbon::parse('2026-10-22 12:00:00')]);

        $request = Request::create('/', 'GET', ['filter' => [
            'scheduled_at_min' => '2026-10-22',
            'scheduled_at_max' => '2026-10-22',
        ]]);

        $this->assertSame([$visite->id], PropertyVisit::buildQuery(request: $request)->pluck('id')->all());
    }
}
