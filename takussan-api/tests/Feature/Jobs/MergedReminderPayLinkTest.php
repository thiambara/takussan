<?php

namespace Tests\Feature\Jobs;

use App\Domain\Notifications\NotificationCode;
use App\Jobs\SendLeasePaymentReminders;
use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\Customer;
use App\Models\Enums\Currency;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentProvider;
use App\Models\Enums\PaymentStatus;
use App\Models\Integration;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\LeasePaymentLink;
use App\Models\Property;
use App\Models\User;
use App\Notifications\CodedNotification;
use App\Services\Formatting\CurrencyFormatter;
use App\Services\Model\NotificationService;
use App\Services\Notifications\NotificationRenderer;
use App\Services\Notifications\Sms\DeferredSmsGuard;
use App\Services\Payments\LeasePaymentLinkService;
use App\Services\Payments\PaymentGatewayService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Tests\Support\EnvoisParCode;
use Tests\Support\LeaseDueFixture;
use Tests\TestCase;

/**
 * TCK-2706 (voie 2 du porteur, 2026-11-11 : un SMS par échéance payable) — la relance qui fusionne
 * le loyer (500 000) et les charges (150 000) du même jour (TCK-2679) annonce chaque montant à côté
 * du lien qui le règle : un lien par échéance, le loyer d'abord. Ce que le SMS annonce égale, au franc
 * près, ce que ses liens permettent de payer.
 */
class MergedReminderPayLinkTest extends TestCase
{
    use EnvoisParCode, LeaseDueFixture, RefreshDatabase;

    private const ECHEANCE = '2026-11-05';

    private Lease $lease;

    private LeasePayment $loyer;

    private LeasePayment $charges;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        Notification::fake();
        config()->set('app.frontend_url', 'https://front.test');
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    /** Un bail d'agence à 500 000 + 150 000 de charges, dus le même jour, rien payé ; Wave sert l'agence. */
    private function bail(bool $avecCompte = false, float $loyer = 500_000, float $charges = 150_000, ?float $penalite = null, bool $penaliteEnLigne = false, bool $avecCharges = true): void
    {
        $agency = Agency::factory()->create(['currency' => Currency::XOF, 'settings' => ['late_fee_online_collection' => $penaliteEnLigne]]);
        $tenant = Customer::factory()->create([
            'user_id' => $avecCompte ? User::factory()->create(['preferred_language' => 'fr'])->id : null,
            'phone' => '+221771234567',
            'locale' => 'fr',
        ]);
        $this->lease = Lease::factory()->create([
            'agency_id' => $agency->id,
            'property_id' => Property::factory()->create(['agency_id' => $agency->id, 'title' => 'Villa Ngor'])->id,
            'tenant_id' => $tenant->id,
            'status' => LeaseStatus::Active,
            'currency' => Currency::XOF,
        ]);
        $echeances = [LeasePaymentType::Rent->value => $loyer] + ($avecCharges ? [LeasePaymentType::Charges->value => $charges] : []);
        foreach ($echeances as $type => $montant) {
            $penaliteIci = $type === LeasePaymentType::Rent->value ? $penalite : null;
            $due = LeasePayment::factory()->create([
                'lease_id' => $this->lease->id,
                'payer_id' => $tenant->id,
                'payment_type' => $type,
                'amount' => $montant,
                'currency' => Currency::XOF,
                'status' => PaymentStatus::Pending,
                'due_date' => self::ECHEANCE,
                'late_fee_amount' => $penaliteIci,
                'late_fee_applied_at' => $penaliteIci !== null ? self::ECHEANCE.' 09:00:00' : null,
                'late_fee_paid_at' => null,
            ]);
            $type === LeasePaymentType::Rent->value ? $this->loyer = $due : $this->charges = $due;
        }
        Integration::factory()->create([
            'agency_id' => $agency->id,
            'provider' => 'wave',
            'is_active' => true,
            'credentials' => ['api_key' => 'wave_key', 'webhook_secret' => $this->waveSecret],
        ]);
    }

    /** La relance (de retard, par défaut) partie ce jour-là vers le contact sans compte. */
    private function relancer(string $jour, NotificationCode $code = NotificationCode::LeasePaymentOverdue): CodedNotification
    {
        Carbon::setTestNow("{$jour} 08:00:00");
        app()->call([new SendLeasePaymentReminders, 'handle']);

        return self::envoisALaDemande($code)->last()[0];
    }

    private function jeton(string $url): string
    {
        $this->assertMatchesRegularExpression('#^https://front\.test/fr/pay/[A-Za-z0-9_-]{43}$#', $url);

        return substr($url, strrpos($url, '/') + 1);
    }

    /** Ce que le lien permet de payer : le montant que sa page affiche et que `initiate` figera. */
    private function payable(string $url): float
    {
        return (float) $this->getJson('/api/pay/'.$this->jeton($url))->assertOk()->json('data.amount_due');
    }

    private function fcfa(float $montant): string
    {
        return app(CurrencyFormatter::class)->format($montant, Currency::XOF, 'fr');
    }

    /** Les montants que le SMS écrit, relus dans le texte même (et non dans ses paramètres). */
    private function montantsDuSms(string $sms): array
    {
        preg_match_all('/(\d{1,3}(?:[\s\x{202F}\x{00A0}.,]\d{3})+|\d+)\s?F\s?CFA/u', $sms, $m);

        return array_map(fn (string $n): float => (float) preg_replace('/\D/', '', $n), $m[1]);
    }

    /**
     * AC1 — le SMS annonce loyer, charges et total ; chacun de ses deux liens paie exactement son
     * montant, et ensemble ils paient le total annoncé.
     */
    public function test_ac1_ce_que_le_sms_annonce_est_ce_que_ses_liens_permettent_de_payer(): void
    {
        $this->bail();
        $avis = $this->relancer('2026-11-06');
        $sms = app(NotificationRenderer::class)->render($avis->code, $avis->params, 'fr', null, 'sms');

        $loyer = $this->payable($avis->params['payment_url']);
        $charges = $this->payable($avis->params['charges_url']);

        $this->assertSame([500000.0, 150000.0, 650000.0], $this->montantsDuSms($sms), $sms);
        $this->assertSame(500000.0, $loyer, 'le premier lien paie le loyer');
        $this->assertSame(150000.0, $charges, 'le second lien paie les charges');
        $this->assertSame(max($this->montantsDuSms($sms)), $loyer + $charges, 'le total annoncé est ce que les liens paient');
        $this->assertStringContainsString($avis->params['payment_url'], $sms);
        $this->assertStringContainsString($avis->params['charges_url'], $sms);
        $this->assertNotSame($avis->params['payment_url'], $avis->params['charges_url']);
        // Le SMS reporté à la nuit relit ses DEUX liens.
        $this->assertSame('pay_links', $avis->deferredSmsGuard['type'] ?? null);
        $this->assertCount(2, $avis->deferredSmsGuard['token_hashes']);
    }

    /** AC2 — payé par le lien du loyer : le loyer est soldé, et il ne reste que les charges, exactement. */
    public function test_ac2_apres_le_lien_du_loyer_il_ne_reste_que_les_charges(): void
    {
        $this->bail();
        $avis = $this->relancer('2026-11-06');
        $spy = $this->spyDriver();

        $this->postJson('/api/pay/'.$this->jeton($avis->params['payment_url']).'/initiate', ['provider' => 'wave'])->assertOk();
        $this->assertSame(50_000_000, end($spy->calls)['amount_cents'], 'le lien du loyer encaisse 500 000');
        $this->waveWebhook('spy_txn_1', 500_000)->assertOk();

        $this->assertSame(PaymentStatus::Paid, $this->loyer->fresh()->status);
        $this->assertEquals(0, $this->loyer->fresh()->remaining_amount);
        $this->assertEquals(150_000, $this->charges->fresh()->remaining_amount);
        $this->assertSame(150000.0, $this->payable($avis->params['charges_url']));
    }

    /**
     * AC3 — la relance suivante du même groupe porte les MÊMES liens ; et quand le loyer a été payé
     * entre les deux, elle ne parle plus que des charges, avec le même lien des charges.
     */
    public function test_ac3_les_memes_liens_d_une_relance_a_l_autre(): void
    {
        $this->bail();
        $j1 = $this->relancer('2026-11-06');
        $j7 = $this->relancer('2026-11-12');

        $this->assertSame($j1->params['payment_url'], $j7->params['payment_url']);
        $this->assertSame($j1->params['charges_url'], $j7->params['charges_url']);
        $this->assertSame(2, LeasePaymentLink::query()->count(), 'un lien par échéance, jamais un par message');
    }

    public function test_ac3_le_loyer_paye_entre_deux_relances_la_suivante_ne_demande_que_les_charges(): void
    {
        $this->bail();
        $j1 = $this->relancer('2026-11-06');
        $this->loyer->forceFill(['status' => PaymentStatus::Paid, 'paid_at' => now()])->saveQuietly();

        $j7 = $this->relancer('2026-11-12');
        $sms = app(NotificationRenderer::class)->render($j7->code, $j7->params, 'fr', null, 'sms');

        $this->assertSame($j1->params['charges_url'], $j7->params['payment_url'], 'le lien des charges, le même');
        $this->assertArrayNotHasKey('charges_url', $j7->params);
        $this->assertSame([150000.0], $this->montantsDuSms($sms), $sms);
        $this->assertStringContainsString('charges', $sms);
        $this->assertStringNotContainsString('loyer', $sms);
        $this->assertSame(150000.0, $this->payable($j7->params['payment_url']));
    }

    /** AC4 — un locataire avec compte : aucun lien porteur, dans l'envoi comme dans la cloche, aucun émis. */
    public function test_ac4_un_compte_ne_recoit_aucun_lien(): void
    {
        $this->bail(avecCompte: true);
        Carbon::setTestNow('2026-11-06 08:00:00');
        app()->call([new SendLeasePaymentReminders, 'handle']);

        $user = $this->lease->tenant->user;
        Notification::assertSentTo($user, CodedNotification::class, fn (CodedNotification $n): bool => $n->code === NotificationCode::LeasePaymentOverdue
            && ! array_key_exists('payment_url', $n->params) && ! array_key_exists('charges_url', $n->params)
            && ($n->params['charges']['amount'] ?? null) === '150000.00');
        $ligne = AppNotification::query()->where('user_id', $user->id)->where('code', NotificationCode::LeasePaymentOverdue->value)->sole();
        $this->assertStringNotContainsString('/pay/', (string) $ligne->body);
        $this->assertSame(0, LeasePaymentLink::query()->count());
    }

    /** Le SMS reporté à la nuit ne part que si ses deux liens servent encore : l'un retiré, il se tait. */
    public function test_le_sms_reporte_relit_ses_deux_liens(): void
    {
        $this->bail();
        $avis = $this->relancer('2026-11-06');
        $garde = app(DeferredSmsGuard::class);

        $this->assertTrue($garde->stillValid($avis->deferredSmsGuard));
        app(LeasePaymentLinkService::class)->revoke($this->charges);
        $this->assertFalse($garde->stillValid($avis->deferredSmsGuard), 'le lien des charges retiré');
        $this->assertTrue($garde->stillValid(DeferredSmsGuard::forPayLink($avis->params['payment_url'])), 'prémisse : celui du loyer sert encore');
    }

    /** Sans fournisseur : aucun lien, ni pour le loyer ni pour les charges — tous ou aucun. */
    public function test_sans_fournisseur_aucun_lien(): void
    {
        $this->bail();
        Integration::query()->delete();
        $avis = $this->relancer('2026-11-06');

        $this->assertArrayNotHasKey('payment_url', $avis->params);
        $this->assertArrayNotHasKey('charges_url', $avis->params);
        $this->assertNull($avis->deferredSmsGuard);
        $this->assertStringContainsString($this->fcfa(650000), app(NotificationRenderer::class)->render($avis->code, $avis->params, 'fr', null, 'sms'));
    }

    /**
     * Tous ou aucun : si les charges ne se paient pas en ligne, le loyer n'a pas non plus son lien —
     * sinon le SMS annoncerait 650 000 avec un lien qui n'en paie que 500 000.
     */
    public function test_une_echeance_sans_paiement_en_ligne_retire_tous_les_liens(): void
    {
        $this->bail();
        $this->partialMock(PaymentGatewayService::class, function ($mock): void {
            $mock->shouldReceive('availableProviders')->andReturnUsing(
                fn (LeasePayment $due): array => $due->payment_type === LeasePaymentType::Charges ? [] : [PaymentProvider::Wave],
            );
        });

        $avis = $this->relancer('2026-11-06');

        $this->assertArrayNotHasKey('payment_url', $avis->params);
        $this->assertArrayNotHasKey('charges_url', $avis->params);
        $this->assertSame(0, LeasePaymentLink::query()->count());
    }

    /** Le lien des charges est un lien porteur : un envoi à un compte ne le garde jamais (cloche comprise). */
    public function test_le_lien_des_charges_n_atteint_jamais_un_compte(): void
    {
        $user = User::factory()->create(['preferred_language' => 'fr']);
        $argent = NotificationRenderer::money(150000, 'XOF');

        app(NotificationService::class)->send($user, NotificationCode::LeasePaymentOverdue, [
            'amount' => $argent, 'rent' => $argent, 'charges' => $argent, 'days' => 1, 'due_date' => self::ECHEANCE,
            'property' => 'Villa Ngor', 'payment_url' => 'https://front.test/fr/pay/'.str_repeat('A', 43),
            'charges_url' => 'https://front.test/fr/pay/'.str_repeat('B', 43),
        ]);

        $ligne = AppNotification::query()->where('user_id', $user->id)->sole();
        $this->assertArrayNotHasKey('charges_url', $ligne->params);
        $this->assertStringNotContainsString('/pay/', (string) $ligne->body);
        Notification::assertSentTo($user, CodedNotification::class, fn (CodedNotification $n): bool => ! array_key_exists('charges_url', $n->params));
    }

    /**
     * AC1 au franc près — des soldes à demi-franc : chaque montant annoncé est arrondi à l'unité
     * comme son lien l'encaissera, et le total est leur somme. Sommer les soldes bruts annonçait
     * « 500 001 + 150 001 = 650 001 » pour des liens qui encaissent 650 002 (vérification adverse, d1).
     */
    public function test_ac1_au_demi_franc_le_total_annonce_est_ce_que_les_liens_encaissent(): void
    {
        $this->bail(loyer: 500_000.50, charges: 150_000.50);
        $avis = $this->relancer('2026-11-06');
        $sms = app(NotificationRenderer::class)->render($avis->code, $avis->params, 'fr', null, 'sms');

        $loyer = $this->payable($avis->params['payment_url']);
        $charges = $this->payable($avis->params['charges_url']);

        $this->assertSame([500001.0, 150001.0], [$loyer, $charges], 'ce que chaque lien encaisse');
        $this->assertSame([$loyer, $charges, $loyer + $charges], $this->montantsDuSms($sms), $sms);
    }

    /**
     * Le rappel J-3 passe par le même job : deux montants, leur total, et deux liens qui les
     * paient. Sans ce test, retirer le détail de l'appel `due_soon` laissait vert tout fichier qui
     * cite le job (vérification adverse, d2).
     */
    public function test_le_rappel_j_moins_3_fusionne_nomme_ses_montants_et_donne_deux_liens(): void
    {
        $this->bail();
        $avis = $this->relancer('2026-11-02', NotificationCode::LeasePaymentDueSoon);
        $sms = app(NotificationRenderer::class)->render($avis->code, $avis->params, 'fr', null, 'sms');

        $this->assertSame([500000.0, 150000.0, 650000.0], $this->montantsDuSms($sms), $sms);
        $this->assertSame(500000.0, $this->payable($avis->params['payment_url']));
        $this->assertSame(150000.0, $this->payable($avis->params['charges_url']));
    }

    /**
     * TCK-2706 (d3) — une agence qui encaisse la pénalité en ligne : le lien du loyer encaisse
     * 500 000 + 25 000 ; le SMS annonce ces 525 000, pas le seul loyer. Le bailleur lit le solde du
     * loyer, 500 000 (rien ne change pour lui).
     */
    public function test_d3_la_penalite_encaissee_en_ligne_est_annoncee_par_le_sms(): void
    {
        $this->bail(penalite: 25_000, penaliteEnLigne: true, avecCharges: false);
        $avis = $this->relancer('2026-11-06');
        $sms = app(NotificationRenderer::class)->render($avis->code, $avis->params, 'fr', null, 'sms');

        $this->assertSame(525000.0, $this->payable($avis->params['payment_url']), 'prémisse : le lien encaisse la pénalité');
        $this->assertSame([525000.0], $this->montantsDuSms($sms), $sms);

        $landlord = $this->lease->fresh()->landlord;
        $this->assertNotNull($landlord, 'prémisse : le bail a un bailleur');
        $bailleur = Notification::sent($landlord, CodedNotification::class, self::deCode(NotificationCode::LeasePaymentOverdueLandlord))->last();
        $this->assertSame('500000.00', $bailleur?->params['amount']['amount'] ?? null);
    }

    /** d3, fusionnée : le loyer porte sa pénalité, les charges non ; le total est ce que les deux liens encaissent. */
    public function test_d3_fusionnee_chaque_montant_est_ce_que_son_lien_encaisse(): void
    {
        $this->bail(penalite: 25_000, penaliteEnLigne: true);
        $avis = $this->relancer('2026-11-06');
        $sms = app(NotificationRenderer::class)->render($avis->code, $avis->params, 'fr', null, 'sms');

        $loyer = $this->payable($avis->params['payment_url']);
        $charges = $this->payable($avis->params['charges_url']);

        $this->assertSame([525000.0, 150000.0], [$loyer, $charges]);
        $this->assertSame([$loyer, $charges, $loyer + $charges], $this->montantsDuSms($sms), $sms);
    }

    /** d3, réglage éteint : la pénalité se règle à l'agence ; le lien et le SMS disent le seul loyer. */
    public function test_d3_sans_encaissement_en_ligne_la_penalite_n_est_pas_annoncee(): void
    {
        $this->bail(penalite: 25_000, penaliteEnLigne: false, avecCharges: false);
        $avis = $this->relancer('2026-11-06');
        $sms = app(NotificationRenderer::class)->render($avis->code, $avis->params, 'fr', null, 'sms');

        $this->assertSame(500000.0, $this->payable($avis->params['payment_url']));
        $this->assertSame([500000.0], $this->montantsDuSms($sms), $sms);
    }
}
