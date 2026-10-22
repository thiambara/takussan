<?php

namespace Tests\Feature\Notifications;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Models\AccountDeletionRequest;
use App\Models\AgencyUpgradeRequest;
use App\Models\AlertSubscriber;
use App\Models\DataExport;
use App\Models\Lease;
use App\Models\ThresholdAlert;
use App\Models\User;
use App\Notifications\AccountDeletionReminderNotification;
use App\Notifications\AccountDeletionRequestedNotification;
use App\Notifications\AgencyAdminActivationNotification;
use App\Notifications\AgencyUpgradeApprovedNotification;
use App\Notifications\AgencyUpgradeRejectedNotification;
use App\Notifications\AgencyUpgradeRequestSubmittedNotification;
use App\Notifications\AgentTenantInventoryReminderNotification;
use App\Notifications\CodedNotification;
use App\Notifications\DataExportReadyNotification;
use App\Notifications\FavoriteChangesNotification;
use App\Notifications\ResetPasswordNotification;
use App\Notifications\SearchAlertConfirmationNotification;
use App\Notifications\TenantInventoryReminderNotification;
use App\Notifications\TenantWelcomeNotification;
use App\Notifications\ThresholdAlertTriggered;
use App\Support\LienFront;
use Closure;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * P97.05 (TCK-1245) — le bouton de chaque courriel mène au front, sur la page attendue.
 *
 * `scripts/check-notification-target-paths.mjs` ne lisait que `NotificationTarget::PATHS` : une
 * quinzaine de liens de console écrits à la main dans les `toMail()` lui échappaient, et le bouton
 * de l'alerte de seuil a mené à l'hôte de l'API sans que rien rougisse (P97.01). Ce test REND chaque
 * `toMail()` qui porte un bouton, sur un destinataire de fabrique, et exige :
 *
 *   · un `actionUrl` sur la base du front (`app.frontend_url`), posée ici AVEC une barre finale :
 *     c'est la forme qui révélait les écritures sans `rtrim` (`…//app/profile`) ;
 *   · un chemin égal à celui que déclare {@see self::CHEMINS_DU_FRONT} (identifiants rendus
 *     `{id}`, langue rendue `{locale}`).
 *
 * ⚠ La page n'est PAS cherchée ici : la suite de l'API ne lit pas `takussan-web/` (sa clé
 * d'attestation, ADR-0063, ne le couvre pas). C'est la garde du dépôt
 * `scripts/check-mail-button-paths.mjs` qui lit {@see self::CHEMINS_DU_FRONT} et résout
 * chaque chemin en `page.tsx`, par la résolution de la garde des cibles (`PATHS`). Les deux ensemble : le test dit où
 * mène le bouton, la garde dit que la page existe.
 *
 * Une classe neuve de `app/Notifications` qui écrit `->action(` sans entrée ici fait rougir
 * l'inventaire : on la rend, ou on écrit pourquoi son lien n'est pas une page du front.
 */
class LiensDesCourrielsTest extends TestCase
{
    use RefreshDatabase;

    private const FRONT = 'https://front.exemple.test';

    /**
     * Le chemin du front où mène le bouton de chaque courriel. ⚠ Lu par
     * `scripts/check-mail-button-paths.mjs` : une entrée par ligne, `'Classe' => '/chemin'`.
     *
     * @var array<string, string>
     */
    public const CHEMINS_DU_FRONT = [
        'AccountDeletionReminderNotification' => '/app/profile',
        'AccountDeletionRequestedNotification' => '/app/profile',
        'AgencyAdminActivationNotification' => '/auth/reset-password',
        'AgencyUpgradeApprovedNotification' => '/app',
        'AgencyUpgradeRejectedNotification' => '/app/settings/agency/upgrade',
        'AgencyUpgradeRequestSubmittedNotification' => '/super-admin/agency-upgrade-requests/{id}',
        'AgentTenantInventoryReminderNotification' => '/app/leases/onboarding-pending',
        'CodedNotification' => '/app/messages',
        'DataExportReadyNotification' => '/app/account/privacy',
        'FavoriteChangesNotification' => '/app/favorites',
        'ResetPasswordNotification' => '/auth/reset-password',
        'SearchAlertConfirmationNotification' => '/{locale}/search-alerts/confirm',
        'TenantInventoryReminderNotification' => '/app/inventories',
        'TenantWelcomeNotification' => '/app',
        'ThresholdAlertTriggered' => '/app/overview',
        'VerifyEmail' => '/auth/verify-email/{id}/{id}',
    ];

    /**
     * Boutons qui ne mènent PAS au front, et pourquoi. Par nom de classe.
     *
     * @var array<string, string>
     */
    private const HORS_DU_FRONT = [
        'ActivityLogExportReadyNotification' => "téléchargement signé servi par l'API (ExportActivityLogJob)",
        'ReportExportReadyNotification' => "téléchargement signé servi par l'API (ReportExportDownloadController)",
    ];

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.frontend_url' => self::FRONT.'/', 'app.url' => 'https://api.exemple.test']);
    }

    /** @return array<string, array{0: Closure(User): array{0: Notification, 1: object}}> */
    public static function courriels(): array
    {
        // Les clés sont celles de `CHEMINS_DU_FRONT`, et le nom de chaque cas.
        $lease = fn (): Lease => (new Lease)->forceFill(['id' => 7, 'reference_number' => 'BAIL-7']);

        return [
            'AccountDeletionReminderNotification' => [fn (User $u) => [new AccountDeletionReminderNotification(AccountDeletionRequest::factory()->make(['user_id' => $u->id])), $u]],
            'AccountDeletionRequestedNotification' => [fn (User $u) => [new AccountDeletionRequestedNotification(AccountDeletionRequest::factory()->make(['user_id' => $u->id])), $u]],
            'AgencyAdminActivationNotification' => [fn (User $u) => [new AgencyAdminActivationNotification('jeton'), $u]],
            'AgencyUpgradeApprovedNotification' => [fn (User $u) => [new AgencyUpgradeApprovedNotification(AgencyUpgradeRequest::factory()->create()), $u]],
            'AgencyUpgradeRejectedNotification' => [fn (User $u) => [new AgencyUpgradeRejectedNotification(AgencyUpgradeRequest::factory()->create()), $u]],
            'AgencyUpgradeRequestSubmittedNotification' => [fn (User $u) => [new AgencyUpgradeRequestSubmittedNotification(AgencyUpgradeRequest::factory()->create(), $u), $u]],
            'AgentTenantInventoryReminderNotification' => [fn (User $u) => [new AgentTenantInventoryReminderNotification($lease()), $u]],
            'CodedNotification' => [fn (User $u) => [new CodedNotification(NotificationCode::VisitRequested, [], NotificationTarget::of('conversation', 42)->toArray()), $u]],
            'DataExportReadyNotification' => [fn (User $u) => [new DataExportReadyNotification((new DataExport)->forceFill(['id' => 3, 'expires_at' => now()->addDays(7)])), $u]],
            'FavoriteChangesNotification' => [fn (User $u) => [new FavoriteChangesNotification(FavoriteChangesNotification::KIND_UNAVAILABLE, []), $u]],
            'ResetPasswordNotification' => [fn (User $u) => [new ResetPasswordNotification('jeton'), $u]],
            'SearchAlertConfirmationNotification' => [fn (User $u) => [new SearchAlertConfirmationNotification('jeton'), (new AlertSubscriber)->forceFill(['channel' => 'email', 'contact' => 'a@exemple.test', 'locale' => 'en'])]],
            'TenantInventoryReminderNotification' => [fn (User $u) => [new TenantInventoryReminderNotification($lease()), $u]],
            'TenantWelcomeNotification' => [fn (User $u) => [new TenantWelcomeNotification($lease()), $u]],
            'ThresholdAlertTriggered' => [fn (User $u) => [new ThresholdAlertTriggered((new ThresholdAlert)->forceFill(['metric' => 'occupancy_rate', 'operator' => '<', 'threshold' => 50, 'severity' => 'warning', 'cooldown_hours' => 24]), 40.0), $u]],
            // Hors de `app/Notifications` : le lien de vérification, bâti par `AppServiceProvider`.
            'VerifyEmail' => [fn (User $u) => [new VerifyEmail, $u]],
        ];
    }

    /** @param  Closure(User): array{0: Notification, 1: object}  $fabrique */
    #[DataProvider('courriels')]
    public function test_le_bouton_du_courriel_mene_a_sa_page_du_front(Closure $fabrique): void
    {
        $nom = (string) $this->dataName();
        [$notification, $destinataire] = $fabrique(User::factory()->create(['email' => 'dest@exemple.test']));

        $mail = $notification->toMail($destinataire);
        $this->assertInstanceOf(MailMessage::class, $mail);
        $url = (string) $mail->actionUrl;

        $this->assertStringStartsWith(self::FRONT.'/', $url, "le bouton doit mener au front : {$url}");
        $chemin = (string) parse_url($url, PHP_URL_PATH);
        $this->assertStringNotContainsString('//', $chemin, "chemin à double barre : {$url}");
        $this->assertSame(self::CHEMINS_DU_FRONT[$nom] ?? null, self::forme($chemin), "chemin du bouton de {$nom} ({$url})");
    }

    /** `/fr/x/42/ab12…` → `/{locale}/x/{id}/{id}` : identifiants et langue, rendus génériques. */
    private static function forme(string $chemin): string
    {
        $segments = explode('/', ltrim($chemin, '/'));
        foreach ($segments as $i => $segment) {
            if ($i === 0 && in_array($segment, ['fr', 'en', 'wo'], true)) {
                $segments[$i] = '{locale}';
            } elseif (preg_match('/^(\d+|[0-9a-f]{20,})$/', $segment) === 1) {
                $segments[$i] = '{id}';
            }
        }

        return '/'.implode('/', $segments);
    }

    /**
     * L'inventaire : toute classe de `app/Notifications` qui écrit un bouton (`->action(`) est
     * rendue ci-dessus, ou nommée dans {@see self::HORS_DU_FRONT}.
     */
    public function test_chaque_courriel_a_bouton_est_rendu_ou_excuse(): void
    {
        $rendus = array_keys(self::courriels());
        $oublies = [];
        foreach (glob(app_path('Notifications/*.php')) ?: [] as $fichier) {
            $classe = basename($fichier, '.php');
            $source = (string) file_get_contents($fichier);
            if (! str_contains($source, 'function toMail') || ! str_contains($source, '->action(')) {
                continue;
            }
            if (! in_array($classe, $rendus, true) && ! array_key_exists($classe, self::HORS_DU_FRONT)) {
                $oublies[] = $classe;
            }
        }

        $this->assertSame([], $oublies, 'courriel à bouton ni rendu ni excusé dans LiensDesCourrielsTest');
        $this->assertEqualsCanonicalizing(array_keys(self::CHEMINS_DU_FRONT), $rendus, 'chaque cas rendu déclare son chemin');
        $this->assertGreaterThanOrEqual(14, count($rendus), "l'inventaire ne lit plus rien");
    }

    /** La base unique : celle du front sans barre finale, à défaut celle de l'API. */
    public function test_la_base_se_replie_sur_l_api_et_perd_sa_barre_finale(): void
    {
        $this->assertSame(self::FRONT.'/app/profile', LienFront::vers('/app/profile'));
        $this->assertSame(self::FRONT.'/app/profile', LienFront::vers('app/profile'));

        config(['app.frontend_url' => '']);
        $this->assertSame('https://api.exemple.test/app', LienFront::vers('/app'));

        // `CodedNotification` n'avait aucun repli : sans base du front, son bouton était relatif.
        $mail = (new CodedNotification(NotificationCode::VisitRequested, [], NotificationTarget::of('conversation', 42)->toArray()))
            ->toMail(User::factory()->create());
        $this->assertSame('https://api.exemple.test/app/messages?conversation=42', $mail->actionUrl);
    }
}
