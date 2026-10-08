<?php

namespace Tests\Feature\Admin\Platform;

use App\Models\Enums\PlatformProfileLevel;
use App\Models\ImpersonationSession;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\SessionsDImpersonation;
use Tests\TestCase;

/**
 * TCK-600 (ADR-0055 §6, verif-600 B1-bis) — la moitié API de la sonde P1.
 *
 * Une server action réécrite postait `…/impersonate?reason=Ticket%20support%204821&x=/notes` sous
 * le corps d'une note (`{"body":"note"}`). `StartImpersonationRequest` lisait `reason` dans
 * `all()`, qui fusionne la query : 201, session ouverte, jeton rendu. Le motif se lit désormais
 * dans le corps seul, et `start` comme `stop` refusent toute query.
 */
class ImpersonationQueryRefusedTest extends TestCase
{
    use RefreshDatabase;
    use SessionsDImpersonation;

    public function test_la_sonde_p1_n_ouvre_aucune_session(): void
    {
        $cible = User::factory()->create();
        $this->commeOperateur($this->operateur(PlatformProfileLevel::SuperAdmin));

        $reponse = $this->postJson(
            "/api/admin/users/{$cible->id}/impersonate?reason=Ticket%20support%204821&x=/notes",
            ['body' => 'note'],
        );

        // Refusée d'abord parce que le CORPS ne porte aucun motif : celui de la query ne compte pas.
        $reponse->assertStatus(422)->assertJsonValidationErrors('reason');
        $this->assertArrayNotHasKey('token', (array) $reponse->json('data'));
        $this->assertSame(0, ImpersonationSession::query()->count());
    }

    /** Le motif voyagerait-il dans la query sous un corps qui en porte un aussi : refusé quand même. */
    public function test_une_query_est_refusee_meme_avec_un_motif_dans_le_corps(): void
    {
        $cible = User::factory()->create();
        $this->commeOperateur($this->operateur(PlatformProfileLevel::SuperAdmin));

        $this->postJson("/api/admin/users/{$cible->id}/impersonate?x=1", ['reason' => self::MOTIF_IMPERSONATION])
            ->assertStatus(422)
            ->assertJsonPath('code', 'impersonation.query_refused');
        $this->assertSame(0, ImpersonationSession::query()->count());
    }

    /** Le motif du corps seul : ni la query, ni rien d'autre ne le remplace. */
    public function test_le_motif_se_lit_dans_le_corps_seul(): void
    {
        $cible = User::factory()->create();
        $this->commeOperateur($this->operateur(PlatformProfileLevel::SuperAdmin));

        $this->postJson("/api/admin/users/{$cible->id}/impersonate", ['body' => 'note'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('reason');

        $this->postJson("/api/admin/users/{$cible->id}/impersonate", ['reason' => self::MOTIF_IMPERSONATION])
            ->assertCreated();
        $this->assertSame(self::MOTIF_IMPERSONATION, ImpersonationSession::query()->sole()->reason);
    }

    public function test_stop_refuse_une_query_et_ne_ferme_rien(): void
    {
        $cible = User::factory()->create();
        $this->commeOperateur($this->operateur(PlatformProfileLevel::SuperAdmin));
        $this->postJson("/api/admin/users/{$cible->id}/impersonate", ['reason' => self::MOTIF_IMPERSONATION])
            ->assertCreated();

        $this->postJson('/api/admin/impersonate/stop?x=/notes')
            ->assertStatus(422)
            ->assertJsonPath('code', 'impersonation.query_refused');
        $this->assertNull(ImpersonationSession::query()->sole()->ended_at);

        $this->postJson('/api/admin/impersonate/stop')->assertOk();
        $this->assertNotNull(ImpersonationSession::query()->sole()->ended_at);
    }
}
