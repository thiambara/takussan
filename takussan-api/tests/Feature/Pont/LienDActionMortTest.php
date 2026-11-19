<?php

namespace Tests\Feature\Pont;

use App\Models\ActionLink;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;
use Tests\Support\SceneDuLienDAction;

/**
 * TCK-2982 (ADR-0132 § 5), AC2 — un lien mort (utilisé, expiré, révoqué) rend 410 et un corps qui ne contient QUE
 * son code : rien de l'objet, du geste ni de la personne. Un jeton inconnu : 404.
 */
class LienDActionMortTest extends ApiTestCase
{
    use RefreshDatabase;
    use SceneDuLienDAction;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->monterLaSceneDuLien();
    }

    /** @return array<string, array{0: string}> */
    public static function morts(): array
    {
        return ['utilisé' => ['used'], 'expiré' => ['expired'], 'révoqué' => ['revoked']];
    }

    #[DataProvider('morts')]
    public function test_ac2_un_lien_mort_rend_410_et_son_seul_code(string $mort): void
    {
        [$jeton, $lien] = $this->lien($this->bailleur, 'property_visit.confirm', $this->visiteAConfirmer());
        $this->tuer($lien, $mort);
        $attendu = ['code' => 'action_link.'.$mort, 'message' => __('errors.action_link.'.$mort)];

        foreach ([$this->getJson("/api/a/{$jeton}"), $this->postJson("/api/a/{$jeton}"), $this->postJson("/api/a/{$jeton}/code")] as $reponse) {
            $reponse->assertStatus(410)->assertExactJson($attendu);
            $corps = (string) $reponse->getContent();
            foreach (['property_visit', 'confirm', 'Awa', 'Ndiaye', 'Plateau', 'Dakar', (string) $this->bailleur->phone] as $interdit) {
                $this->assertStringNotContainsString($interdit, $corps);
            }
        }
    }

    public function test_les_trois_morts_ne_different_que_par_le_code(): void
    {
        $corps = [];
        foreach (['used', 'expired', 'revoked'] as $mort) {
            [$jeton, $lien] = $this->lien($this->bailleur, 'property_visit.confirm', $this->visiteAConfirmer(['scheduled_at' => $this->creneau(3 + count($corps))]));
            $this->tuer($lien, $mort);
            $corps[$mort] = $this->getJson("/api/a/{$jeton}")->assertStatus(410)->json();
        }

        foreach ($corps as $mort => $json) {
            $this->assertSame(['code', 'message'], array_keys($json), $mort);
        }
    }

    #[DataProvider('morts')]
    public function test_un_lien_mort_rend_410_avant_toute_validation_du_corps(string $mort): void
    {
        [$jeton, $lien] = $this->lien($this->bailleur, 'property_visit.confirm', $this->visiteAConfirmer());
        $this->tuer($lien, $mort);

        $this->postJson("/api/a/{$jeton}", ['scheduled_at' => '2001-01-01T10:00:00Z', 'signature' => 'x'])
            ->assertStatus(410)
            ->assertExactJson(['code' => 'action_link.'.$mort, 'message' => __('errors.action_link.'.$mort)]);
    }

    public function test_un_jeton_inconnu_rend_404_avant_toute_validation_du_corps(): void
    {
        $this->postJson('/api/a/'.str_repeat('x', 43), ['scheduled_at' => '2001-01-01T10:00:00Z'])->assertNotFound();
    }

    public function test_un_jeton_inconnu_ou_mal_forme_rend_404(): void
    {
        $this->getJson('/api/a/'.str_repeat('x', 43))->assertNotFound();
        $this->postJson('/api/a/'.str_repeat('x', 43))->assertNotFound();
        $this->getJson('/api/a/court')->assertNotFound();
    }

    private function tuer(ActionLink $lien, string $mort): void
    {
        $lien->forceFill(match ($mort) {
            'used' => ['used_at' => now()],
            'revoked' => ['revoked_at' => now()],
            'expired' => ['expires_at' => now()->subMinute()],
        })->save();
    }
}
