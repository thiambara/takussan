<?php

namespace Tests\Feature\Api;

use App\Domain\Notifications\NotificationCode;
use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Customer;
use App\Models\Enums\BookingKind;
use App\Models\Enums\BookingPaymentType;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\ContractType;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Enums\RentPeriod;
use App\Models\Property;
use App\Models\Task;
use App\Models\User;
use App\Services\Model\LeaseService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2734 (seconde porte, décision du porteur du 2026-11-12, option a) — à la création d'un bail,
 * les AUTRES candidatures ouvertes du bien (`pending`, `confirmed`) se ferment, acceptée comprise :
 * elles passent `rejected`, et leurs auteurs reçoivent « Candidature non retenue », une fois, après
 * le commit. Sans cela, une candidature acceptée qu'un bail tiré d'une AUTRE (ou sans `booking_id`)
 * laissait `confirmed` retenait le bien : toute confirmation suivante rendait 409.
 *
 * Les candidatures du LOCATAIRE du bail sont celles du bail : `completed`, sans avis, qu'elles soient
 * nommées par `booking_id` ou non (cas 42 de la démo : bail créé pour le client de la candidature
 * acceptée, sans `booking_id`). Offres d'achat et séjours ne sont pas touchés.
 */
class BailFermeLesAutresCandidaturesTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agence;

    private User $agent;

    private Property $location;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->agence = Agency::factory()->create();
        $this->agent = $this->agencyAgent($this->agence);
        $this->location = Property::factory()->published()->create([
            'agency_id' => $this->agence->id,
            'visibility' => PropertyVisibility::Public,
            'contract_type' => ContractType::Rent,
            'rent_period' => RentPeriod::Monthly,
            'price' => 250_000,
        ]);
    }

    private function client(): Customer
    {
        return Customer::factory()->create(['agency_id' => $this->agence->id, 'user_id' => User::factory()->create()->id]);
    }

    private function demande(BookingKind $nature, BookingStatus $statut, ?Customer $client = null, ?Property $bien = null): Booking
    {
        return Booking::factory()->create([
            'property_id' => ($bien ?? $this->location)->id,
            'agency_id' => $this->agence->id,
            'customer_id' => ($client ?? $this->client())->id,
            'kind' => $nature,
            'status' => $statut,
            'confirmed_at' => $statut === BookingStatus::Confirmed ? now() : null,
            'start_date' => now()->addDays(5)->toDateString(),
            'end_date' => now()->addDays(365)->toDateString(),
        ]);
    }

    /** @return array<string, mixed> */
    private function corpsDuBail(Customer $locataire, ?Booking $depuis = null): array
    {
        return array_filter([
            'property_id' => $this->location->id,
            'tenant_id' => $locataire->id,
            'booking_id' => $depuis?->id,
            'type' => 'residential_rent',
            'start_date' => now()->addDays(5)->toDateString(),
            'end_date' => now()->addYear()->toDateString(),
            'monthly_rent' => 250000,
            'deposit_amount' => 0,
        ], static fn ($v) => $v !== null);
    }

    private function creerLeBail(Customer $locataire, ?Booking $depuis = null): TestResponse
    {
        return $this->actingAsApi($this->agent)->postJson('/api/leases', $this->corpsDuBail($locataire, $depuis))->assertCreated();
    }

    private function avisNonRetenue(Booking $booking): int
    {
        return AppNotification::query()
            ->where('user_id', $booking->customer->user_id)
            ->where('code', NotificationCode::BookingApplicationNotSelected->value)
            ->count();
    }

    /**
     * Le cœur de la décision : un bail tiré d'une candidature en attente ferme l'acceptée et l'autre en
     * attente, chacune notifiée une fois ; la candidature du bail passe `completed`, sans avis ; et le
     * bien n'est plus retenu — une candidature déposée ensuite se confirme (plus de 409).
     */
    public function test_le_bail_ferme_les_autres_candidatures_et_libere_le_bien(): void
    {
        $acceptee = $this->demande(BookingKind::Application, BookingStatus::Confirmed);
        $retenue = $this->demande(BookingKind::Application, BookingStatus::Pending);
        $autre = $this->demande(BookingKind::Application, BookingStatus::Pending);

        $this->creerLeBail($retenue->customer, $retenue);

        $this->assertSame(BookingStatus::Completed, $retenue->refresh()->status);
        $this->assertSame(0, $this->avisNonRetenue($retenue));
        foreach ([$acceptee, $autre] as $close) {
            $this->assertSame(BookingStatus::Rejected, $close->refresh()->status);
            $this->assertNotNull($close->cancelled_at);
            $this->assertSame(1, $this->avisNonRetenue($close), 'notifiée une seule fois');
        }

        $suivante = $this->demande(BookingKind::Application, BookingStatus::Pending);
        $this->actingAsApi($this->agent)->postJson("/api/bookings/{$suivante->id}/confirm")
            ->assertOk()->assertJsonPath('data.status', 'confirmed');
    }

    /**
     * Le cas 42 de la démo : bail créé pour le client de la candidature acceptée, SANS `booking_id`.
     * Sa candidature est celle du bail (`completed`, sans avis) : lui dire « non retenue » serait faux.
     */
    public function test_la_candidature_du_locataire_sans_booking_id_est_celle_du_bail(): void
    {
        $acceptee = $this->demande(BookingKind::Application, BookingStatus::Confirmed);
        $autre = $this->demande(BookingKind::Application, BookingStatus::Pending);

        $this->creerLeBail($acceptee->customer);

        $this->assertSame(BookingStatus::Completed, $acceptee->refresh()->status);
        $this->assertSame(0, $this->avisNonRetenue($acceptee));
        $this->assertSame(BookingStatus::Rejected, $autre->refresh()->status);
        $this->assertSame(1, $this->avisNonRetenue($autre));
    }

    /** Offres, séjours, demandes déjà closes et candidatures d'un autre bien ne sont pas touchés. */
    public function test_les_autres_natures_et_les_autres_biens_ne_bougent_pas(): void
    {
        $offre = $this->demande(BookingKind::Offer, BookingStatus::Pending);
        $sejour = $this->demande(BookingKind::Stay, BookingStatus::Confirmed);
        $annulee = $this->demande(BookingKind::Application, BookingStatus::Cancelled);
        $ailleurs = $this->demande(BookingKind::Application, BookingStatus::Confirmed, bien: Property::factory()->create(['agency_id' => $this->agence->id]));

        $this->creerLeBail($this->client());

        $this->assertSame(BookingStatus::Pending, $offre->refresh()->status);
        $this->assertSame(BookingStatus::Confirmed, $sejour->refresh()->status);
        $this->assertSame(BookingStatus::Cancelled, $annulee->refresh()->status);
        $this->assertSame(BookingStatus::Confirmed, $ailleurs->refresh()->status);
        $this->assertSame(0, AppNotification::query()->where('code', NotificationCode::BookingApplicationNotSelected->value)->count());
    }

    /**
     * Comme un refus : la candidature close voit ses paiements en attente annulés (aucun checkout
     * ouvert ne la soldera), et un acompte encaissé ouvre la tâche de remboursement (`BookingClosed`).
     */
    public function test_la_candidature_close_suit_le_chemin_d_un_refus_pour_ses_paiements(): void
    {
        $autre = $this->demande(BookingKind::Application, BookingStatus::Confirmed);
        $encaisse = BookingPayment::factory()->create(['booking_id' => $autre->id, 'status' => PaymentStatus::Paid, 'payment_type' => BookingPaymentType::Deposit, 'amount' => 50_000]);
        $enAttente = BookingPayment::factory()->create(['booking_id' => $autre->id, 'status' => PaymentStatus::Pending, 'payment_type' => BookingPaymentType::Advance, 'amount' => 50_000]);

        $this->creerLeBail($this->client());

        $this->assertSame(PaymentStatus::Paid, $encaisse->refresh()->status);
        $this->assertSame(PaymentStatus::Cancelled, $enAttente->refresh()->status);
        $this->assertSame(1, Task::query()
            ->where('taskable_type', $autre->getMorphClass())
            ->where('taskable_id', $autre->id)
            ->where('metadata->kind', 'booking_refund')
            ->count());
    }

    /**
     * Vérification adverse de TCK-2734-b — un client qui a deux candidatures ouvertes sur le bien : les
     * deux se ferment, et il ne lit « non retenue » qu'une fois. Un autre client garde son avis. L'avis
     * se déduplique, PAS la clôture : l'acompte encaissé sur la SECONDE ouvre bien sa tâche de
     * remboursement (`BookingClosed` pour chaque candidature).
     */
    public function test_deux_candidatures_d_un_meme_client_un_seul_avis(): void
    {
        $client = $this->client();
        $premiere = $this->demande(BookingKind::Application, BookingStatus::Pending, $client);
        $seconde = $this->demande(BookingKind::Application, BookingStatus::Confirmed, $client);
        BookingPayment::factory()->create(['booking_id' => $seconde->id, 'status' => PaymentStatus::Paid, 'payment_type' => BookingPaymentType::Deposit, 'amount' => 50_000]);
        $autre = $this->demande(BookingKind::Application, BookingStatus::Pending);

        $this->creerLeBail($this->client());

        foreach ([$premiere, $seconde, $autre] as $close) {
            $this->assertSame(BookingStatus::Rejected, $close->refresh()->status);
        }
        $this->assertSame(1, $this->avisNonRetenue($premiere), 'un avis pour le client, pas un par candidature');
        $this->assertSame(1, $this->avisNonRetenue($autre));
        $this->assertSame(1, Task::query()
            ->where('taskable_type', $seconde->getMorphClass())
            ->where('taskable_id', $seconde->id)
            ->where('metadata->kind', 'booking_refund')
            ->count(), 'la seconde candidature du même client est close comme un refus : son acompte encaissé est à rembourser');
    }

    /** Un second bail sur le bien ne renotifie pas une candidature déjà close. */
    public function test_un_second_bail_ne_renotifie_pas(): void
    {
        $autre = $this->demande(BookingKind::Application, BookingStatus::Pending);

        $this->creerLeBail($this->client());
        $this->creerLeBail($this->client());

        $this->assertSame(1, $this->avisNonRetenue($autre));
    }

    /** L'avis part APRÈS le commit : dans une transaction englobante, rien n'est écrit avant. */
    public function test_l_avis_part_apres_le_commit(): void
    {
        $autre = $this->demande(BookingKind::Application, BookingStatus::Pending);
        $locataire = $this->client();

        DB::transaction(function () use ($autre, $locataire): void {
            app(LeaseService::class)->create($this->location, $this->agent, $this->corpsDuBail($locataire));
            $this->assertSame(BookingStatus::Rejected, $autre->refresh()->status, 'fermée dans la transaction du bail');
            $this->assertSame(0, $this->avisNonRetenue($autre), 'aucun avis avant le commit');
        });

        $this->assertSame(1, $this->avisNonRetenue($autre));
    }

    /**
     * Rejouée après un retour arrière (un interblocage que l'appelant relance, par exemple), la création
     * n'envoie l'avis qu'une fois : le rappel de la transaction annulée part avec elle.
     */
    public function test_rejouee_apres_un_retour_arriere_l_avis_ne_part_qu_une_fois(): void
    {
        $autre = $this->demande(BookingKind::Application, BookingStatus::Confirmed);
        $locataire = $this->client();
        $creer = fn () => app(LeaseService::class)->create($this->location, $this->agent, $this->corpsDuBail($locataire));

        try {
            DB::transaction(function () use ($creer): void {
                $creer();
                throw new \RuntimeException('retour arrière');
            });
        } catch (\RuntimeException) {
        }
        $this->assertSame(BookingStatus::Confirmed, $autre->refresh()->status, 'rien n’est resté du premier essai');
        $this->assertSame(0, $this->avisNonRetenue($autre));

        DB::transaction(fn () => $creer());

        $this->assertSame(BookingStatus::Rejected, $autre->refresh()->status);
        $this->assertSame(1, $this->avisNonRetenue($autre));
    }

    /**
     * L'ordre global des verrous (`takussan-api/CLAUDE.md`, piège n° 10) : le bien d'abord, puis les
     * réservations, par identifiant croissant — celui de `BookingService::confirm()` (bien → réservation).
     */
    public function test_le_bien_est_verrouille_avant_les_candidatures(): void
    {
        $this->demande(BookingKind::Application, BookingStatus::Confirmed);
        $this->demande(BookingKind::Application, BookingStatus::Pending);
        $locataire = $this->client();

        $verrous = [];
        DB::listen(function ($q) use (&$verrous): void {
            if (preg_match('/from "(properties|bookings)" where (.*) for update/', $q->sql, $m) === 1) {
                $verrous[] = [$m[1], $m[2]];
            }
        });
        $this->creerLeBail($locataire);

        $this->assertSame('properties', $verrous[0][0] ?? null, 'le bien d’abord');
        // Puis les candidatures, en UNE passe triée ; les verrous ligne à ligne qui suivent
        // (`terminerLaReservation`) reprennent une ligne déjà tenue, ce qui ne coûte rien.
        $this->assertSame('bookings', $verrous[1][0] ?? null, 'puis les candidatures');
        $this->assertStringEndsWith('order by "id" asc', $verrous[1][1]);
    }
}
