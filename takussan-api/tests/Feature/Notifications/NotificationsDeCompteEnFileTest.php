<?php

namespace Tests\Feature\Notifications;

use App\Models\User;
use App\Notifications\AccountDeletionExecutedNotification;
use App\Notifications\AccountDeletionReminderNotification;
use App\Notifications\AccountDeletionRequestedNotification;
use App\Notifications\AccountDeletionStepUpCodeNotification;
use App\Notifications\AgencyAdminActivationNotification;
use App\Notifications\RegistrationConfirmationNotification;
use App\Notifications\ResetPasswordNotification;
use Illuminate\Contracts\Queue\ShouldBeEncrypted;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\SendQueuedNotifications;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * TCK-747 (P11.04) — les e-mails du compte partent par la file `notifications-urgent`, et un
 * transport d'e-mail en panne ne fait plus échouer l'inscription ni la demande de
 * réinitialisation.
 *
 * Avant : `RegistrationConfirmationNotification` partait dans la requête. SMTP injoignable →
 * 500, alors que le compte existait déjà, sans jeton rendu ; la nouvelle tentative butait sur
 * « e-mail déjà pris ».
 */
class NotificationsDeCompteEnFileTest extends TestCase
{
    use RefreshDatabase;

    /** Les notifications du compte qui partent par la file urgente. */
    private const EN_FILE = [
        RegistrationConfirmationNotification::class,
        ResetPasswordNotification::class,
        AgencyAdminActivationNotification::class,
        AccountDeletionRequestedNotification::class,
        AccountDeletionReminderNotification::class,
        AccountDeletionStepUpCodeNotification::class,
    ];

    /** Celles qui portent un secret (jeton, code) : chiffrées dans la table `jobs`. */
    private const CHIFFREES = [
        ResetPasswordNotification::class,
        AgencyAdminActivationNotification::class,
        AccountDeletionStepUpCodeNotification::class,
    ];

    protected function setUp(): void
    {
        parent::setUp();
        config()->set('queue.default', 'database');
        // Un SMTP injoignable : tout envoi synchrone lève.
        config()->set('mail.default', 'smtp');
        config()->set('mail.mailers.smtp.host', '127.0.0.1');
        config()->set('mail.mailers.smtp.port', 1);
    }

    public function test_les_notifications_du_compte_partent_par_la_file_urgente(): void
    {
        foreach (self::EN_FILE as $classe) {
            $this->assertTrue(is_subclass_of($classe, ShouldQueue::class), "{$classe} doit être ShouldQueue");
            $notification = (new \ReflectionClass($classe))->newInstanceWithoutConstructor();
            $this->assertSame(['mail' => 'notifications-urgent'], $notification->viaQueues(), $classe);
        }
        foreach (self::CHIFFREES as $classe) {
            $this->assertTrue(is_subclass_of($classe, ShouldBeEncrypted::class), "{$classe} porte un secret : ShouldBeEncrypted");
        }
    }

    /**
     * Reste synchrone, délibérément : envoyée juste avant l'anonymisation, elle serait relue par
     * le worker sur la ligne déjà anonymisée, et partirait vers l'adresse effacée.
     */
    public function test_la_confirmation_d_effacement_reste_synchrone(): void
    {
        $this->assertFalse(is_subclass_of(AccountDeletionExecutedNotification::class, ShouldQueue::class));
    }

    public function test_l_inscription_aboutit_quand_le_transport_d_e_mail_est_en_panne(): void
    {
        $response = $this->postJson('/api/auth/register', [
            'first_name' => 'Awa',
            'last_name' => 'Ndiaye',
            'email' => 'awa.ndiaye@example.test',
            'password' => 'Un-Mot-De-Passe-Solide-42!',
            'password_confirmation' => 'Un-Mot-De-Passe-Solide-42!',
        ]);

        $response->assertSuccessful();
        $this->assertNotEmpty($response->json('data.token') ?? $response->json('token'));

        $job = $this->seulJob();
        $this->assertSame('notifications-urgent', $job->queue);
        $this->assertSame(RegistrationConfirmationNotification::class, json_decode($job->payload)->displayName);
    }

    public function test_la_demande_de_reinitialisation_aboutit_et_le_jeton_n_est_pas_en_clair_dans_la_file(): void
    {
        $user = User::factory()->create();

        $this->postJson('/api/auth/forgot-password', ['email' => $user->email])->assertOk();

        $job = $this->seulJob();
        $this->assertSame('notifications-urgent', $job->queue);

        $commande = json_decode($job->payload)->data->command;
        $this->assertFalse(str_starts_with($commande, 'O:'), 'la commande est chiffrée');
        $envoi = unserialize(decrypt($commande));
        $this->assertInstanceOf(SendQueuedNotifications::class, $envoi);
        $jeton = $envoi->notification->token;
        $this->assertNotEmpty($jeton);
        $this->assertStringNotContainsString($jeton, $job->payload);
    }

    private function seulJob(): object
    {
        $jobs = DB::table('jobs')->get();
        $this->assertCount(1, $jobs, 'une seule notification en file');

        return $jobs->first();
    }
}
