<?php

namespace Tests\Feature\Agency;

use App\Models\Agency;
use App\Models\AgencyUpgradeRequest;
use App\Models\Enums\AgencyKind;
use App\Models\User;
use App\Services\Agency\AgencyKindFlipService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-1004 (P49.04) — ce que deviennent le nom et le slug d'un espace « Espace de {prénom} » passé
 * en professionnel. La fiche publique d'un bien lie `/agencies/{slug}` quel que soit le `kind`
 * (`PropertyAgentCard`) : l'ancienne adresse a pu circuler, la bascule garde donc le slug et le nom,
 * et l'admin peut changer le slug UNE fois, après la bascule.
 */
class AgencySlugAfterUpgradeTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{0: Agency, 1: User} */
    private function flippedAgency(): array
    {
        $admin = User::factory()->create(['first_name' => 'Awa']);
        $agency = Agency::factory()->individual()->create([
            'name' => 'Espace de Awa',
            'slug' => 'espace-de-awa',
            'primary_admin_id' => $admin->id,
            'metadata' => null,
        ]);
        $request = AgencyUpgradeRequest::factory()->pending()->create([
            'agency_id' => $agency->id,
            'submitted_by' => $admin->id,
            'company_legal_name' => 'Awa Immo SARL',
        ]);
        app(AgencyKindFlipService::class)->flip($request);

        return [$agency->fresh(), $admin];
    }

    public function test_the_flip_keeps_the_name_and_the_slug_and_opens_the_slug_once(): void
    {
        [$agency, $admin] = $this->flippedAgency();

        $this->assertSame(AgencyKind::Standard, $agency->kind);
        $this->assertSame('Espace de Awa', $agency->name);
        $this->assertSame('espace-de-awa', $agency->slug);
        $this->assertSame('Awa Immo SARL', $agency->legal_name);

        Sanctum::actingAs($admin);
        $this->getJson("/api/agencies/{$agency->id}")
            ->assertOk()
            ->assertJsonPath('data.slug', 'espace-de-awa')
            ->assertJsonPath('data.slug_editable', true);
    }

    public function test_the_admin_changes_the_slug_once_and_only_once(): void
    {
        [$agency, $admin] = $this->flippedAgency();
        Sanctum::actingAs($admin);

        $this->patchJson("/api/agencies/{$agency->id}", ['slug' => 'awa-immo', 'name' => 'Awa Immo'])
            ->assertOk()
            ->assertJsonPath('data.slug', 'awa-immo')
            ->assertJsonPath('data.slug_editable', false);
        $this->assertSame('awa-immo', $agency->fresh()->slug);
        $this->assertSame('Awa Immo', $agency->fresh()->name);
        $this->getJson('/api/public/agencies/awa-immo')->assertOk();

        $this->patchJson("/api/agencies/{$agency->id}", ['slug' => 'awa-immo-2'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('slug');
        $this->assertSame('awa-immo', $agency->fresh()->slug);
    }

    public function test_sending_the_current_slug_does_not_use_the_change(): void
    {
        [$agency, $admin] = $this->flippedAgency();
        Sanctum::actingAs($admin);

        $this->patchJson("/api/agencies/{$agency->id}", ['slug' => 'espace-de-awa', 'name' => 'Espace de Awa'])
            ->assertOk()
            ->assertJsonPath('data.slug_editable', true);
    }

    public function test_a_taken_or_malformed_slug_is_refused(): void
    {
        [$agency, $admin] = $this->flippedAgency();
        Agency::factory()->create(['slug' => 'deja-pris']);
        Sanctum::actingAs($admin);

        foreach (['deja-pris', 'Awa Immo', 'awa_immo', '-awa', ''] as $slug) {
            $this->patchJson("/api/agencies/{$agency->id}", ['slug' => $slug])
                ->assertUnprocessable()
                ->assertJsonValidationErrors('slug');
        }
        $this->assertSame('espace-de-awa', $agency->fresh()->slug);
        $this->assertTrue($agency->fresh()->slugEditableOnce());
    }

    public function test_the_slug_stays_closed_to_an_individual_or_a_never_flipped_agency(): void
    {
        $admin = User::factory()->create();
        $individual = Agency::factory()->individual()->create(['slug' => 'espace-de-moussa', 'primary_admin_id' => $admin->id]);
        $standard = Agency::factory()->create(['slug' => 'agence-ndiaye', 'primary_admin_id' => $admin->id, 'metadata' => null]);
        Sanctum::actingAs($admin);

        foreach ([$individual, $standard] as $agency) {
            $this->getJson("/api/agencies/{$agency->id}")->assertOk()->assertJsonPath('data.slug_editable', false);
            $this->patchJson("/api/agencies/{$agency->id}", ['slug' => 'nouveau-slug'])
                ->assertUnprocessable()
                ->assertJsonValidationErrors('slug');
        }
        $this->assertSame('espace-de-moussa', $individual->fresh()->slug);
        $this->assertSame('agence-ndiaye', $standard->fresh()->slug);
    }
}
