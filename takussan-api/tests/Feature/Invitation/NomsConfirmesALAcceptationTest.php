<?php

namespace Tests\Feature\Invitation;

use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Invitation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * P220.07 (TCK-2281) — un compte existant qui accepte une invitation ne recevait pas le nom que
 * l'agence avait saisi : `acceptForUser` n'écrivait aucun nom, et un compte créé par téléphone
 * (noms `''`) restait sans nom dans l'équipe. Décision du porteur : connecté et sans nom, l'écran
 * préremplit le prénom et le nom de l'invitation, que la personne confirme ou corrige ; l'API ne
 * les écrit que si les noms du compte sont vides.
 */
class NomsConfirmesALAcceptationTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        $this->agency = Agency::factory()->create(['kind' => AgencyKind::Standard]);
    }

    public function test_un_compte_sans_nom_porte_ensuite_le_nom_qu_il_a_confirme(): void
    {
        $compte = User::factory()->create(['email' => 'awa@example.sn', 'first_name' => '', 'last_name' => '']);
        $invitation = $this->inviterUnAgent('awa@example.sn');

        Sanctum::actingAs($compte);
        $this->postJson("/api/invitations/{$invitation->token}/accept", ['first_name' => 'Awa', 'last_name' => 'Sarr'])
            ->assertOk();

        $compte->refresh();
        $this->assertSame(['Awa', 'Sarr'], [$compte->first_name, $compte->last_name]);
    }

    public function test_un_compte_nomme_garde_son_nom_quoi_qu_on_envoie(): void
    {
        $compte = User::factory()->create(['email' => 'moussa@example.sn', 'first_name' => 'Moussa', 'last_name' => 'Ba']);
        $invitation = $this->inviterUnAgent('moussa@example.sn');

        Sanctum::actingAs($compte);
        $this->postJson("/api/invitations/{$invitation->token}/accept", ['first_name' => 'Autre', 'last_name' => 'Nom'])
            ->assertOk();

        $compte->refresh();
        $this->assertSame(['Moussa', 'Ba'], [$compte->first_name, $compte->last_name]);
    }

    public function test_le_prerempli_rend_le_nom_de_l_invitation_au_destinataire_sans_nom(): void
    {
        $compte = User::factory()->create(['email' => 'awa@example.sn', 'first_name' => '', 'last_name' => '']);
        $invitation = $this->inviterUnAgent('awa@example.sn');

        Sanctum::actingAs($compte);
        $this->getJson("/api/invitations/{$invitation->token}/prefill")
            ->assertOk()
            ->assertExactJson(['data' => ['first_name' => 'Awa', 'last_name' => 'Sarr']]);
    }

    public function test_le_prerempli_ne_rend_rien_a_un_compte_nomme_ni_a_un_autre_compte(): void
    {
        $nomme = User::factory()->create(['email' => 'awa@example.sn']);
        $invitation = $this->inviterUnAgent('awa@example.sn');
        $autre = User::factory()->create(['first_name' => '', 'last_name' => '']);

        foreach ([$nomme, $autre] as $compte) {
            Sanctum::actingAs($compte);
            $this->getJson("/api/invitations/{$invitation->token}/prefill")
                ->assertOk()
                ->assertExactJson(['data' => null]);
        }
    }

    public function test_le_prerempli_exige_une_session_et_une_invitation_ouverte(): void
    {
        $invitation = $this->inviterUnAgent('awa@example.sn');

        $this->getJson("/api/invitations/{$invitation->token}/prefill")->assertUnauthorized();

        Sanctum::actingAs(User::factory()->create());
        $this->getJson('/api/invitations/'.str_repeat('x', 64).'/prefill')->assertNotFound();
        $invitation->forceFill(['status' => 'revoked'])->save();
        $this->getJson("/api/invitations/{$invitation->token}/prefill")->assertStatus(410);
    }

    private function inviterUnAgent(string $email): Invitation
    {
        $this->actingAsRole('agency_admin', ['agency_id' => $this->agency->id]);
        $this->postJson("/api/agencies/{$this->agency->id}/agents/invite", [
            'email' => $email,
            'role' => 'agent',
            'first_name' => 'Awa',
            'last_name' => 'Sarr',
        ])->assertCreated();
        $this->app['auth']->forgetGuards();

        return Invitation::query()->where('email', $email)->sole();
    }
}
