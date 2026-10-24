<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\SettingScope;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2206 (P226.03) — deux identifiants de ligne cible reçus du client.
 *
 * - `POST /api/media` résolvait la cible par `findOrFail` avant l'autorisation : un identifiant
 *   absent rendait 404 là où une ligne tierce rendait 403. L'absent reçoit désormais le refus du
 *   tiers (règle de l'angle 62, TCK-1066 à TCK-1072).
 * - `StoreSettingRequest` comparait l'agence de l'appelant à `scope_id` en strict : envoyé en
 *   chaîne (`"12"`), il refusait l'admin de sa propre agence.
 */
class IdentifiantsCiblesDuClientTest extends TestCase
{
    use RefreshDatabase;

    private function media(int $modelId): TestResponse
    {
        return $this->postJson('/api/media', [
            'file' => UploadedFile::fake()->image('photo.jpg', 200, 200),
            'collection' => 'photos',
            'model_type' => Property::class,
            'model_id' => $modelId,
        ]);
    }

    public function test_un_media_vers_une_cible_absente_recoit_le_refus_du_tiers(): void
    {
        $tiers = Property::factory()->create(['agency_id' => Agency::factory()->create()->id]);
        Sanctum::actingAs(User::factory()->create());

        $refus = $this->media($tiers->id);
        $absent = $this->media(99999999);

        $this->assertSame(403, $refus->status());
        $this->assertSame([$refus->status(), $refus->json()], [$absent->status(), $absent->json()]);
    }

    public function test_l_admin_ecrit_le_reglage_de_son_agence_avec_un_scope_id_en_chaine(): void
    {
        $agence = Agency::factory()->create();
        $admin = User::factory()->create();
        $this->materializeRoleProfile($admin, 'agency_admin', $agence);
        Sanctum::actingAs($admin);

        $this->postJson('/api/settings', [
            'key' => 'lease.require_signature',
            'value' => ['value' => false],
            'scope' => SettingScope::Agency->value,
            'scope_id' => (string) $agence->id,
        ])->assertCreated();
    }

    /** Témoin : une autre agence, en chaîne comme en entier, reste refusée. */
    public function test_le_reglage_d_une_autre_agence_reste_refuse(): void
    {
        $agence = Agency::factory()->create();
        $autre = Agency::factory()->create();
        $admin = User::factory()->create();
        $this->materializeRoleProfile($admin, 'agency_admin', $agence);
        Sanctum::actingAs($admin);

        foreach ([$autre->id, (string) $autre->id] as $scopeId) {
            $this->postJson('/api/settings', [
                'key' => 'lease.require_signature',
                'value' => ['value' => false],
                'scope' => SettingScope::Agency->value,
                'scope_id' => $scopeId,
            ])->assertForbidden();
        }
    }
}
