<?php

namespace Tests\Feature\Events;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Customer;
use App\Models\Enums\BookingPaymentType;
use App\Models\Enums\Currency;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Integration;
use App\Models\Lease;
use App\Models\Property;
use App\Models\TenantOnboardingChecklist;
use App\Models\User;
use App\Notifications\RegistrationConfirmationNotification;
use App\Services\Model\LeaseService;
use App\Services\Tenant\TenantOnboardingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use LemonSqueezy\Laravel\Events\OrderCreated;
use Tests\TestCase;

/**
 * TCK-443 — L'effet observable d'un écouteur se produit EXACTEMENT une fois.
 *
 * ⚠ « exactement une fois », et non « pas deux fois » : un écouteur enregistré
 * ZÉRO fois satisfait « pas deux fois ». Chaque assertion ci-dessous fixe donc
 * le compte 1, jamais une borne supérieure.
 */
class ListenerSideEffectsRunOnceTest extends TestCase
{
    use RefreshDatabase;

    /**
     * AC3 (1/2) — une inscription n'envoie QU'UN courriel de vérification.
     *
     * Le doublon venait ici d'un second mécanisme, distinct de la découverte
     * automatique : `SendEmailVerificationNotification` vit dans
     * `Illuminate\Auth\Listeners\`, hors de `app/Listeners`, donc la découverte
     * ne le voit pas. C'est `EventServiceProvider::configureEmailVerification()`
     * qui le ré-enregistre en `booted()` dès que `$listen[Registered::class]`
     * est absent — ce qui est le cas. Une correction qui n'aurait traité que la
     * découverte aurait laissé celui-ci debout.
     */
    public function test_registration_sends_exactly_one_verification_email(): void
    {
        Notification::fake();

        $this->postJson('/api/auth/register', [
            'first_name' => 'Amine',
            'last_name' => 'Thiam',
            'email' => 'amine.verification@example.com',
            'password' => 'password123',
            'password_confirmation' => 'password123',
        ])->assertStatus(201);

        $user = User::query()->where('email', 'amine.verification@example.com')->sole();

        Notification::assertSentToTimes($user, RegistrationConfirmationNotification::class, 1);
    }

    /**
     * AC3 (2/2) — une activation de bail ne crée QU'UNE liste d'onboarding.
     *
     * ⚠ Le compte de LIGNES ne peut pas rougir, et ce n'est pas une faiblesse
     * du test : `TenantOnboardingService::create()` est idempotent
     * (`firstOrCreate` sur `lease_id`), donc le second passage de l'écouteur
     * doublé rendait la ligne existante. Le ticket annonçait « deux listes
     * d'onboarding par bail activé » — c'est faux, et c'est mesuré ici.
     *
     * Ce qui doublait réellement est l'INVOCATION, et c'est elle que la
     * première assertion compte. La seconde fixe l'invariant visible par
     * l'utilisateur, qui doit rester vrai des deux côtés du correctif.
     */
    public function test_lease_activation_creates_exactly_one_onboarding_checklist(): void
    {
        Notification::fake();

        $tenantUser = User::factory()->create();
        $tenant = Customer::factory()->create(['user_id' => $tenantUser->id]);
        $lease = Lease::factory()->create([
            'tenant_id' => $tenant->id,
            'agency_id' => Agency::factory()->create()->id,
            'status' => LeaseStatus::Draft,
        ]);

        $calls = 0;
        $this->app->extend(
            TenantOnboardingService::class,
            function (TenantOnboardingService $service) use (&$calls): TenantOnboardingService {
                return new class($service, $calls) extends TenantOnboardingService
                {
                    public function __construct(private readonly TenantOnboardingService $inner, private int &$calls) {}

                    public function create(Lease $lease): ?TenantOnboardingChecklist
                    {
                        $this->calls++;

                        return $this->inner->create($lease);
                    }
                };
            },
        );

        app(LeaseService::class)->activate($lease->fresh());

        $this->assertSame(1, $calls, 'la création de la checklist doit être tentée exactement une fois');
        $this->assertSame(
            1,
            TenantOnboardingChecklist::query()->where('lease_id', $lease->id)->count(),
        );
    }

    /**
     * AC6 — non-régression du chemin de paiement : un `order_created` reçu UNE
     * fois produit exactement UNE entrée `metadata.gateway_events`, et le
     * statut du paiement est inchangé.
     *
     * Avant le correctif, l'écouteur tournait deux fois et le second passage
     * sortait par le `continue` d'`isAlreadyProcessed()` — donc ce test était
     * DÉJÀ vert. C'est voulu : il épingle ce que le retrait des doublons ne
     * doit pas casser, pas le doublon lui-même.
     */
    public function test_order_created_records_exactly_one_gateway_event(): void
    {
        $agency = Agency::factory()->create();
        Integration::factory()->create([
            'agency_id' => $agency->id,
            'provider' => 'lemon_squeezy',
            'is_active' => true,
            'credentials' => [
                'api_key' => 'ls_key',
                'signing_secret' => 'ls_secret',
                'store_id' => 'store_1',
                'variant_id' => 'variant_1',
            ],
        ]);

        $property = Property::factory()->create(['agency_id' => $agency->id]);
        $booking = Booking::factory()->create([
            'property_id' => $property->id,
            'customer_id' => Customer::factory()->create()->id,
            'agency_id' => $agency->id,
            'currency' => Currency::USD,
        ]);
        $payment = BookingPayment::factory()->create([
            'booking_id' => $booking->id,
            'amount' => 19_99,
            'currency' => Currency::USD,
            'status' => PaymentStatus::Pending,
            'transaction_id' => 'order_ls_once',
            'payment_type' => BookingPaymentType::Deposit,
            'metadata' => ['gateway' => ['provider' => 'lemon_squeezy', 'transaction_id' => 'order_ls_once']],
        ]);

        OrderCreated::dispatch($agency, null, [
            'meta' => ['event_name' => 'order_created'],
            'data' => [
                'id' => 'order_ls_once',
                'attributes' => [
                    'total' => 1999,
                    'tax' => 100,
                    'currency' => 'USD',
                    'status' => 'paid',
                    'first_order_item' => [
                        'custom_data' => [
                            'payment_id' => (string) $payment->id,
                            'payment_type' => BookingPayment::class,
                        ],
                    ],
                ],
            ],
        ]);

        $payment->refresh();

        $this->assertSame(PaymentStatus::Paid, $payment->status);
        $this->assertCount(1, (array) data_get($payment->metadata, 'gateway_events', []));
    }
}
