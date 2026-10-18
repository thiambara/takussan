<?php

namespace Tests\Feature\Boost;

use App\Models\Agency;
use App\Models\BoostProduct;
use App\Models\Enums\CreditLotOrigin;
use App\Models\Property;
use App\Models\PropertyBoost;
use App\Models\User;
use App\Services\Boost\BoostLifecycle;
use App\Services\Credits\CreditLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * TCK-825 (P24.03) — une ligne du journal des crédits rattachée à un boost dit son objet : le bien et
 * l'offre, pour la dépense comme pour le remboursement.
 */
class CreditMovementObjectTest extends ApiTestCase
{
    use RefreshDatabase;

    public function test_la_depense_et_le_remboursement_d_un_boost_disent_le_bien_et_l_offre(): void
    {
        $agency = Agency::factory()->create();
        $property = Property::factory()->published()->create(['agency_id' => $agency->id, 'title' => 'Villa à Ngor']);
        app(CreditLedger::class)->grant($agency, CreditLotOrigin::Welcome, 100, now()->addDays(30));
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $badge = BoostProduct::query()->where('kind', 'badge')->where('variant', 'urgent')->orderBy('duration_days')->firstOrFail();
        $this->apiPost("/api/properties/{$property->id}/boosts", ['product_id' => $badge->id])->assertCreated();
        app(BoostLifecycle::class)->cancel(PropertyBoost::query()->sole(), true, User::factory()->create(), 'Erreur de saisie');

        $movements = collect($this->apiGet('/api/credits')->assertOk()->json('movements'))->keyBy('type');

        foreach (['spend', 'refund'] as $type) {
            $this->assertSame('badge', $movements[$type]['boost']['kind'] ?? null, $type);
            $this->assertSame('urgent', $movements[$type]['boost']['variant'] ?? null, $type);
            $this->assertSame($property->id, $movements[$type]['boost']['property']['id'] ?? null, $type);
            $this->assertSame('Villa à Ngor', $movements[$type]['boost']['property']['title'] ?? null, $type);
        }
        $this->assertNull($movements['grant']['boost']);
    }
}
