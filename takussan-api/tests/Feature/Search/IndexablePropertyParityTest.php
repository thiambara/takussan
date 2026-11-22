<?php

namespace Tests\Feature\Search;

use App\Models\Agency;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * TCK-2457 — `Property::scopeIndexable()` est la traduction en requête de `shouldBeSearchable()` : la sonde Santé
 * `search` compte l'un, l'index suit l'autre. Sur CHAQUE combinaison de statut, visibilité, suppression, `is_test`,
 * `published_at` et statut d'agence, les deux rendent le même verdict — une condition ajoutée d'un seul côté rougit.
 */
class IndexablePropertyParityTest extends TestCase
{
    use RefreshDatabase;

    public function test_le_scope_et_should_be_searchable_rendent_le_meme_verdict_sur_chaque_combinaison(): void
    {
        $agences = [null];
        foreach (AgencyStatus::cases() as $statut) {
            $agences[] = Agency::factory()->create(['status' => $statut])->id;
        }
        $modele = Property::factory()->createQuietly()->getAttributes();
        unset($modele['id']);

        $lignes = [];
        $n = 0;
        foreach (PropertyStatus::cases() as $statut) {
            foreach (PropertyVisibility::cases() as $visibilite) {
                foreach ([false, true] as $supprime) {
                    foreach ([false, true] as $test) {
                        foreach ([null, now()] as $publie) {
                            foreach ($agences as $agence) {
                                $n++;
                                $lignes[] = [
                                    ...$modele,
                                    'slug' => 'parite-'.$n.'-'.Str::random(6),
                                    'reference_number' => 'TK-PARITE-'.$n,
                                    'status' => $statut->value,
                                    'visibility' => $visibilite->value,
                                    'deleted_at' => $supprime ? now() : null,
                                    'is_test' => $test,
                                    'published_at' => $publie,
                                    'agency_id' => $agence,
                                ];
                            }
                        }
                    }
                }
            }
        }
        foreach (array_chunk($lignes, 200) as $paquet) {
            DB::table('properties')->insert($paquet);
        }

        $biens = Property::withTrashed()->with('agency')->where('reference_number', 'like', 'TK-PARITE-%')->get();
        $this->assertCount(count($lignes), $biens);

        $attendus = $biens->filter(fn (Property $p) => $p->shouldBeSearchable())->pluck('id')->sort()->values()->all();
        $scope = Property::withTrashed()->indexable()->where('reference_number', 'like', 'TK-PARITE-%')
            ->pluck('id')->sort()->values()->all();

        $this->assertNotEmpty($attendus, 'au moins une combinaison indexable, sinon la comparaison ne dit rien');
        $this->assertLessThan(count($lignes), count($attendus), 'au moins une combinaison exclue');
        $this->assertSame($attendus, $scope, 'scopeIndexable() et shouldBeSearchable() divergent');

        // La forme exacte de la sonde : la portée globale des suppressions ne change rien au compte.
        $this->assertSame(
            count($attendus),
            Property::query()->indexable()->where('reference_number', 'like', 'TK-PARITE-%')->count(),
        );
    }
}
