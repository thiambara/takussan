<?php

namespace Tests\Feature\Api;

use App\Domain\Notifications\NotificationCode;
use App\Jobs\GenerateLeasePaymentSchedule;
use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Customer;
use App\Models\Enums\BookingKind;
use App\Models\Enums\BookingPaymentType;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\ContractType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Enums\RentPeriod;
use App\Models\Lease;
use App\Models\Property;
use App\Models\Task;
use App\Models\User;
use App\Services\Lease\LeaseSignatureService;
use App\Services\Pdf\DocumentPdfService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2734 (seconde porte, décision du porteur du 2026-11-12, option a ; décision 7 du même soir,
 * option b, contre la recommandation) — quand le bail PART, les AUTRES candidatures ouvertes du bien
 * (`pending`, `confirmed`) se ferment, acceptée comprise : elles passent `rejected`, et leurs auteurs
 * reçoivent « Candidature non retenue », une fois, après le commit. Le bail part à l'ENVOI EN
 * SIGNATURE (`POST /api/leases/{id}/signature-request`) ou à la signature sur PAPIER d'un brouillon
 * (`POST /api/leases/{id}/activate`) ; la création du brouillon ne ferme plus rien, et un brouillon
 * abandonné non plus.
 *
 * Les candidatures du LOCATAIRE du bail sont celles du bail : `completed`, sans avis, au même
 * moment, qu'elles soient nommées par `booking_id` ou non (cas 42 de la démo). Offres d'achat,
 * séjours et renouvellements ne sont pas touchés.
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
        Bus::fake([GenerateLeasePaymentSchedule::class]);
        $this->mock(DocumentPdfService::class, function ($mock) {
            $mock->shouldReceive('render')->andReturnUsing(fn (string $template, array $data) => view($template, $data)->render());
        });
        $this->agence = Agency::factory()->create();
        $this->agent = $this->agencyAgent($this->agence);
        $this->location = Property::factory()->published()->create([
            'agency_id' => $this->agence->id,
            // TCK-2803 — le bailleur d'un bien d'agence y détient un profil propriétaire : sans lui, il
            // n'est pas le bailleur du bail (`BailleurDuBien`) et ne signe pas sur papier pour lui.
            'user_id' => User::factory()->withOwnerProfile($this->agence)->create()->id,
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

    /** Le brouillon, créé par l'agent. */
    private function creerLeBrouillon(Customer $locataire, ?Booking $depuis = null): Lease
    {
        $id = $this->actingAsApi($this->agent)->postJson('/api/leases', $this->corpsDuBail($locataire, $depuis))->assertCreated()->json('data.id');

        return Lease::query()->findOrFail($id);
    }

    private function envoyerEnSignature(Lease $bail): TestResponse
    {
        return $this->actingAsApi($this->agent)->postJson("/api/leases/{$bail->id}/signature-request");
    }

    /** Le brouillon, puis son envoi en signature : le moment où le bail part. */
    private function bailEnvoye(Customer $locataire, ?Booking $depuis = null): Lease
    {
        $bail = $this->creerLeBrouillon($locataire, $depuis);
        $this->envoyerEnSignature($bail)->assertOk()->assertJsonPath('data.status', 'pending_signature');

        return $bail;
    }

    private function avisNonRetenue(Booking $booking): int
    {
        return AppNotification::query()
            ->where('user_id', $booking->customer->user_id)
            ->where('code', NotificationCode::BookingApplicationNotSelected->value)
            ->count();
    }

    /**
     * Décision 7 — la création du brouillon ne ferme rien : ni les autres candidatures, ni celle du
     * futur locataire. Un brouillon abandonné laisse donc le bien comme il l'a trouvé.
     */
    public function test_le_brouillon_ne_ferme_rien(): void
    {
        $acceptee = $this->demande(BookingKind::Application, BookingStatus::Confirmed);
        $retenue = $this->demande(BookingKind::Application, BookingStatus::Pending);
        $autre = $this->demande(BookingKind::Application, BookingStatus::Pending);

        $this->creerLeBrouillon($retenue->customer, $retenue);

        $this->assertSame(BookingStatus::Confirmed, $acceptee->refresh()->status);
        $this->assertSame(BookingStatus::Pending, $retenue->refresh()->status);
        $this->assertSame(BookingStatus::Pending, $autre->refresh()->status);
        $this->assertSame(0, AppNotification::query()->where('code', NotificationCode::BookingApplicationNotSelected->value)->count());
    }

    /**
     * Le cœur de la décision : l'envoi en signature d'un bail tiré d'une candidature en attente ferme
     * l'acceptée et l'autre en attente, chacune notifiée une fois ; la candidature du bail passe
     * `completed`, sans avis ; et le bien n'est plus retenu — une candidature déposée ensuite n'est plus
     * refusée pour une autre acceptée.
     */
    public function test_l_envoi_en_signature_ferme_les_autres_candidatures(): void
    {
        $acceptee = $this->demande(BookingKind::Application, BookingStatus::Confirmed);
        $retenue = $this->demande(BookingKind::Application, BookingStatus::Pending);
        $autre = $this->demande(BookingKind::Application, BookingStatus::Pending);

        $this->bailEnvoye($retenue->customer, $retenue);

        $this->assertSame(BookingStatus::Completed, $retenue->refresh()->status);
        $this->assertSame(0, $this->avisNonRetenue($retenue));
        foreach ([$acceptee, $autre] as $close) {
            $this->assertSame(BookingStatus::Rejected, $close->refresh()->status);
            $this->assertNotNull($close->cancelled_at);
            $this->assertSame(1, $this->avisNonRetenue($close), 'notifiée une seule fois');
        }
    }

    /**
     * Le cas 42 de la démo : bail pour le client de la candidature acceptée, SANS `booking_id`. Sa
     * candidature est celle du bail (`completed`, sans avis) : lui dire « non retenue » serait faux.
     */
    public function test_la_candidature_du_locataire_sans_booking_id_est_celle_du_bail(): void
    {
        $acceptee = $this->demande(BookingKind::Application, BookingStatus::Confirmed);
        $autre = $this->demande(BookingKind::Application, BookingStatus::Pending);

        $this->bailEnvoye($acceptee->customer);

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

        $this->bailEnvoye($this->client());

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

        $this->bailEnvoye($this->client());

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
     * deux se ferment, et il ne lit « non retenue » qu'une fois. L'avis se déduplique, PAS la clôture :
     * l'acompte encaissé sur la SECONDE ouvre bien sa tâche de remboursement.
     */
    public function test_deux_candidatures_d_un_meme_client_un_seul_avis(): void
    {
        $client = $this->client();
        $premiere = $this->demande(BookingKind::Application, BookingStatus::Pending, $client);
        $seconde = $this->demande(BookingKind::Application, BookingStatus::Confirmed, $client);
        BookingPayment::factory()->create(['booking_id' => $seconde->id, 'status' => PaymentStatus::Paid, 'payment_type' => BookingPaymentType::Deposit, 'amount' => 50_000]);
        $autre = $this->demande(BookingKind::Application, BookingStatus::Pending);

        $this->bailEnvoye($this->client());

        foreach ([$premiere, $seconde, $autre] as $close) {
            $this->assertSame(BookingStatus::Rejected, $close->refresh()->status);
        }
        $this->assertSame(1, $this->avisNonRetenue($premiere), 'un avis pour le client, pas un par candidature');
        $this->assertSame(1, $this->avisNonRetenue($autre));
        $this->assertSame(1, Task::query()
            ->where('taskable_type', $seconde->getMorphClass())
            ->where('taskable_id', $seconde->id)
            ->where('metadata->kind', 'booking_refund')
            ->count(), 'la seconde candidature du même client est close comme un refus');
    }

    /**
     * Un second envoi (le bail est `pending_signature`) ne renotifie pas une candidature déjà close ;
     * une candidature déposée ENTRE les deux envois se ferme au second.
     */
    public function test_un_second_envoi_ne_renotifie_pas(): void
    {
        $autre = $this->demande(BookingKind::Application, BookingStatus::Pending);
        $bail = $this->bailEnvoye($this->client());
        $tardive = $this->demande(BookingKind::Application, BookingStatus::Pending);

        $this->envoyerEnSignature($bail)->assertOk();

        $this->assertSame(1, $this->avisNonRetenue($autre));
        $this->assertSame(BookingStatus::Rejected, $tardive->refresh()->status);
        $this->assertSame(1, $this->avisNonRetenue($tardive));
    }

    /** Un envoi refusé (locataire sans compte, 422) ne ferme rien : la clôture est dans sa transaction. */
    public function test_un_envoi_refuse_ne_ferme_rien(): void
    {
        $autre = $this->demande(BookingKind::Application, BookingStatus::Confirmed);
        $bail = $this->creerLeBrouillon(Customer::factory()->create(['agency_id' => $this->agence->id]));

        $this->envoyerEnSignature($bail)->assertStatus(422)->assertJsonPath('code', 'lease_signature.tenant_without_account');

        $this->assertSame(BookingStatus::Confirmed, $autre->refresh()->status);
        $this->assertSame(0, $this->avisNonRetenue($autre));
    }

    /**
     * La voie papier (`POST /leases/{id}/activate`) accepte un brouillon qui n'est jamais parti en
     * signature : elle ferme au même moment logique, le bail part.
     */
    public function test_la_signature_papier_d_un_brouillon_ferme_aussi(): void
    {
        $acceptee = $this->demande(BookingKind::Application, BookingStatus::Confirmed);
        $retenue = $this->demande(BookingKind::Application, BookingStatus::Pending);
        $bail = $this->creerLeBrouillon($retenue->customer, $retenue);

        $actif = app(LeaseSignatureService::class)->signOnPaper(
            $bail,
            UploadedFile::fake()->create('bail-signe.pdf', 20, 'application/pdf'),
            User::query()->findOrFail($this->location->user_id),
        );

        $this->assertSame(LeaseStatus::Active, $actif->status);
        $this->assertSame(BookingStatus::Completed, $retenue->refresh()->status);
        $this->assertSame(BookingStatus::Rejected, $acceptee->refresh()->status);
        $this->assertSame(1, $this->avisNonRetenue($acceptee));
    }

    /** Un renouvellement garde le même locataire : son envoi en signature ne ferme rien. */
    public function test_l_envoi_d_un_renouvellement_ne_ferme_rien(): void
    {
        $locataire = $this->client();
        $parent = Lease::factory()->create([
            'property_id' => $this->location->id, 'landlord_id' => $this->location->user_id,
            'tenant_id' => $locataire->id, 'agency_id' => $this->agence->id, 'status' => LeaseStatus::Active,
        ]);
        $enfant = Lease::factory()->create([
            'property_id' => $this->location->id, 'landlord_id' => $this->location->user_id,
            'tenant_id' => $locataire->id, 'agency_id' => $this->agence->id, 'status' => LeaseStatus::Draft,
            'renewed_from_lease_id' => $parent->id,
        ]);
        $autre = $this->demande(BookingKind::Application, BookingStatus::Pending);

        $this->envoyerEnSignature($enfant)->assertOk();

        $this->assertSame(BookingStatus::Pending, $autre->refresh()->status);
        $this->assertSame(0, $this->avisNonRetenue($autre));
    }

    /** L'avis part APRÈS le commit : dans une transaction englobante, rien n'est écrit avant. */
    public function test_l_avis_part_apres_le_commit(): void
    {
        $autre = $this->demande(BookingKind::Application, BookingStatus::Pending);
        $bail = $this->creerLeBrouillon($this->client());

        DB::transaction(function () use ($autre, $bail): void {
            app(LeaseSignatureService::class)->request($bail, $this->agent);
            $this->assertSame(BookingStatus::Rejected, $autre->refresh()->status, 'fermée dans la transaction de l’envoi');
            $this->assertSame(0, $this->avisNonRetenue($autre), 'aucun avis avant le commit');
        });

        $this->assertSame(1, $this->avisNonRetenue($autre));
    }

    /**
     * Rejoué après un retour arrière (un interblocage que l'appelant relance, par exemple), l'envoi
     * n'émet l'avis qu'une fois : le rappel de la transaction annulée part avec elle.
     */
    public function test_rejoue_apres_un_retour_arriere_l_avis_ne_part_qu_une_fois(): void
    {
        $autre = $this->demande(BookingKind::Application, BookingStatus::Confirmed);
        $bail = $this->creerLeBrouillon($this->client());
        $envoyer = fn () => app(LeaseSignatureService::class)->request($bail, $this->agent);

        try {
            DB::transaction(function () use ($envoyer): void {
                $envoyer();
                throw new \RuntimeException('retour arrière');
            });
        } catch (\RuntimeException) {
        }
        $this->assertSame(BookingStatus::Confirmed, $autre->refresh()->status, 'rien n’est resté du premier essai');
        $this->assertSame(0, $this->avisNonRetenue($autre));

        DB::transaction(fn () => $envoyer());

        $this->assertSame(BookingStatus::Rejected, $autre->refresh()->status);
        $this->assertSame(1, $this->avisNonRetenue($autre));
    }

    /**
     * L'ordre global des verrous (`takussan-api/CLAUDE.md`, piège n° 10) à l'envoi : le bien d'abord,
     * puis le bail, puis les candidatures en une passe triée — celui de `BookingService::confirm()`
     * (bien → réservation) et de `PropertyOwnerTransfer` (bien → baux).
     */
    public function test_l_envoi_verrouille_le_bien_puis_le_bail_puis_les_candidatures(): void
    {
        $this->demande(BookingKind::Application, BookingStatus::Confirmed);
        $this->demande(BookingKind::Application, BookingStatus::Pending);
        $bail = $this->creerLeBrouillon($this->client());

        $verrous = [];
        DB::listen(function ($q) use (&$verrous): void {
            if (preg_match('/from "(properties|leases|bookings)" where (.*) for update/', $q->sql, $m) === 1) {
                $verrous[] = [$m[1], $m[2]];
            }
        });
        $agence = $this->toucherDeLAgence();
        $this->envoyerEnSignature($bail)->assertOk();

        $this->assertSame(['properties', 'leases', 'bookings'], array_slice(array_column($verrous, 0), 0, 3));
        $this->assertStringEndsWith('order by "id" asc', $verrous[2][1]);
        $this->assertLAgenceApresLeBien($agence());
    }

    /**
     * TCK-2734 (réserve r2 de la vérification de d87e423e7) — ce que l'envoi fait à la ligne de l'AGENCE,
     * dans l'ordre : son `for update`, l'`update` du compteur (`LeaseObserver`) et toute insertion qui pose
     * un `agency_id` (le journal porte une clé étrangère : `KEY SHARE` sur l'agence). Les `for update` du bien
     * sont notés aussi, pour l'ordre. C'est ce que l'épingle des seuls `select … for update` ne voyait pas
     * (piège n° 10, « L'épingle ne voit pas tout »).
     *
     * @return \Closure(): list<string>
     */
    private function toucherDeLAgence(): \Closure
    {
        $vus = [];
        DB::listen(function ($q) use (&$vus): void {
            if (preg_match('/from "properties" where .* for update/', $q->sql) === 1) {
                $vus[] = 'bien';
            } elseif (preg_match('/^(update "agencies"|insert into "\w+" \(.*"agency_id")|from "agencies" where .* for (update|share|no key update)/', $q->sql) === 1) {
                $vus[] = 'agence';
            }
        });

        return function () use (&$vus): array {
            return $vus;
        };
    }

    /** @param  list<string>  $vus */
    private function assertLAgenceApresLeBien(array $vus): void
    {
        $this->assertContains('agence', $vus, 'la sonde voit bien l\'agence (journal, compteur)');
        $this->assertSame('bien', $vus[0], 'rien ne touche l\'agence avant le verrou du bien : l\'achat de boost prend le bien, puis l\'agence');
    }

    /** Même ordre pour la voie papier. */
    public function test_la_voie_papier_verrouille_le_bien_avant_le_bail(): void
    {
        $this->demande(BookingKind::Application, BookingStatus::Pending);
        $bail = $this->creerLeBrouillon($this->client());

        $verrous = [];
        DB::listen(function ($q) use (&$verrous): void {
            if (preg_match('/from "(properties|leases|bookings)" where .* for update/', $q->sql, $m) === 1) {
                $verrous[] = $m[1];
            }
        });
        $agence = $this->toucherDeLAgence();
        app(LeaseSignatureService::class)->signOnPaper($bail, UploadedFile::fake()->create('b.pdf', 20, 'application/pdf'), User::query()->findOrFail($this->location->user_id));

        $this->assertSame(['properties', 'leases', 'bookings'], array_slice($verrous, 0, 3));
        $this->assertLAgenceApresLeBien($agence());
    }
}
