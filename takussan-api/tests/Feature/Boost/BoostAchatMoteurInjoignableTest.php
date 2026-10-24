<?php

namespace Tests\Feature\Boost;

use App\Models\Agency;
use App\Models\BoostProduct;
use App\Models\Enums\BoostStatus;
use App\Models\Enums\CreditLotOrigin;
use App\Models\Property;
use App\Models\PropertyBoost;
use App\Services\Credits\CreditLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Exceptions;
use Laravel\Scout\EngineManager;
use Meilisearch\Client;
use Meilisearch\Exceptions\CommunicationException;
use Tests\ApiTestCase;

/**
 * TCK-1454 (P90.04) — Meilisearch injoignable : l'achat d'un boost est écrit (boost, débit,
 * bien mis en avant) et répond 201. L'écriture d'index se joue après le commit (TCK-1452), et son
 * échec est rapporté (`report()`), sans annuler ni refuser la dépense. Avant, `writeProperty()`
 * appelait le moteur sous les verrous de l'agence et du bien, et son exception annulait l'achat.
 *
 * Ce que ce test NE garde pas : que l'index rattrape le bien ensuite. Le document reste périmé
 * jusqu'à la prochaine écriture du bien ou un réimport.
 */
class BoostAchatMoteurInjoignableTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private Property $property;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create();
        $this->property = Property::factory()->published()->create(['agency_id' => $this->agency->id]);
        app(CreditLedger::class)->grant($this->agency, CreditLotOrigin::Welcome, 100, now()->addDays(30));
    }

    /** Synchronisation rallumée (sinon `writeProperty()` ne touche pas l'index), moteur sur un port fermé. */
    private function moteurInjoignable(): void
    {
        Property::enableSearchSyncing();
        config(['scout.meilisearch.host' => 'http://127.0.0.1:9']);
        $this->app->forgetInstance(Client::class);
        $this->app->forgetInstance(EngineManager::class);
    }

    public function test_l_achat_est_ecrit_et_repond_201_quand_l_index_echoue(): void
    {
        Exceptions::fake();
        $this->apiActingAsRole('agency_admin', ['agency' => $this->agency]);
        $offre = BoostProduct::query()->where('kind', 'featured')->where('duration_days', 15)->sole();
        $this->moteurInjoignable();

        $this->apiPost("/api/properties/{$this->property->id}/boosts", ['product_id' => $offre->id])
            ->assertCreated()
            ->assertJsonPath('data.status', 'active')
            ->assertJsonPath('balance', 65);

        $this->assertSame(1, PropertyBoost::query()->where('property_id', $this->property->id)->where('status', BoostStatus::Active)->count());
        $this->assertSame(65, app(CreditLedger::class)->balance($this->agency));
        $this->assertTrue((bool) $this->property->fresh()->featured);
        Exceptions::assertReported(CommunicationException::class);
    }
}
