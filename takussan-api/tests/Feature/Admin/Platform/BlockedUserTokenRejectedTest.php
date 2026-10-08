<?php

namespace Tests\Feature\Admin\Platform;

use App\Models\Enums\UserStatus;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-600 — un compte bloqué ne s'authentifie plus, QUEL QUE SOIT LE CHEMIN.
 *
 * Le blocage supprime les jetons du moment ; c'est la clause de statut d'`AccessTokenGate`
 * (TCK-589) qui refuse, à chaque requête, un jeton émis APRÈS (`createToken` d'un chemin qui ne
 * lirait pas le statut, jeton survivant). Ce test la garde du côté de ce ticket : elle couvre le
 * `Blocked` posé par la console sans seconde clause (ticket, « Coordination 589 »).
 */
class BlockedUserTokenRejectedTest extends TestCase
{
    use RefreshDatabase;

    public function test_un_jeton_emis_apres_le_blocage_est_refuse_a_chaque_requete(): void
    {
        foreach ([UserStatus::Blocked, UserStatus::Deleted] as $statut) {
            $compte = User::factory()->create();
            $compte->forceFill(['status' => $statut])->save();
            $jeton = $compte->createToken('apres-blocage')->plainTextToken;

            $this->app['auth']->forgetGuards();
            $this->withToken($jeton)->getJson('/api/auth/me')->assertUnauthorized();
        }
    }

    public function test_le_meme_jeton_revit_quand_le_compte_est_reactive(): void
    {
        $compte = User::factory()->create(['status' => UserStatus::Blocked]);
        $jeton = $compte->createToken('apres-blocage')->plainTextToken;
        $this->withToken($jeton)->getJson('/api/auth/me')->assertUnauthorized();

        $compte->forceFill(['status' => UserStatus::Active])->save();

        $this->app['auth']->forgetGuards();
        $this->withToken($jeton)->getJson('/api/auth/me')->assertOk();
    }
}
