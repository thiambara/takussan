<?php

namespace Tests\Feature\Api\Property;

use App\Models\Agency;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\Support\PubliePret;

/**
 * P147.02 (TCK-1431) — archiver par le `PATCH` du bien, et en sortir, écrit les mêmes colonnes que
 * `PUT …/status` : les deux passent par `PropertyPublication`. Avant, le `PATCH` n'écrivait que le
 * statut : le bien archivé restait public et publié, et un retour à `available` le remettait au
 * catalogue sans republication.
 */
class PropertyArchivageParPatchTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use PubliePret;
    use RefreshDatabase;

    private const COLONNES = ['status', 'visibility', 'published_at', 'archived_at'];

    private Agency $agency;

    private User $agent;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create(['moderation_required' => false]);
        $this->agent = $this->agencyAgent($this->agency);
        $this->rendrePubliable($this->agent);
        $this->actingAsApi($this->agent);
    }

    private function bienEnLigne(): Property
    {
        return Property::factory()->create([
            'user_id' => $this->agent->id,
            'agency_id' => $this->agency->id,
            'status' => PropertyStatus::Available,
            'visibility' => PropertyVisibility::Public,
            'published_at' => now()->subDay(),
            'archived_at' => null,
        ]);
    }

    /**
     * Les colonnes écrites, `archived_at` réduit à posé/nul (l'heure diffère d'un appel à l'autre).
     *
     * @return array<string, mixed>
     */
    private function colonnes(Property $bien): array
    {
        $bien->refresh();

        return [
            'status' => $bien->status,
            'visibility' => $bien->visibility,
            'published_at' => $bien->published_at?->toIso8601String(),
            'archived_at' => $bien->archived_at !== null,
        ];
    }

    public function test_archiver_par_le_patch_ecrit_ce_qu_ecrit_put_status(): void
    {
        $parPatch = $this->bienEnLigne();
        $parPut = $this->bienEnLigne();

        $this->patchJson("/api/properties/{$parPatch->id}", ['status' => 'archived'])->assertOk();
        $this->putJson("/api/properties/{$parPut->id}/status", ['status' => 'archived'])->assertOk();

        $this->assertSame($this->colonnes($parPut), $this->colonnes($parPatch));
        $this->assertSame([
            'status' => PropertyStatus::Archived,
            'visibility' => PropertyVisibility::Private,
            'published_at' => null,
            'archived_at' => true,
        ], $this->colonnes($parPatch));
    }

    public function test_sortir_d_archive_par_le_patch_ecrit_ce_qu_ecrit_put_status(): void
    {
        $parPatch = $this->bienEnLigne();
        $parPut = $this->bienEnLigne();
        $this->putJson("/api/properties/{$parPatch->id}/status", ['status' => 'archived'])->assertOk();
        $this->putJson("/api/properties/{$parPut->id}/status", ['status' => 'archived'])->assertOk();

        $this->patchJson("/api/properties/{$parPatch->id}", ['status' => 'unavailable'])->assertOk();
        $this->putJson("/api/properties/{$parPut->id}/status", ['status' => 'unavailable'])->assertOk();

        $this->assertSame($this->colonnes($parPut), $this->colonnes($parPatch));
        $this->assertFalse($this->colonnes($parPatch)['archived_at']);
    }

    public function test_un_bien_archive_par_le_patch_ne_revient_pas_au_catalogue_sans_republication(): void
    {
        $bien = $this->bienEnLigne();

        $this->patchJson("/api/properties/{$bien->id}", ['status' => 'archived'])->assertOk();
        $this->patchJson("/api/properties/{$bien->id}", ['status' => 'available'])->assertOk();

        $this->assertFalse(Property::query()->public()->whereKey($bien->id)->exists());
    }
}
