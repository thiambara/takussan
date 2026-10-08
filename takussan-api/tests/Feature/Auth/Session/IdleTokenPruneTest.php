<?php

namespace Tests\Feature\Auth\Session;

use App\Models\User;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\TestCase;

/**
 * TCK-589, vérification adverse m7 — un jeton mort d'INACTIVITÉ (`idle_timeout_minutes`) est
 * refusé par `AccessTokenGate`, mais `sanctum:prune-expired` ne voit que la durée absolue : il
 * restait en table jusqu'à 30 jours. `sessions:prune-idle`, planifié chaque jour, le purge avec
 * la même grâce de 24 h.
 *
 * Rouge sur d84fc7fe : la commande n'existait pas.
 */
class IdleTokenPruneTest extends TestCase
{
    use RefreshDatabase;

    public function test_la_commande_purge_les_jetons_morts_d_inactivite_et_eux_seuls(): void
    {
        $user = User::factory()->create();
        $jetons = [
            'super-admin inactif 2 j' => $this->jeton($user, 30, now()->subDays(2)),
            'défaut, inactif 9 j, jamais utilisé' => $this->jeton($user, null, null, now()->subDays(9)),
            'défaut, inactif 3 j' => $this->jeton($user, null, now()->subDays(3)),
            'super-admin inactif 10 h (grâce)' => $this->jeton($user, 30, now()->subHours(10)),
            'sans borne' => $this->jeton($user, 0, now()->subDays(60)),
        ];

        $this->artisan('sessions:prune-idle')->assertSuccessful();

        $restants = PersonalAccessToken::query()->pluck('id')->all();
        $this->assertNotContains($jetons['super-admin inactif 2 j'], $restants);
        $this->assertNotContains($jetons['défaut, inactif 9 j, jamais utilisé'], $restants);
        $this->assertContains($jetons['défaut, inactif 3 j'], $restants);
        $this->assertContains($jetons['super-admin inactif 10 h (grâce)'], $restants);
        $this->assertContains($jetons['sans borne'], $restants);
    }

    public function test_le_planificateur_purge_les_jetons_inactifs_chaque_jour(): void
    {
        $events = collect(app(Schedule::class)->events())
            ->filter(fn ($event) => str_contains((string) $event->command, 'sessions:prune-idle'));

        $this->assertCount(1, $events);
        $this->assertSame('0 0 * * *', $events->first()->expression);
    }

    private function jeton(User $user, ?int $idle, $lastUsed, $createdAt = null): int
    {
        $token = $user->createToken('t')->accessToken;
        $token->forceFill([
            'idle_timeout_minutes' => $idle,
            'last_used_at' => $lastUsed,
            'created_at' => $createdAt ?? now()->subDays(20),
        ])->save();

        return $token->getKey();
    }
}
