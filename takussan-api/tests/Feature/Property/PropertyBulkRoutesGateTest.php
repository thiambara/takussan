<?php

namespace Tests\Feature\Property;

use App\Models\Agency;
use App\Models\Enums\PropertyVisibility;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;

/**
 * TCK-817 (P22.02) — les trois routes de traitement en lot ne disent plus quels biens ni quels
 * comptes existent.
 *
 * Avant ce ticket, un compte auto-inscrit, sans agence, recevait 200 et un bilan qui séparait
 * `forbidden` (le bien existe) de `not_found` (il n'existe pas), ou un 422 sur `property_ids.0`
 * (`exists:properties,id`) et sur `user_id` (`exists:users,id`) : de quoi énumérer, par lots de 100
 * à 200, les identifiants de biens et de comptes de la plateforme.
 */
class PropertyBulkRoutesGateTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    private Property $notreBien;

    private Property $leurBien;

    private int $absent;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $this->agency = Agency::factory()->create();
        $this->agent = User::factory()->create();
        $this->materializeRoleProfile($this->agent, 'agent', $this->agency);

        $this->notreBien = Property::factory()->create(['agency_id' => $this->agency->id, 'visibility' => PropertyVisibility::Public]);
        $this->leurBien = Property::factory()->create(['agency_id' => Agency::factory()->create()->id, 'visibility' => PropertyVisibility::Public]);
        $this->absent = (int) Property::query()->max('id') + 1000;
    }

    /**
     * @return array<string, array{0: string, 1: array<string, mixed>}>
     */
    public static function routes(): array
    {
        return [
            'bulk-archive' => ['/api/properties/bulk-archive', []],
            'bulk-visibility' => ['/api/properties/bulk-visibility', ['visibility' => 'private']],
            'bulk-assign' => ['/api/properties/bulk-assign', ['user_id' => 'agent']],
        ];
    }

    /** @param  array<string, mixed>  $extra */
    private function corps(array $extra, array $ids): array
    {
        if (($extra['user_id'] ?? null) === 'agent') {
            $extra['user_id'] = $this->agent->id;
        }

        return ['property_ids' => $ids, ...$extra];
    }

    /** @param  array<string, mixed>  $extra */
    #[DataProvider('routes')]
    public function test_un_compte_sans_agence_est_refuse_avant_tout_bilan(string $route, array $extra): void
    {
        $inconnu = User::factory()->create();

        $this->actingAsApi($inconnu)
            ->postJson($route, $this->corps($extra, [$this->leurBien->id, $this->absent]))
            ->assertStatus(403);

        // Corps invalide : le refus prime, et aucun nom de champ ne sort.
        $this->actingAsApi($inconnu)
            ->postJson($route, [])
            ->assertStatus(403)
            ->assertJsonMissingPath('errors');
    }

    /** @param  array<string, mixed>  $extra */
    #[DataProvider('routes')]
    public function test_un_bien_d_une_autre_agence_et_un_identifiant_absent_ont_le_meme_motif(string $route, array $extra): void
    {
        $failed = $this->actingAsApi($this->agent)
            ->postJson($route, $this->corps($extra, [$this->leurBien->id, $this->absent]))
            ->assertOk()
            ->json('failed');

        $this->assertEqualsCanonicalizing([
            ['id' => $this->leurBien->id, 'reason' => 'not_found'],
            ['id' => $this->absent, 'reason' => 'not_found'],
        ], $failed);
    }

    public function test_une_cible_absente_et_une_cible_hors_de_l_agence_ont_la_meme_reponse(): void
    {
        $ailleurs = User::factory()->create();
        $this->materializeRoleProfile($ailleurs, 'agent', Agency::factory()->create());
        $absent = (int) User::query()->max('id') + 1000;

        $reponses = [];
        foreach ([$absent, $ailleurs->id] as $cible) {
            $reponses[] = $this->actingAsApi($this->agent)
                ->postJson('/api/properties/bulk-assign', ['property_ids' => [$this->notreBien->id], 'user_id' => $cible])
                ->assertStatus(422)
                ->assertJsonMissingPath('errors')
                ->assertJsonPath('code', 'user.not_in_active_agency')
                ->json();
        }

        $this->assertSame($reponses[0], $reponses[1]);
        $this->assertDatabaseMissing('property_collaborators', ['property_id' => $this->notreBien->id, 'user_id' => $ailleurs->id]);
    }
}
