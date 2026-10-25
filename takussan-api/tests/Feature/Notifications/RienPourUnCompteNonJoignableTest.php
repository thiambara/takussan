<?php

namespace Tests\Feature\Notifications;

use App\Domain\Notifications\NotificationCode;
use App\Events\Lease\LeasePaymentLateFeeApplied;
use App\Listeners\Lease\NotifyTenantOfLateFee;
use App\Listeners\Notifications\RienPourUnCompteNonJoignable;
use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\UserStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\TenantOnboardingChecklist;
use App\Models\ThresholdAlert;
use App\Models\User;
use App\Notifications;
use App\Notifications\CodedNotification;
use App\Services\Model\NotificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\Events\NotificationSending;
use Illuminate\Notifications\Events\NotificationSent;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\Event;
use PHPUnit\Framework\Attributes\DataProvider;
use ReflectionClass;
use Symfony\Component\Finder\Finder;
use Tests\TestCase;

/**
 * P239.01 (TCK-2363) — un compte non joignable (`blocked`, `deleted`) ne reçoit que les avis de son
 * compte, par TOUS les chemins d'envoi : la règle de TCK-1350 ne vivait que dans
 * `NotificationService::send()` et `CodedNotification::via()`, et les envois directs
 * (`Notification::send`, `->notify()`) partaient encore vers un locataire ou un administrateur
 * bloqué. Les tests jouent les vrais canaux (aucun `Notification::fake()`, qui ne déclenche pas
 * `NotificationSending`) et comptent les `NotificationSent`.
 */
class RienPourUnCompteNonJoignableTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Les notifications coupées pour un compte non joignable. Une notification neuve casse
     * {@see test_chaque_notification_est_classee} tant qu'elle n'est ni ici ni dans
     * {@see RienPourUnCompteNonJoignable::AVIS_DU_COMPTE}.
     */
    private const COUPEES = [
        Notifications\ActivityLogExportReadyNotification::class,
        Notifications\AgencyAdminActivationNotification::class,
        Notifications\AgencyUpgradeApprovedNotification::class,
        Notifications\AgencyUpgradeRejectedNotification::class,
        Notifications\AgencyUpgradeRequestSubmittedNotification::class,
        Notifications\AgentTenantInventoryReminderNotification::class,
        Notifications\BookingExpiredNotification::class,
        Notifications\Boost\BoostEndedNotification::class,
        Notifications\Boost\BoostRefundedNotification::class,
        Notifications\Credits\CreditsExpiringNotification::class,
        Notifications\Credits\CreditsGrantedNotification::class,
        Notifications\FavoriteChangesNotification::class,
        Notifications\InvitationAcceptedNotification::class,
        Notifications\InvitationExpiredNotification::class,
        Notifications\InvoiceOverdueReminderNotification::class,
        Notifications\LeaseDepositRefundNotification::class,
        Notifications\LeaseEarlyTerminationNotification::class,
        Notifications\LeasePaymentLateFeeNotification::class,
        Notifications\LeaseRenewedNotification::class,
        Notifications\LeaseRentReviewedNotification::class,
        Notifications\LeaseSignatureCodeNotification::class,
        Notifications\PropertyApprovedNotification::class,
        Notifications\PropertyProposedNotification::class,
        Notifications\PropertyRejectedNotification::class,
        Notifications\RegistrationConfirmationNotification::class,
        Notifications\ReportExportReadyNotification::class,
        Notifications\SavedSearchMatchesNotification::class,
        Notifications\SearchAlertConfirmationNotification::class,
        Notifications\SuperAdminAcceptedBroadcast::class,
        Notifications\SuperAdminInvitedBroadcast::class,
        Notifications\TaskDueReminderNotification::class,
        Notifications\TenantInventoryReminderNotification::class,
        Notifications\TenantWelcomeNotification::class,
        Notifications\ThresholdAlertTriggered::class,
        Notifications\UrgentMaintenanceCreatedNotification::class,
    ];

    /** @var list<array{user: int, notification: class-string, channel: string}> */
    private array $envois = [];

    protected function setUp(): void
    {
        parent::setUp();
        Event::listen(NotificationSent::class, function (NotificationSent $e): void {
            if ($e->notifiable instanceof User) {
                $this->envois[] = ['user' => $e->notifiable->id, 'notification' => $e->notification::class, 'channel' => $e->channel];
            }
        });
    }

    /** @return array<string, array{UserStatus, bool}> */
    public static function statuts(): array
    {
        return [
            'compte bloqué : aucun canal' => [UserStatus::Blocked, false],
            'compte actif : l’avis part' => [UserStatus::Active, true],
        ];
    }

    /** Famille « bail » : la pénalité de retard au locataire (`NotifyTenantOfLateFee`). */
    #[DataProvider('statuts')]
    public function test_un_avis_du_bail_ne_part_pas_vers_un_locataire_bloque(UserStatus $statut, bool $recoit): void
    {
        $locataire = User::factory()->create(['status' => $statut]);
        $client = Customer::factory()->create(['user_id' => $locataire->id]);
        $bail = Lease::factory()->create(['tenant_id' => $client->id, 'late_fee_percent' => 5, 'late_fee_grace_days' => 0]);
        $echeance = LeasePayment::factory()->create([
            'lease_id' => $bail->id,
            'payer_id' => $client->id,
            'amount' => 100_000,
            'status' => PaymentStatus::Late,
            'late_fee_amount' => 5000,
            'late_fee_applied_at' => now(),
        ]);

        app(NotifyTenantOfLateFee::class)->handle(new LeasePaymentLateFeeApplied($echeance->fresh(), 5000.0, 5.0, 100_000.0));

        $this->assertCanaux($locataire, $recoit);
    }

    /** Famille « rappel » : l'état des lieux d'entrée non signé à J+7 (`tenant-onboarding:remind`). */
    #[DataProvider('statuts')]
    public function test_un_rappel_ne_part_pas_vers_un_locataire_bloque(UserStatus $statut, bool $recoit): void
    {
        $locataire = User::factory()->create(['status' => $statut]);
        $client = Customer::factory()->create(['user_id' => $locataire->id]);
        $bail = Lease::factory()->active()->create(['tenant_id' => $client->id, 'agency_id' => Agency::factory()->create()->id]);
        TenantOnboardingChecklist::create(['lease_id' => $bail->id, 'user_id' => $locataire->id])
            ->forceFill(['created_at' => now()->subDays(8)])->save();

        $this->artisan('tenant-onboarding:remind')->assertSuccessful();

        $this->assertCanaux($locataire, $recoit);
    }

    /** Famille « alerte » : l'alerte de seuil à l'administrateur d'agence (`dashboard:check-alerts`). */
    #[DataProvider('statuts')]
    public function test_une_alerte_ne_part_pas_vers_un_administrateur_bloque(UserStatus $statut, bool $recoit): void
    {
        $agence = Agency::factory()->create();
        $admin = User::factory()->create(['status' => $statut]);
        $this->materializeRoleProfile($admin, 'agency_admin', $agence);
        ThresholdAlert::create([
            'agency_id' => $agence->id,
            'metric' => 'overdue_count',
            'operator' => '>',
            'threshold' => -1, // se déclenche toujours
            'severity' => 'warning',
            'is_enabled' => true,
            'cooldown_hours' => 24,
        ]);

        $this->artisan('dashboard:check-alerts')->assertExitCode(0);

        $this->assertCanaux($admin, $recoit);
    }

    public function test_les_avis_du_compte_atteignent_encore_un_compte_bloque(): void
    {
        $bloque = User::factory()->create(['status' => UserStatus::Blocked]);

        app(NotificationService::class)->send($bloque, NotificationCode::AccountBlocked, ['reason' => 'fraude']);
        $bloque->sendPasswordResetNotification('jeton-de-test');

        $recus = collect($this->envois)->where('user', $bloque->id);
        $this->assertTrue($recus->contains(fn (array $e) => $e['notification'] === CodedNotification::class && $e['channel'] === 'mail'), 'avis de blocage par courriel');
        $this->assertTrue($recus->contains(fn (array $e) => $e['notification'] === Notifications\ResetPasswordNotification::class && $e['channel'] === 'mail'), 'réinitialisation du mot de passe');
    }

    /**
     * La liste fermée, jugée par l'écouteur lui-même : chaque avis du compte passe, un avis codé
     * hors de `reachesUnreachableAccount()` et chaque notification coupée ne passent pas.
     */
    public function test_l_ecouteur_ne_laisse_passer_que_la_liste_fermee(): void
    {
        $ecouteur = new RienPourUnCompteNonJoignable;
        foreach ([UserStatus::Blocked, UserStatus::Deleted] as $statut) {
            $compte = new User(['status' => $statut]);

            foreach (RienPourUnCompteNonJoignable::AVIS_DU_COMPTE as $classe) {
                $this->assertNull($ecouteur->handle($this->envoi($compte, $classe)), "{$classe} passe ({$statut->value})");
            }
            foreach (self::COUPEES as $classe) {
                $this->assertFalse($ecouteur->handle($this->envoi($compte, $classe)), "{$classe} coupée ({$statut->value})");
            }
            foreach (NotificationCode::cases() as $code) {
                $attendu = $code->reachesUnreachableAccount() ? null : false;
                $this->assertSame($attendu, $ecouteur->handle(new NotificationSending($compte, new CodedNotification($code, []), 'mail')), $code->value);
            }
        }

        $actif = new User(['status' => UserStatus::Active]);
        foreach (self::COUPEES as $classe) {
            $this->assertNull($ecouteur->handle($this->envoi($actif, $classe)), "{$classe} vers un compte actif");
        }
    }

    /**
     * Chaque classe de notification de `app/` est classée : avis du compte, ou coupée. Une
     * notification neuve casse ce test tant qu'elle ne l'est pas.
     */
    public function test_chaque_notification_est_classee(): void
    {
        $trouvees = [];
        foreach (Finder::create()->files()->in(app_path())->name('*.php')->contains('Notification') as $fichier) {
            $classe = 'App\\'.str_replace(['/', '.php'], ['\\', ''], $fichier->getRelativePathname());
            if (class_exists($classe) && is_subclass_of($classe, Notification::class) && ! (new ReflectionClass($classe))->isAbstract()) {
                $trouvees[] = $classe;
            }
        }
        sort($trouvees);
        $this->assertGreaterThan(30, count($trouvees), 'le relevé lit bien app/');

        $classees = [...RienPourUnCompteNonJoignable::AVIS_DU_COMPTE, ...self::COUPEES, CodedNotification::class];
        sort($classees);

        $this->assertSame($classees, $trouvees, 'une notification neuve se classe : avis du compte (RienPourUnCompteNonJoignable::AVIS_DU_COMPTE) ou coupée (self::COUPEES)');
        $this->assertSame([], array_intersect(RienPourUnCompteNonJoignable::AVIS_DU_COMPTE, self::COUPEES));
    }

    /** @param class-string<Notification> $classe */
    private function envoi(User $compte, string $classe): NotificationSending
    {
        return new NotificationSending($compte, (new ReflectionClass($classe))->newInstanceWithoutConstructor(), 'mail');
    }

    private function assertCanaux(User $destinataire, bool $recoit): void
    {
        $canaux = collect($this->envois)->where('user', $destinataire->id)->pluck('channel')->all();

        $recoit
            ? $this->assertNotEmpty($canaux, 'le scénario envoie bien un avis à un compte actif')
            : $this->assertSame([], $canaux, 'aucun canal pour un compte bloqué');
    }
}
