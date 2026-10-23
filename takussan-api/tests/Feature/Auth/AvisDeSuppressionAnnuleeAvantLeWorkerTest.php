<?php

namespace Tests\Feature\Auth;

use App\Models\AccountDeletionRequest;
use App\Models\User;
use App\Notifications\AccountDeletionReminderNotification;
use App\Notifications\AccountDeletionRequestedNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-1750 (P166.01) — les deux avis de suppression de compte portent l'`AccountDeletionRequest`,
 * que `cancelDeletion` supprime pour de bon. Annulée avant le passage du worker, la demande
 * manquait à la désérialisation : `ModelNotFoundException`, et une ligne `failed_jobs` pour un
 * avis qui n'avait plus d'objet. Marqués `#[DeleteWhenMissingModels]`, ils disparaissent de la
 * file sans échec, et sans courriel.
 */
class AvisDeSuppressionAnnuleeAvantLeWorkerTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<string, array{class-string}> */
    public static function avis(): array
    {
        return [
            'demande' => [AccountDeletionRequestedNotification::class],
            'rappel' => [AccountDeletionReminderNotification::class],
        ];
    }

    /** @param class-string $avis */
    #[DataProvider('avis')]
    public function test_l_avis_d_une_demande_annulee_avant_le_worker_disparait_sans_echec(string $avis): void
    {
        config()->set('queue.default', 'database');
        Mail::fake();

        $user = User::factory()->create();
        $demande = AccountDeletionRequest::factory()->for($user)->create([
            'scheduled_for' => now()->addDays(30),
        ]);

        Notification::send($user, new $avis($demande));
        $this->assertSame(1, DB::table('jobs')->count(), 'l’avis est en file');

        $demande->delete();

        $this->artisan('queue:work', [
            'connection' => 'database',
            '--queue' => 'notifications-urgent',
            '--once' => true,
            '--stop-when-empty' => true,
        ])->assertSuccessful();

        $this->assertSame(0, DB::table('jobs')->count(), 'la file est vide');
        $this->assertSame(0, DB::table('failed_jobs')->count(), 'aucun échec pour un avis sans objet');
        Mail::assertNothingOutgoing();
    }
}
