<?php

namespace Tests\Feature\Boost;

use App\Models\Agency;
use App\Models\BoostProduct;
use App\Models\Enums\CreditLotOrigin;
use App\Models\Property;
use App\Models\PropertyBoost;
use App\Services\Credits\CreditLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\ApiTestCase;

/**
 * TCK-823 (P24.04) — « bien public » et « offre active » se jugent SOUS le verrou, sur la ligne
 * verrouillée : un bien dépublié, ou une offre retirée, entre le contrôle et le verrou ne passe pas.
 */
class BoostPurchaseUnderLockTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private Property $property;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create();
        $this->property = Property::factory()->published()->create(['agency_id' => $this->agency->id]);
        app(CreditLedger::class)->grant($this->agency, CreditLotOrigin::Welcome, 500, now()->addDays(60));
        $this->apiActingAsRole('agency_admin', ['agency' => $this->agency]);
    }

    /**
     * Écrit `$change` une fois, juste avant le premier verrou de l'achat — celui du bien depuis TCK-2734 (r2) :
     * entre le contrôle et le verrou.
     */
    private function avantLeVerrou(callable $change): void
    {
        $fait = false;
        DB::beforeExecuting(function (string $sql) use (&$fait, $change): void {
            if (! $fait && str_contains($sql, 'from "properties"') && str_contains($sql, 'for update')) {
                $fait = true;
                $change();
            }
        });
    }

    private function vedette(): BoostProduct
    {
        return BoostProduct::query()->where('kind', 'featured')->where('duration_days', 7)->sole();
    }

    public function test_un_bien_loue_entre_le_controle_et_le_verrou_est_refuse_sans_debit(): void
    {
        $this->avantLeVerrou(fn () => DB::table('properties')->where('id', $this->property->id)->update(['status' => 'rented']));

        $this->apiPost("/api/properties/{$this->property->id}/boosts", ['product_id' => $this->vedette()->id])
            ->assertStatus(422)
            ->assertJsonPath('code', 'boost.property_not_public');

        $this->assertSame(500, app(CreditLedger::class)->balance($this->agency->id));
        $this->assertSame(0, PropertyBoost::query()->count());
    }

    public function test_une_offre_retiree_entre_le_controle_et_le_verrou_est_refusee_sans_debit(): void
    {
        $offre = $this->vedette();
        $this->avantLeVerrou(fn () => DB::table('boost_products')->where('id', $offre->id)->update(['is_active' => false]));

        $this->apiPost("/api/properties/{$this->property->id}/boosts", ['product_id' => $offre->id])
            ->assertStatus(422)
            ->assertJsonPath('code', 'boost.product_inactive');

        $this->assertSame(500, app(CreditLedger::class)->balance($this->agency->id));
        $this->assertSame(0, PropertyBoost::query()->count());
    }

    /**
     * TCK-2734 (réserve r2 de la vérification de d87e423e7) — l'achat verrouille le BIEN avant l'agence, dans
     * l'ordre global (`takussan-api/CLAUDE.md`, piège n° 10) : l'envoi d'un bail en signature tient le bien
     * puis touche l'agence (journal à clé étrangère, compteur des baux) ; l'ordre inverse formait un cycle
     * avec lui sur un même bien — mesuré à deux processus par verif-patrimoine le 2026-11-13 : 53 achats
     * tués sur 120 sous l'ordre inverse, 0 sur 2164 itérations dans celui-ci. Ce test séquentiel n'épingle
     * que l'ordre : aucun verrou ni écriture sur l'agence ne précède celui du bien.
     */
    public function test_l_achat_verrouille_le_bien_avant_l_agence(): void
    {
        $vus = [];
        DB::listen(function ($q) use (&$vus): void {
            if (preg_match('/from "(properties|agencies)" where .* for update/', $q->sql, $m) === 1) {
                $vus[] = $m[1];
            } elseif (preg_match('/^(update "agencies"|insert into "\w+" \(.*"agency_id")/', $q->sql) === 1) {
                $vus[] = 'agencies';
            }
        });

        $this->apiPost("/api/properties/{$this->property->id}/boosts", ['product_id' => $this->vedette()->id])
            ->assertCreated();

        $this->assertContains('agencies', $vus);
        $this->assertSame('properties', $vus[0] ?? null, 'le premier verrou de l\'achat est celui du bien');
    }

    public function test_sans_changement_l_achat_passe(): void
    {
        $this->avantLeVerrou(fn () => null);

        $this->apiPost("/api/properties/{$this->property->id}/boosts", ['product_id' => $this->vedette()->id])
            ->assertCreated();
    }
}
