<?php

namespace Tests\Feature\Boost;

use App\Models\Agency;
use App\Models\BoostProduct;
use App\Models\Enums\CreditLotOrigin;
use App\Models\Property;
use App\Models\User;
use App\Services\Boost\BoostPurchaseService;
use App\Services\Credits\CreditLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** TCK-633 lot F — chaque écriture de la console des crédits exige un second facteur RÉCENT. */
class AdminCreditsStepUpTest extends TestCase
{
    use RefreshDatabase;

    public function test_sans_step_up_aucune_ecriture_ne_passe(): void
    {
        $agency = Agency::factory()->create();
        app(CreditLedger::class)->grant($agency, CreditLotOrigin::Welcome, 100, now()->addDays(30));
        $property = Property::factory()->published()->create(['agency_id' => $agency->id]);
        $vedette = BoostProduct::query()->where('kind', 'featured')->where('duration_days', 7)->sole();

        $stale = User::factory()->create(['two_factor_enabled' => true, 'two_factor_secret' => 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP']);
        $this->materializeRoleProfile($stale, 'super_admin');
        $boost = app(BoostPurchaseService::class)->purchase($property, $vedette, $stale);
        $this->actingAs($stale);

        $ecritures = [
            ["/api/admin/boosts/{$boost->id}/cancel", 'post', ['refund' => false, 'reason' => 'Contenu trompeur']],
            ["/api/admin/credit-wallets/{$agency->id}/adjustments", 'post', ['amount' => 10, 'reason' => 'Geste commercial']],
            ["/api/admin/properties/{$property->id}/offered-boost", 'post', ['product_id' => $vedette->id, 'reason' => 'Lancement']],
            ['/api/admin/boost-products', 'post', ['kind' => 'featured', 'duration_days' => 45, 'price_credits' => 80]],
            ["/api/admin/boost-products/{$vedette->id}", 'patch', ['price_credits' => 25]],
        ];
        foreach ($ecritures as [$url, $verbe, $corps]) {
            $this->json($verbe, $url, $corps)->assertForbidden()->assertJsonPath('code', 'two_factor_step_up_required');
        }

        $this->assertSame(80, app(CreditLedger::class)->balance($agency), 'seul l’achat préalable a débité');
        $this->assertSame(20, $vedette->fresh()->price_credits);
        $this->assertSame('active', $boost->fresh()->status->value);
    }
}
