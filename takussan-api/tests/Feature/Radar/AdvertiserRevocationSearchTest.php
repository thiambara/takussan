<?php

namespace Tests\Feature\Radar;

use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\Support\FixturesDePublicationRadar;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-2391 (ADR-0077 §8, AC1) — la révocation retire les biens de l'INDEX de recherche dans la même requête, pas au prochain
 * réindexage. Contre un vrai Meilisearch, comme les autres épreuves de la recherche publique.
 */
class AdvertiserRevocationSearchTest extends TestCase
{
    use FixturesDePublicationRadar;
    use InteractsWithMeilisearch;
    use OperateursPlateforme;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->installerLaPublication();
    }

    /** @return list<int> les biens que la recherche publique rend */
    private function trouves(): array
    {
        $ids = array_map('intval', array_column($this->getJson('/api/public/properties/search')->assertOk()->json('data'), 'id'));
        sort($ids);

        return $ids;
    }

    public function test_ac1_apres_la_revocation_la_recherche_ne_rend_plus_les_biens(): void
    {
        $annonce = $this->annonceConsentie();
        $reponse = $this->postJson("/api/admin/radar/advertisers/{$this->annonceur->id}/publish", ['listing_ids' => [$annonce->id]])->assertCreated();
        $bien = Property::query()->findOrFail($reponse->json('data.properties.0.id'));
        $this->waitForMeilisearch();
        $this->assertSame([$bien->id], $this->trouves());

        // La purge part en file après le commit : ici on éprouve l'index, pas elle.
        Queue::fake();
        $this->postJson("/api/admin/radar/advertisers/{$this->annonceur->id}/revoke", ['reason' => 'Demande de l\'annonceur'])->assertOk();
        $this->waitForMeilisearch();

        $this->assertSame([], $this->trouves());
    }
}
