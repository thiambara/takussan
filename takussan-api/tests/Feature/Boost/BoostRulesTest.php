<?php

namespace Tests\Feature\Boost;

use App\Exceptions\ApiError;
use App\Models\Agency;
use App\Models\BoostProduct;
use App\Models\CreditMovement;
use App\Models\Enums\BoostBadge;
use App\Models\Enums\BoostKind;
use App\Models\Enums\BoostStatus;
use App\Models\Enums\CreditLotOrigin;
use App\Models\Enums\PropertyVisibility;
use App\Models\Property;
use App\Models\PropertyBoost;
use App\Models\User;
use App\Services\Boost\BoostPurchaseService;
use App\Services\Credits\CreditLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * TCK-633 lot F (ADR-0061 §5, AC14) — les règles d'achat : Remontée (jamais remboursée, une par
 * 24 h), Vedette (pas de cumul : prolonge), Badge (un seul actif, remplace sans remboursement) ;
 * bien public exigé ; solde suffisant exigé, montant manquant rendu.
 */
class BoostRulesTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private Property $property;

    private User $buyer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(Carbon::parse('2026-10-12 10:00:00'));
        $this->agency = Agency::factory()->create();
        $this->property = Property::factory()->published()->create(['agency_id' => $this->agency->id, 'published_at' => now()->subDays(5)]);
        $this->buyer = User::factory()->create();
        app(CreditLedger::class)->grant($this->agency, CreditLotOrigin::Welcome, 500, now()->addDays(180));
    }

    public function test_une_remontee_remet_le_bien_en_tete_et_attend_24_h(): void
    {
        $boost = $this->acheter($this->offre('bump'));

        $this->assertSame(BoostStatus::Ended, $boost->status);
        $this->assertTrue($this->property->fresh()->ranked_at->equalTo(now()));
        $this->assertSame(495, $this->solde());

        $this->travel(23)->hours();
        $erreur = $this->refus(fn () => $this->acheter($this->offre('bump')));
        $this->assertSame('boost.bump_cooldown', $erreur->errorCode);
        $this->assertSame(Carbon::parse('2026-10-13 10:00:00')->toIso8601String(), $erreur->params['available_at']);
        $this->assertSame(495, $this->solde(), 'un refus ne débite rien');

        $this->travel(1)->hours();
        $this->acheter($this->offre('bump'));
        $this->assertSame(490, $this->solde());
    }

    /**
     * Le délai se compte depuis la DERNIÈRE Remontée, pas la première : avec deux Remontées
     * seulement, comparer à la plus ancienne ou à la plus récente rend le même verdict. Vérif.
     * adverse du lot F, V8 : la troisième, 1 h après la deuxième, doit être refusée.
     */
    public function test_le_delai_de_remontee_se_compte_depuis_la_derniere(): void
    {
        $this->acheter($this->offre('bump'));
        $this->travel(25)->hours();
        $this->acheter($this->offre('bump'));
        $this->assertSame(490, $this->solde());

        $this->travel(1)->hours();
        $erreur = $this->refus(fn () => $this->acheter($this->offre('bump')));

        $this->assertSame('boost.bump_cooldown', $erreur->errorCode);
        $this->assertSame(Carbon::parse('2026-10-14 11:00:00')->toIso8601String(), $erreur->params['available_at']);
        $this->assertSame(490, $this->solde());
    }

    /**
     * Une Vedette échue que le tick n'a pas encore close reste `active` : la racheter repart de
     * MAINTENANT, jamais de l'ancienne fin déjà passée — sinon le temps écoulé depuis l'échéance
     * est payé et non servi. Vérif. adverse du lot F, V9.
     */
    public function test_racheter_une_vedette_echue_non_close_repart_de_maintenant(): void
    {
        $vedette = $this->acheter($this->offre('featured', 7));
        $this->travel(7)->days();
        $this->travel(4)->hours();
        $this->assertSame(BoostStatus::Active, $vedette->fresh()->status, 'prémisse : le tick n’est pas passé');

        $rachat = $this->acheter($this->offre('featured', 7));

        $this->assertSame($vedette->id, $rachat->id);
        $this->assertTrue($rachat->fresh()->ends_at->equalTo(Carbon::parse('2026-10-26 14:00:00')), (string) $rachat->fresh()->ends_at);
        $this->assertTrue($this->property->fresh()->sponsored_until->equalTo(Carbon::parse('2026-10-26 14:00:00')));
    }

    public function test_une_vedette_se_prolonge_au_lieu_de_se_cumuler(): void
    {
        $premiere = $this->acheter($this->offre('featured', 7));
        $this->assertTrue((bool) $this->property->fresh()->featured);
        $this->assertTrue($this->property->fresh()->sponsored_until->equalTo(now()->addDays(7)));

        $this->travel(2)->days();
        $seconde = $this->acheter($this->offre('featured', 15));

        $this->assertSame($premiere->id, $seconde->id, 'une seule Vedette par bien');
        $this->assertSame(1, PropertyBoost::query()->where('property_id', $this->property->id)->where('kind', BoostKind::Featured)->count());
        $this->assertTrue($seconde->fresh()->ends_at->equalTo(Carbon::parse('2026-10-12 10:00:00')->addDays(22)));
        $this->assertSame(55, $seconde->fresh()->price_credits);
        $this->assertSame(22, $seconde->fresh()->duration_days);
        $this->assertSame(445, $this->solde());
        $this->assertSame(2, CreditMovement::query()->where('property_boost_id', $premiere->id)->count());
    }

    public function test_un_badge_remplace_le_precedent_sans_remboursement(): void
    {
        $urgent = $this->acheter($this->offre('badge', 7, 'urgent'));
        $baisse = $this->acheter($this->offre('badge', 7, 'price_drop'));

        $this->assertSame(BoostStatus::Ended, $urgent->fresh()->status);
        $this->assertSame(BoostStatus::Active, $baisse->fresh()->status);
        $this->assertSame(BoostBadge::PriceDrop, $this->property->fresh()->badge);
        $this->assertSame(480, $this->solde(), 'deux badges payés, aucun remboursé');
    }

    public function test_un_bien_non_public_ne_se_booste_pas(): void
    {
        $this->property->update(['visibility' => PropertyVisibility::Private]);

        $erreur = $this->refus(fn () => $this->acheter($this->offre('featured', 7)));

        $this->assertSame('boost.property_not_public', $erreur->errorCode);
        $this->assertSame(500, $this->solde());
        $this->assertSame(0, PropertyBoost::query()->count());
    }

    public function test_un_solde_insuffisant_rend_le_montant_manquant(): void
    {
        $pauvre = Agency::factory()->create();
        app(CreditLedger::class)->grant($pauvre, CreditLotOrigin::Welcome, 12, now()->addDays(30));
        $bien = Property::factory()->published()->create(['agency_id' => $pauvre->id]);

        $erreur = $this->refus(fn () => app(BoostPurchaseService::class)->purchase($bien, $this->offre('featured', 7), $this->buyer));

        $this->assertSame(422, $erreur->getStatusCode());
        $this->assertSame('credits.insufficient', $erreur->errorCode);
        $this->assertSame(['missing' => 8, 'balance' => 12], $erreur->params);
        $this->assertSame(0, PropertyBoost::query()->where('property_id', $bien->id)->count(), 'la transaction a tout annulé');
    }

    public function test_une_offre_inactive_ne_s_achete_pas(): void
    {
        $offre = $this->offre('featured', 30);
        $offre->update(['is_active' => false]);

        $this->assertSame('boost.product_inactive', $this->refus(fn () => $this->acheter($offre))->errorCode);
    }

    public function test_le_prix_est_fige_a_l_achat(): void
    {
        $offre = $this->offre('featured', 7);
        $boost = $this->acheter($offre);
        $offre->update(['price_credits' => 99]);

        $this->assertSame(20, $boost->fresh()->price_credits);
    }

    private function offre(string $kind, int $days = 0, ?string $variant = null): BoostProduct
    {
        return BoostProduct::query()->where('kind', $kind)->where('duration_days', $days)
            ->where('variant', $variant)->sole();
    }

    private function acheter(BoostProduct $offre): PropertyBoost
    {
        return app(BoostPurchaseService::class)->purchase($this->property->fresh(), $offre, $this->buyer);
    }

    private function refus(callable $appel): ApiError
    {
        try {
            $appel();
        } catch (ApiError $e) {
            return $e;
        }
        $this->fail('aucun refus');
    }

    private function solde(): int
    {
        return app(CreditLedger::class)->balance($this->agency);
    }
}
