<?php

namespace Tests\Feature\Search;

use App\Models\Agency;
use App\Models\Property;
use App\Services\Boost\BoostLifecycle;
use App\Services\Geo\GeoReindexation;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

/**
 * TCK-1452 (P90.02) — une écriture explicite dans l'index (`BoostLifecycle::writeProperty`,
 * `Property::reindexer()`, `GeoReindexation::biens()`) attend le commit, comme l'observateur de
 * Scout sous `SCOUT_AFTER_COMMIT=true`. Sous `SCOUT_QUEUE=false`, elle écrivait dans Meilisearch
 * sur-le-champ : une transaction annulée ensuite laissait l'index dire ce que la base ne disait pas.
 */
class IndexApresCommitTest extends TestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    /** Créé sans passer par l'observateur de Scout (`SCOUT_AFTER_COMMIT=false` en test) : absent de l'index. */
    private function bienPublic(): Property
    {
        $agence = Agency::factory()->create();

        return Property::withoutSyncingToSearch(fn () => Property::factory()->published()->create([
            'agency_id' => $agence->id,
            'published_at' => now()->subHour(),
        ]));
    }

    /** @return array<string, mixed>|null */
    private function document(Property $bien): ?array
    {
        $this->waitForMeilisearch();
        $hits = Property::search('')->raw()['hits'] ?? [];

        return collect($hits)->first(fn (array $hit) => (int) $hit['id'] === (int) $bien->id);
    }

    private function annuler(callable $ecriture): void
    {
        try {
            DB::transaction(function () use ($ecriture): void {
                $ecriture();
                throw new RuntimeException('annulation');
            });
        } catch (RuntimeException $e) {
            $this->assertSame('annulation', $e->getMessage());
        }
    }

    public function test_write_property_annule_avec_sa_transaction_laisse_l_index_inchange(): void
    {
        $bien = $this->bienPublic();
        $this->indexProperties();
        $this->assertFalse((bool) $this->document($bien)['featured'], 'témoin : indexé non vedette');

        $this->annuler(fn () => app(BoostLifecycle::class)->writeProperty($bien, ['featured' => true]));

        $this->assertFalse((bool) $bien->fresh()->featured);
        $this->assertFalse((bool) $this->document($bien)['featured'], 'l\'index suit la base annulée');
    }

    public function test_write_property_valide_ecrit_l_index_apres_le_commit(): void
    {
        $bien = $this->bienPublic();
        $this->indexProperties();

        DB::transaction(fn () => app(BoostLifecycle::class)->writeProperty($bien, ['featured' => true]));

        $this->assertTrue((bool) $this->document($bien)['featured']);
    }

    public function test_reindexer_annule_avec_sa_transaction_n_ecrit_rien(): void
    {
        $bien = $this->bienPublic();
        $this->waitForMeilisearch();
        $this->assertNull($this->document($bien), 'témoin : pas encore indexé');

        $this->annuler(fn () => $bien->reindexer());

        $this->assertNull($this->document($bien));
    }

    public function test_reindexer_hors_transaction_ecrit_sur_le_champ(): void
    {
        $bien = $this->bienPublic();

        $bien->reindexer();

        $this->assertNotNull($this->document($bien));
    }

    public function test_geo_reindexation_annulee_avec_sa_transaction_n_ecrit_rien(): void
    {
        $bien = $this->bienPublic();
        $this->waitForMeilisearch();

        $this->annuler(fn () => app(GeoReindexation::class)->biens([$bien->id]));

        $this->assertNull($this->document($bien));
    }

    public function test_geo_reindexation_validee_ecrit_apres_le_commit(): void
    {
        $bien = $this->bienPublic();

        DB::transaction(fn () => app(GeoReindexation::class)->biens([$bien->id]));

        $this->assertNotNull($this->document($bien));
    }
}
