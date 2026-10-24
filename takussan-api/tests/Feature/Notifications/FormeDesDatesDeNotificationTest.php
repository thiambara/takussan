<?php

namespace Tests\Feature\Notifications;

use App\Domain\Notifications\NotificationCode;
use App\Events\Accounting\BankStatementFinalized;
use App\Events\Booking\BookingClosed;
use App\Events\Booking\BookingRequested;
use App\Events\Maintenance\MaintenanceScheduleChanged;
use App\Events\Maintenance\MaintenanceStatusChanged;
use App\Events\Permissions\RoleDelegationActivated;
use App\Jobs\SendLeasePaymentReminders;
use App\Jobs\SendPropertyVisitReminders;
use App\Listeners\Accounting\NotifyStatementFinalized;
use App\Listeners\Booking\NotifyOnBookingCancelled;
use App\Listeners\Booking\NotifyOnBookingRequested;
use App\Listeners\Maintenance\NotifyMaintenanceParticipants;
use App\Listeners\Permissions\NotifyDelegationActivated;
use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\BankStatement;
use App\Models\Customer;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\KycDossierStatus;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\VisitStatus;
use App\Models\KycDossier;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\MaintenanceRequest;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\PropertyCalendarFeed;
use App\Models\PropertyVisit;
use App\Models\RoleDelegation;
use App\Models\User;
use App\Services\Booking\PropertyCalendarSyncService;
use App\Services\Kyc\KycExpiryService;
use App\Services\Model\BookingService;
use App\Services\Visit\VisitNotifier;
use App\Support\Http\DnsResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Tests\Concerns\BuildsBookingStakeholders;
use Tests\Support\SessionsDImpersonation;
use Tests\TestCase;

/**
 * TCK-1328 (P128.06) — la forme que chaque émetteur RÉEL range pour un paramètre daté : `Y-m-d`
 * pour `date`, un instant ISO 8601 à décalage pour `datetime`.
 *
 * Le front devine la nature d'un paramètre à sa forme (`texteNotification.ts`), l'API la lit dans
 * `NotificationCode::params()` : un émetteur qui rangerait un instant pour une `date` serait rendu
 * en date par l'une et en date et heure par l'autre, sans rouge. Le dernier cas tient la liste :
 * un code daté neuf, sans émetteur éprouvé ici, fait rougir.
 */
class FormeDesDatesDeNotificationTest extends TestCase
{
    use BuildsBookingStakeholders, RefreshDatabase, SessionsDImpersonation;

    private const DATE = '/^\d{4}-\d{2}-\d{2}$/';

    private const INSTANT = '/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/';

    /** Les codes datés que ce fichier envoie par leur émetteur réel. */
    private const EPROUVES = [
        NotificationCode::LeasePaymentDueSoon,
        NotificationCode::LeasePaymentOverdue,
        NotificationCode::BookingCreated,
        NotificationCode::BookingConfirmed,
        NotificationCode::BookingRejected,
        NotificationCode::BookingCancelled,
        NotificationCode::VisitReminder,
        NotificationCode::VisitRescheduledByVisitor,
        NotificationCode::VisitCancelledByVisitor,
        NotificationCode::VisitRequested,
        NotificationCode::VisitConfirmed,
        NotificationCode::VisitRescheduled,
        NotificationCode::VisitCancelled,
        NotificationCode::KycExpiringSoon,
        NotificationCode::RoleDelegationActivated,
        NotificationCode::BankStatementFinalized,
        NotificationCode::MaintenanceStepAcknowledgedScheduled,
        NotificationCode::MaintenanceStepAssignedScheduled,
        NotificationCode::MaintenanceStepInProgressScheduled,
        NotificationCode::MaintenanceScheduleChanged,
        NotificationCode::PropertyCalendarConflict,
        NotificationCode::ImpersonationEnded,
    ];

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo(Carbon::parse('2026-10-20 10:00:00', 'UTC'));
        $this->buildStakeholders();
    }

    public function test_les_echeances_de_loyer(): void
    {
        $lease = Lease::factory()->active()->create([
            'tenant_id' => Customer::factory()->create(['user_id' => User::factory()->create()->id])->id,
        ]);
        foreach ([now()->addDays(3), now()->subDay()] as $due) {
            LeasePayment::factory()->create([
                'lease_id' => $lease->id,
                'due_date' => $due->toDateString(),
                'status' => PaymentStatus::Pending,
                'paid_at' => null,
            ]);
        }

        app()->call([new SendLeasePaymentReminders, 'handle']);

        $this->assertFormes(NotificationCode::LeasePaymentDueSoon);
        $this->assertFormes(NotificationCode::LeasePaymentOverdue);
    }

    public function test_la_reservation_demandee_confirmee_et_refusee(): void
    {
        $dates = ['start_date' => now()->addDays(10)->toDateString(), 'end_date' => now()->addDays(13)->toDateString()];
        $demandee = $this->bookingOfClient(['status' => BookingStatus::Pending] + $dates);
        $refusee = $this->bookingOfClient(['status' => BookingStatus::Pending, 'start_date' => now()->addDays(20)->toDateString(), 'end_date' => now()->addDays(22)->toDateString()]);

        app(NotifyOnBookingRequested::class)->handle(new BookingRequested($demandee, $this->client->id));
        app(BookingService::class)->confirm($demandee);
        app(BookingService::class)->reject($refusee, 'complet', $this->agent);

        $this->assertFormes(NotificationCode::BookingCreated);
        $this->assertFormes(NotificationCode::BookingConfirmed);
        $this->assertFormes(NotificationCode::BookingRejected);
    }

    public function test_la_reservation_annulee(): void
    {
        $booking = $this->bookingOfClient([
            'status' => BookingStatus::Cancelled,
            'start_date' => now()->addDays(10)->toDateString(),
            'end_date' => now()->addDays(13)->toDateString(),
        ]);

        app(NotifyOnBookingCancelled::class)->handle(new BookingClosed($booking, BookingClosed::REASON_CANCELLED, $this->client->id));

        $this->assertFormes(NotificationCode::BookingCancelled);
    }

    public function test_les_visites(): void
    {
        $visit = PropertyVisit::factory()->create([
            'property_id' => $this->property->id,
            'agent_id' => $this->agent->id,
            'visitor_id' => $this->client->id,
            'status' => VisitStatus::Confirmed,
            'scheduled_at' => now()->addDay(),
        ]);
        $notifier = app(VisitNotifier::class);

        $notifier->requested($visit);
        $notifier->confirmed($visit);
        $notifier->rescheduledByAgency($visit);
        $notifier->cancelledByAgency($visit);
        $notifier->rescheduledByVisitor($visit);
        $notifier->cancelledByVisitor($visit);
        app()->call([new SendPropertyVisitReminders, 'handle']);

        foreach ([NotificationCode::VisitRequested, NotificationCode::VisitConfirmed, NotificationCode::VisitRescheduled,
            NotificationCode::VisitCancelled, NotificationCode::VisitReminder,
            NotificationCode::VisitRescheduledByVisitor, NotificationCode::VisitCancelledByVisitor] as $code) {
            $this->assertFormes($code);
        }
    }

    public function test_l_echeance_du_dossier_kyc(): void
    {
        $agency = Agency::factory()->create(['is_verified' => true]);
        AgencyAdminProfile::factory()->create(['user_id' => User::factory()->create()->id, 'agency_id' => $agency->id]);
        KycDossier::query()->create([
            'subject_type' => Agency::class,
            'subject_id' => $agency->id,
            'status' => KycDossierStatus::Verified,
            'reviewed_at' => now(),
            'expires_at' => now()->addDays(20)->startOfDay(),
            'metadata' => [],
        ]);

        app(KycExpiryService::class)->run();

        $this->assertFormes(NotificationCode::KycExpiringSoon);
    }

    public function test_la_delegation_activee(): void
    {
        $delegation = RoleDelegation::factory()->create(['ends_at' => now()->addDays(5)->endOfDay()]);

        app(NotifyDelegationActivated::class)->handle(new RoleDelegationActivated($delegation));

        $this->assertFormes(NotificationCode::RoleDelegationActivated);
    }

    public function test_le_releve_finalise(): void
    {
        $statement = BankStatement::factory()->create([
            'agency_id' => $this->agency->id,
            'finalized_by' => $this->agent->id,
        ]);

        app(NotifyStatementFinalized::class)->handle(new BankStatementFinalized($statement));

        $this->assertFormes(NotificationCode::BankStatementFinalized);
    }

    public function test_les_etapes_d_intervention_planifiees(): void
    {
        $requester = User::factory()->create();
        $request = MaintenanceRequest::factory()->create([
            'property_id' => $this->property->id,
            'requester_id' => $requester->id,
            'scheduled_at' => now()->addDays(2),
        ]);
        $listener = app(NotifyMaintenanceParticipants::class);
        $steps = [MaintenanceStatus::Open, MaintenanceStatus::Acknowledged, MaintenanceStatus::Assigned, MaintenanceStatus::InProgress];

        for ($i = 1; $i < count($steps); $i++) {
            $listener->handle(new MaintenanceStatusChanged($request, $steps[$i - 1], $steps[$i], $this->agent));
        }

        $this->assertFormes(NotificationCode::MaintenanceStepAcknowledgedScheduled);
        $this->assertFormes(NotificationCode::MaintenanceStepAssignedScheduled);
        $this->assertFormes(NotificationCode::MaintenanceStepInProgressScheduled);
    }

    /** TCK-2012 (P184.01) — le passage fixé ou déplacé. */
    public function test_le_passage_d_intervention_deplace(): void
    {
        $request = MaintenanceRequest::factory()->create([
            'property_id' => $this->property->id,
            'requester_id' => User::factory()->create()->id,
            'scheduled_at' => now()->addDays(2),
        ]);

        app(NotifyMaintenanceParticipants::class)->handleScheduleChanged(new MaintenanceScheduleChanged($request, $this->agent));

        $this->assertFormes(NotificationCode::MaintenanceScheduleChanged);
    }

    public function test_le_conflit_de_calendrier(): void
    {
        $this->bookingOfClient([
            'status' => BookingStatus::Confirmed, 'confirmed_at' => now(),
            'start_date' => now()->addDays(10)->toDateString(), 'end_date' => now()->addDays(13)->toDateString(),
        ]);
        $this->app->instance(DnsResolver::class, new class extends DnsResolver
        {
            public function resolve(string $host): array
            {
                return ['93.184.216.34'];
            }
        });
        Http::fake(['cal.example.com/*' => Http::response(implode("\r\n", [
            'BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:x@airbnb',
            'DTSTART;VALUE=DATE:'.now()->addDays(12)->format('Ymd'),
            'DTEND;VALUE=DATE:'.now()->addDays(14)->format('Ymd'),
            'END:VEVENT', 'END:VCALENDAR',
        ])."\r\n")]);
        $feed = PropertyCalendarFeed::query()->create([
            'property_id' => $this->property->id,
            'url' => 'https://cal.example.com/export/abc.ics',
            'url_host' => 'cal.example.com',
            'label' => 'Airbnb',
        ]);

        app(PropertyCalendarSyncService::class)->sync($feed);

        $this->assertFormes(NotificationCode::PropertyCalendarConflict);
    }

    public function test_la_fin_d_une_impersonation(): void
    {
        ['operateur' => $operateur] = $this->ouvrirUneSession();
        $this->travel(3)->minutes();

        $this->commeOperateur($operateur)->postJson('/api/admin/impersonate/stop')->assertOk();

        $this->assertFormes(NotificationCode::ImpersonationEnded);
    }

    public function test_chaque_code_date_du_catalogue_est_eprouve_ici(): void
    {
        $dates = array_values(array_filter(
            NotificationCode::cases(),
            fn (NotificationCode $code) => array_intersect(
                $code->params() + $code->optionalParams(),
                [NotificationCode::PARAM_DATE, NotificationCode::PARAM_DATETIME],
            ) !== [],
        ));

        $this->assertEqualsCanonicalizing(
            array_map(fn (NotificationCode $c) => $c->value, $dates),
            array_map(fn (NotificationCode $c) => $c->value, self::EPROUVES),
            'un code à paramètre daté sans émetteur éprouvé par ce fichier',
        );
    }

    /** Au moins une ligne de ce code, et chaque paramètre daté dans la forme de sa nature. */
    private function assertFormes(NotificationCode $code): void
    {
        $lignes = AppNotification::query()->where('code', $code->value)->get();
        $this->assertNotEmpty($lignes, "{$code->value} : aucune ligne écrite par son émetteur");

        foreach ($lignes as $ligne) {
            foreach ($code->params() + $code->optionalParams() as $nom => $nature) {
                $valeur = $ligne->params[$nom] ?? null;
                if ($nature === NotificationCode::PARAM_DATE) {
                    $this->assertMatchesRegularExpression(self::DATE, (string) $valeur, "{$code->value}.{$nom} (date)");
                } elseif ($nature === NotificationCode::PARAM_DATETIME) {
                    $this->assertMatchesRegularExpression(self::INSTANT, (string) $valeur, "{$code->value}.{$nom} (datetime)");
                }
            }
        }
    }
}
