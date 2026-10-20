<?php

namespace Tests\Feature\Auth;

use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * TCK-1015 (P57.03) — `password_reset_tokens` a l'e-mail pour clé, et une ligne n'en sortait qu'à
 * l'usage ou à une nouvelle demande : toute demande abandonnée gardait son adresse pour toujours.
 * `auth:clear-resets` est planifiée chaque jour, sur le broker `activations` : la table est
 * partagée avec le lien d'activation du gérant provisionné (7 jours, TCK-781), que la purge du
 * broker `users` (60 minutes) effacerait au bout d'une heure.
 */
class PasswordResetTokensPruneTest extends TestCase
{
    use RefreshDatabase;

    public function test_le_planificateur_purge_les_jetons_de_reinitialisation_chaque_jour(): void
    {
        $events = collect(app(Schedule::class)->events())
            ->filter(fn ($event) => str_contains((string) $event->command, 'auth:clear-resets'));

        $this->assertCount(1, $events);
        $this->assertStringContainsString('auth:clear-resets activations', (string) $events->first()->command);
        $this->assertSame('0 0 * * *', $events->first()->expression);
    }

    public function test_la_purge_planifiee_garde_un_lien_d_activation_encore_valable(): void
    {
        $command = (string) collect(app(Schedule::class)->events())
            ->first(fn ($event) => str_contains((string) $event->command, 'auth:clear-resets'))
            ?->command;
        $this->assertNotSame('', $command);
        $arguments = trim(substr($command, strpos($command, 'auth:clear-resets') + strlen('auth:clear-resets')));

        DB::table('password_reset_tokens')->insert([
            ['email' => 'activation@example.test', 'token' => 'h1', 'created_at' => now()->subDays(2)],
            ['email' => 'abandon@example.test', 'token' => 'h2', 'created_at' => now()->subDays(8)],
        ]);

        $this->artisan(trim('auth:clear-resets '.$arguments))->assertSuccessful();

        $this->assertSame(
            ['activation@example.test'],
            DB::table('password_reset_tokens')->pluck('email')->all(),
        );
    }
}
