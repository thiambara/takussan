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
 * P97.05 (TCK-1245) — le bouton de chaque courriel mène au front, sur une page qui existe.
 *
 * `scripts/check-notification-target-paths.mjs` ne lit que `NotificationTarget::PATHS` : une
 * quinzaine de liens de console écrits à la main dans les `toMail()` lui échappaient, et le bouton
 * de l'alerte de seuil a mené à l'hôte de l'API sans que rien rougisse (P97.01). Ce test REND chaque
 * `toMail()` qui porte un bouton, sur un destinataire de fabrique, et exige :
 *
 *   · un `actionUrl` sur la base du front (`app.frontend_url`), posée ici AVEC une barre finale :
 *     c'est la forme qui révélait les écritures sans `rtrim` (`…//app/profile`) ;
 *   · un chemin qui résout une `page.tsx` de `takussan-web/src/app`, par la résolution de la garde
 *     des cibles (groupes transparents ; un segment sans dossier littéral prend un dossier
 *     dynamique simple, jamais un catch-all).
 *
 * Une classe neuve de `app/Notifications` qui écrit `->action(` sans entrée ici fait rougir
 * l'inventaire : on la rend, ou on écrit pourquoi son lien n'est pas une page du front.
 */
class LiensDesCourrielsTest extends TestCase
{
    use RefreshDatabase;

    private const FRONT = 'https://front.exemple.test';

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
    public function test_le_bouton_du_courriel_mene_a_une_page_du_front(Closure $fabrique): void
    {
        [$notification, $destinataire] = $fabrique(User::factory()->create(['email' => 'dest@exemple.test']));

        $mail = $notification->toMail($destinataire);
        $this->assertInstanceOf(MailMessage::class, $mail);
        $url = (string) $mail->actionUrl;

        $this->assertStringStartsWith(self::FRONT.'/', $url, "le bouton doit mener au front : {$url}");
        $chemin = (string) parse_url($url, PHP_URL_PATH);
        $this->assertStringNotContainsString('//', $chemin, "chemin à double barre : {$url}");
        $this->assertNotNull(self::pageDe($chemin), "aucune page.tsx du front pour {$chemin} ({$url})");
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

    public function test_la_resolution_des_pages_distingue_un_chemin_mort(): void
    {
        $this->assertNotNull(self::pageDe('/app/overview'));
        $this->assertNotNull(self::pageDe('/fr/search-alerts/confirm'));
        $this->assertNull(self::pageDe('/app/page-qui-n-existe-pas'));
        $this->assertNull(self::pageDe('//app/profile'));
    }

    /** La `page.tsx` que sert `$chemin`, ou `null`. Même résolution que la garde des cibles. */
    private static function pageDe(string $chemin): ?string
    {
        if (str_starts_with($chemin, '//')) {
            return null;
        }
        $segments = array_values(array_filter(explode('/', $chemin), fn ($s) => $s !== ''));

        foreach (self::resoudre(base_path('../takussan-web/src/app'), $segments) as $dossier) {
            if (is_file($dossier.'/page.tsx')) {
                return $dossier.'/page.tsx';
            }
        }

        return null;
    }

    /**
     * @param  list<string>  $segments
     * @return list<string>
     */
    private static function resoudre(string $dossier, array $segments): array
    {
        $sous = array_values(array_filter(scandir($dossier) ?: [], fn ($n) => $n[0] !== '.' && is_dir($dossier.'/'.$n)));
        $viaGroupes = [];
        foreach ($sous as $n) {
            if (str_starts_with($n, '(') && str_ends_with($n, ')')) {
                $viaGroupes = [...$viaGroupes, ...self::resoudre($dossier.'/'.$n, $segments)];
            }
        }
        if ($segments === []) {
            return [$dossier, ...$viaGroupes];
        }
        [$tete, $reste] = [$segments[0], array_slice($segments, 1)];
        $suivants = in_array($tete, $sous, true)
            ? [$tete]
            : array_values(array_filter($sous, fn ($n) => preg_match('/^\[[^.\]][^\]]*\]$/', $n) === 1));
        $atteints = [];
        foreach ($suivants as $n) {
            $atteints = [...$atteints, ...self::resoudre($dossier.'/'.$n, $reste)];
        }

        return [...$atteints, ...$viaGroupes];
    }
}
