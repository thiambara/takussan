<?php

namespace Tests\Feature\Api\Admin;

use App\Models\Enums\PlatformProfileLevel;
use App\Models\ImpersonationSession;
use App\Models\User;
use App\Services\Admin\ImpersonationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\Support\SessionsDImpersonation;
use Tests\TestCase;

/**
 * TCK-144, réécrit par TCK-600 (ADR-0055) — le CONTRAT des trois routes d'impersonation.
 *
 * Ce test affirmait un jeton `*` de 60 minutes rendu en clair et un `stop` qui révoquait les jetons
 * de n'importe quel `user_id`. Le jeton reste dans la réponse de `start`, mais cette réponse n'est
 * destinée qu'au route handler du BFF (ADR-0055 §6) ; les comportements sont gardés par les quatre
 * classes `Impersonation*Test`.
 */
class UserImpersonationTest extends TestCase
{
    use RefreshDatabase;
    use SessionsDImpersonation;

    public function test_start_rend_la_forme_destinee_au_bff(): void
    {
        $this->commeOperateur($this->operateur(PlatformProfileLevel::SuperAdmin));
        $cible = User::factory()->create();

        $this->postJson("/api/admin/users/{$cible->id}/impersonate", ['reason' => self::MOTIF_IMPERSONATION])
            ->assertCreated()
            ->assertJsonStructure(['data' => ['session_id', 'token', 'expires_at', 'target' => ['id', 'name']]])
            ->assertJsonMissingPath('data.actor_id');
    }

    public function test_stop_ignore_un_user_id_et_ne_touche_pas_aux_autres_jetons(): void
    {
        $etrangere = User::factory()->create();
        $autre = $etrangere->createToken(ImpersonationService::TOKEN_NAME, [ImpersonationService::ABILITY], now()->addMinutes(5));
        $ordinaire = $etrangere->createToken('regular-session');
        ['operateur' => $operateur, 'session_id' => $id] = $this->ouvrirUneSession();

        $this->commeOperateur($operateur)->postJson('/api/admin/impersonate/stop', ['user_id' => $etrangere->id])
            ->assertOk()
            ->assertJsonPath('data.session_id', $id)
            ->assertJsonStructure(['data' => ['session_id', 'ended_at']]);

        $this->assertNotNull(PersonalAccessToken::find($autre->accessToken->id));
        $this->assertNotNull(PersonalAccessToken::find($ordinaire->accessToken->id));
    }

    public function test_current_sert_la_banniere_avec_le_jeton_d_impersonation_seulement(): void
    {
        ['operateur' => $operateur, 'cible' => $cible, 'jeton' => $jeton, 'session_id' => $id] = $this->ouvrirUneSession();

        $data = $this->avecLeJeton($jeton)->getJson('/api/impersonation/current')
            ->assertOk()
            ->assertJsonPath('data.session_id', $id)
            ->assertJsonPath('data.impersonator.id', $operateur->id)
            ->assertJsonPath('data.target.id', $cible->id)
            ->assertJsonPath('data.read_only', true)
            ->json('data');
        $this->assertArrayNotHasKey('token', $data);
        $this->assertSame(ImpersonationSession::query()->findOrFail($id)->expires_at->toIso8601String(), $data['expires_at']);

        $this->avecLeJeton($cible->createToken('mobile')->plainTextToken)->getJson('/api/impersonation/current')
            ->assertNotFound()
            ->assertJsonPath('code', 'impersonation.no_session');
        $this->commeOperateur($operateur)->getJson('/api/impersonation/current')->assertNotFound();
    }
}
