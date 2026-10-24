<?php

namespace Tests\Feature\WizardDraft;

use App\Http\Requests\UpsertWizardDraftRequest;
use App\Models\User;
use App\Models\WizardDraft;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-2001 (P181.03) — un brouillon d'assistant est borné à 256 Kio (`json_encode` de `data`), et un
 * compte à 20 brouillons : la 21ᵉ clé est refusée, la mise à jour d'une clé existante non.
 */
class WizardDraftBornesTest extends TestCase
{
    use RefreshDatabase;

    /** Un `data` dont `json_encode` fait exactement `$octets` octets. */
    private function donnees(int $octets): array
    {
        return ['x' => str_repeat('a', $octets - strlen('{"x":""}'))];
    }

    public function test_un_brouillon_au_dela_de_256_kio_est_refuse(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->putJson('/api/me/wizard-drafts/lease-wizard', ['step' => 1, 'data' => $this->donnees(256 * 1024 + 1)])
            ->assertStatus(422)
            ->assertJsonValidationErrors('data');
        $this->assertSame(0, WizardDraft::query()->count());

        $this->actingAs($user)
            ->putJson('/api/me/wizard-drafts/lease-wizard', ['step' => 1, 'data' => $this->donnees(256 * 1024)])
            ->assertCreated();
    }

    public function test_la_vingt_et_unieme_cle_est_refusee_mais_une_cle_existante_se_met_a_jour(): void
    {
        $user = User::factory()->create();
        foreach (range(1, UpsertWizardDraftRequest::MAX_BROUILLONS) as $i) {
            WizardDraft::query()->create(['user_id' => $user->id, 'key' => "cle-{$i}", 'step' => 0, 'data' => []]);
        }
        // Les brouillons d'un autre compte ne comptent pas.
        WizardDraft::query()->create(['user_id' => User::factory()->create()->id, 'key' => 'autre', 'step' => 0, 'data' => []]);

        $this->actingAs($user)
            ->putJson('/api/me/wizard-drafts/cle-21', ['step' => 0, 'data' => []])
            ->assertStatus(422)
            ->assertJsonValidationErrors('key');
        $this->assertSame(20, WizardDraft::query()->where('user_id', $user->id)->count());

        $this->actingAs($user)
            ->putJson('/api/me/wizard-drafts/cle-3', ['step' => 2, 'data' => ['a' => 1]])
            ->assertOk();
    }
}
