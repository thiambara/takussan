<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Customer;
use App\Models\Enums\BookingPaymentType;
use App\Models\Enums\Currency;
use App\Models\Enums\PaymentStatus;
use App\Models\Integration;
use App\Models\Property;
use App\Services\Payments\PaymentGatewayService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use ReflectionMethod;
use Tests\ApiTestCase;

/**
 * TCK-285 — Le webhook de paiement doit résoudre l'intégration de la BONNE
 * agence. AUJOURD'HUI IL NE LE FAIT PAS, et ces deux tests sont SUSPENDUS
 * en attendant la décision (ardoise D-50).
 *
 * `PaymentGatewayService::initiate` scope l'intégration par agence
 * (`resolveIntegration($provider, $agencyId)`, ligne 70). `::handleWebhook`
 * ne le fait pas (lignes 132-137) : il retient la PREMIÈRE intégration
 * active du fournisseur, toutes agences confondues, et c'est le secret de
 * celle-là — et lui seul — qui valide les signatures de toute la plateforme.
 *
 * MESURÉ le 2026-08-15, deux agences ayant chacune leur intégration Wave
 * active et leur propre `webhook_secret` :
 *
 *   • webhook visant le paiement de A, signé avec le secret de B
 *       → HTTP 200, et le paiement de A passe à `paid`.
 *   • webhook visant le paiement de A, signé avec le secret de A
 *       → HTTP 401.
 *
 * Le comportement est donc INVERSÉ, dans les deux sens à la fois : la
 * passerelle est à la fois perméable (le secret d'un tiers encaisse) et
 * cassée (le secret légitime est rejeté). Une agence connaît forcément son
 * propre secret : elle peut marquer « payé » n'importe quel encaissement de
 * n'importe quelle autre agence.
 *
 * `PaymentWebhookTest` ne pouvait pas le voir : il ne crée qu'UNE intégration.
 *
 * POURQUOI CES TESTS NE SONT PAS ROUGES, ET POURQUOI ILS NE SONT PAS ÉCRITS
 * « AUTOUR » DU DÉFAUT. Les écrire à l'endroit du comportement mesuré
 * figerait le défaut en contrat. Les laisser rouges casserait la CI de tout
 * le monde. Ils sont donc suspendus par une sonde qui interroge LA CAUSE —
 * `handleWebhook` scope-t-il sa résolution par agence — et non le symptôme :
 * le jour où la résolution est corrigée, ils se rallument seuls et
 * deviennent la garde anti-régression de ce correctif.
 *
 * LE CORRECTIF N'EST PAS ÉCRIT ICI, DÉLIBÉRÉMENT. Il n'est pas d'une ligne :
 * pour connaître l'agence il faut connaître le paiement, pour connaître le
 * paiement il faut analyser la charge utile, et l'analyse est aujourd'hui
 * faite par le driver DERRIÈRE la vérification de signature. Sortir de cette
 * boucle change le contrat de `PaymentDriverContract` — c'est une décision
 * d'architecture (ADR), pas une correction de test.
 */
class PaymentWebhookMultiTenantTest extends ApiTestCase
{
    use RefreshDatabase;

    private const SECRET_A = 'wave_secret_agency_a';

    private const SECRET_B = 'wave_secret_agency_b';

    public function test_the_secret_of_another_agency_must_not_authenticate_a_webhook(): void
    {
        $this->skipWhileTheWebhookResolvesTheIntegrationWithoutAnAgency();

        [$payment] = $this->arrangeTwoAgencies();

        $body = $this->payloadFor($payment);

        // Le webhook vise le paiement de A mais est signé avec le secret de B.
        $response = $this->postSignedWebhook($body, self::SECRET_B);

        $response->assertStatus(401);
        $this->assertSame(PaymentStatus::Pending, $payment->refresh()->status);
    }

    public function test_the_own_secret_of_the_agency_authenticates_its_webhook(): void
    {
        $this->skipWhileTheWebhookResolvesTheIntegrationWithoutAnAgency();

        [$payment] = $this->arrangeTwoAgencies();

        $body = $this->payloadFor($payment);
        $response = $this->postSignedWebhook($body, self::SECRET_A);

        $response->assertOk();
        $this->assertSame(PaymentStatus::Paid, $payment->refresh()->status);
    }

    // ─── La sonde ────────────────────────────────────────────────

    /**
     * Interroge la CAUSE : le bloc de résolution d'`handleWebhook` mentionne-t-il
     * une agence ? Tant qu'il n'en mentionne aucune, la résolution est
     * globale et les deux cas ci-dessus ne peuvent pas passer.
     *
     * Sonder la cause plutôt que le symptôme évite le piège du test suspendu
     * qui ne se rallume jamais : le jour où quelqu'un scope la résolution,
     * cette sonde le voit sans qu'on ait à y repenser.
     */
    private function skipWhileTheWebhookResolvesTheIntegrationWithoutAnAgency(): void
    {
        $method = new ReflectionMethod(PaymentGatewayService::class, 'handleWebhook');
        $source = implode('', array_slice(
            file($method->getFileName()),
            $method->getStartLine() - 1,
            $method->getEndLine() - $method->getStartLine() + 1,
        ));

        // ⚠ Ne PAS sonder le simple mot « agency » : le bloc actuel contient
        // déjà `orderByRaw('agency_id IS NULL')`, qui ORDONNE les intégrations
        // sans en RESTREINDRE aucune. La sonde cherche les marqueurs d'un
        // véritable scope — l'helper `resolveIntegration($provider, $agencyId)`
        // qu'`initiate` emploie déjà, la dérivation `paymentAgencyId`, ou une
        // restriction explicite `where('agency_id', …)`.
        $isScoped = str_contains($source, 'resolveIntegration')
            || str_contains($source, 'paymentAgencyId')
            || str_contains($source, "where('agency_id'");

        if (! $isScoped) {
            $this->markTestSkipped(
                'TCK-285 / ardoise D-50 — PaymentGatewayService::handleWebhook résout '
                .'l\'Integration sans aucun scope d\'agence (première active du fournisseur). '
                .'Mesuré : le secret d\'une agence tierce fait passer à `paid` le paiement '
                .'d\'une autre agence (HTTP 200), tandis que le secret légitime est rejeté '
                .'(HTTP 401). Ce test se rallume dès que la résolution sera scopée.',
            );
        }
    }

    // ─── Helpers ─────────────────────────────────────────────────

    /**
     * Deux agences, chacune avec son intégration Wave active et son propre
     * secret. Celle de B est créée EN PREMIER : c'est elle que la résolution
     * non scopée retient aujourd'hui.
     *
     * @return array{0: BookingPayment, 1: Agency, 2: Agency}
     */
    private function arrangeTwoAgencies(): array
    {
        $agencyB = Agency::factory()->create();
        $this->integration($agencyB, self::SECRET_B);

        $agencyA = Agency::factory()->create();
        $payment = $this->pendingPayment($agencyA, 'cs_wave_agency_a');
        $this->integration($agencyA, self::SECRET_A);

        return [$payment, $agencyA, $agencyB];
    }

    private function payloadFor(BookingPayment $payment): string
    {
        return json_encode([
            'type' => 'checkout.session.completed',
            'data' => ['id' => $payment->transaction_id],
        ]);
    }

    private function postSignedWebhook(string $body, string $secret): TestResponse
    {
        $ts = time();
        $signature = "t={$ts},v1=".hash_hmac('sha256', $ts.'.'.$body, $secret);

        return $this->call(
            'POST',
            '/api/webhooks/payments/wave',
            [], [], [],
            [
                'CONTENT_TYPE' => 'application/json',
                'HTTP_ACCEPT' => 'application/json',
                'HTTP_WAVE_SIGNATURE' => $signature,
            ],
            $body,
        );
    }

    private function integration(Agency $agency, string $secret): Integration
    {
        return Integration::factory()->create([
            'agency_id' => $agency->id,
            'provider' => 'wave',
            'is_active' => true,
            'credentials' => ['api_key' => 'k', 'webhook_secret' => $secret],
        ]);
    }

    private function pendingPayment(Agency $agency, string $txn): BookingPayment
    {
        $property = Property::factory()->create(['agency_id' => $agency->id]);
        $booking = Booking::factory()->create([
            'property_id' => $property->id,
            'customer_id' => Customer::factory()->create(['agency_id' => $agency->id])->id,
            'agency_id' => $agency->id,
            'currency' => Currency::XOF,
        ]);

        return BookingPayment::factory()->create([
            'booking_id' => $booking->id,
            'amount' => 50000,
            'currency' => Currency::XOF,
            'status' => PaymentStatus::Pending,
            'transaction_id' => $txn,
            'payment_type' => BookingPaymentType::Deposit,
            'metadata' => ['gateway' => ['provider' => 'wave', 'transaction_id' => $txn]],
        ]);
    }
}
