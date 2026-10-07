<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\Enums\AgencyAdminProfileStatus;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\Capability;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\User;
use App\Notifications\PropertyProposedNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-587 (ADR-0031 §2) — les gestes sur un bien jugés par leur capacité.
 *
 * Avant ce ticket : `store` n'autorisait rien (tout compte authentifié créait un bien), `destroy`,
 * `publish` et `unpublish` réutilisaient `update`, et `update` accordait l'auteur ou n'importe quel
 * membre de l'agence. `properties.create|delete|publish|update_own` n'avaient aucun lecteur.
 */
class PropertyAuthorizationTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
    }

    /** @return array<string, mixed> */
    private function payload(array $extra = []): array
    {
        return array_merge([
            'title' => 'Villa aux Almadies',
            'type' => 'apartment',
            'contract_type' => 'rent',
            'rent_period' => 'monthly',
            'price' => 450000,
        ], $extra);
    }

    // ─── AC3 — créer, proposer ───────────────────────────────────

    public function test_un_compte_sans_profil_ne_cree_pas_de_bien(): void
    {
        $this->actingAsApi(User::factory()->create())
            ->postJson('/api/properties', $this->payload())
            ->assertForbidden();

        $this->assertSame(0, Property::query()->count());
    }

    public function test_le_refus_precede_la_validation(): void
    {
        $this->actingAsApi(User::factory()->create())
            ->postJson('/api/properties', ['price' => -1])
            ->assertForbidden();
    }

    public function test_un_agent_cree_un_bien_de_l_agence(): void
    {
        $this->actingAsApi($this->agencyAgent($this->agency))
            ->postJson('/api/properties', $this->payload(['status' => 'available', 'visibility' => 'public']))
            ->assertCreated()
            ->assertJsonPath('data.status', 'available')
            ->assertJsonPath('data.visibility', 'public');
    }

    public function test_le_bailleur_propose_un_brouillon_prive_quel_que_soit_le_corps(): void
    {
        $bailleur = User::factory()->withOwnerProfile($this->agency)->create();

        $id = $this->actingAsApi($bailleur)
            ->postJson('/api/properties', $this->payload(['status' => 'available', 'visibility' => 'public']))
            ->assertCreated()
            ->assertJsonPath('data.status', PropertyStatus::Draft->value)
            ->assertJsonPath('data.visibility', PropertyVisibility::Private->value)
            ->json('data.id');

        $property = Property::query()->findOrFail($id);
        $this->assertSame($this->agency->id, (int) $property->agency_id);
        $this->assertSame($bailleur->id, (int) $property->user_id);
    }

    public function test_le_bailleur_ne_publie_pas_sa_proposition_par_aucun_des_trois_chemins(): void
    {
        $bailleur = User::factory()->withOwnerProfile($this->agency)->create();
        $this->actingAsApi($bailleur);

        $id = $this->postJson('/api/properties', $this->payload())->assertCreated()->json('data.id');

        $this->postJson("/api/properties/{$id}/publish")->assertForbidden();
        $this->putJson("/api/properties/{$id}/visibility", ['visibility' => 'public'])->assertForbidden();
        $this->putJson("/api/properties/{$id}/status", ['status' => 'available'])->assertForbidden();

        $property = Property::query()->findOrFail($id);
        $this->assertSame(PropertyStatus::Draft, $property->status);
        $this->assertSame(PropertyVisibility::Private, $property->visibility);

        // Il garde la main sur son brouillon : le modifier n'est pas le publier.
        $this->patchJson("/api/properties/{$id}", ['title' => 'Villa rénovée'])->assertOk();
    }

    public function test_chaque_admin_actif_est_notifie_une_fois_et_l_admin_suspendu_jamais(): void
    {
        $actif1 = $this->agencyAdmin($this->agency);
        $actif2 = $this->agencyAdmin($this->agency);
        $suspendu = User::factory()->create();
        AgencyAdminProfile::factory()->create([
            'user_id' => $suspendu->id,
            'agency_id' => $this->agency->id,
            'status' => AgencyAdminProfileStatus::Suspended,
        ]);
        $ailleurs = $this->agencyAdmin(Agency::factory()->create());

        $id = $this->actingAsApi(User::factory()->withOwnerProfile($this->agency)->create())
            ->postJson('/api/properties', $this->payload())
            ->assertCreated()
            ->json('data.id');

        foreach ([$actif1, $actif2] as $admin) {
            $notifications = AppNotification::query()->where('user_id', $admin->id)->get();
            $this->assertCount(1, $notifications);
            $this->assertSame(PropertyProposedNotification::TYPE, $notifications->first()->data['type']);
            $this->assertSame($id, $notifications->first()->data['property_id']);
        }
        $this->assertSame(0, AppNotification::query()->where('user_id', $suspendu->id)->count());
        $this->assertSame(0, AppNotification::query()->where('user_id', $ailleurs->id)->count());
    }

    public function test_un_bien_cree_par_le_personnel_ne_notifie_personne(): void
    {
        $admin = $this->agencyAdmin($this->agency);

        $this->actingAsApi($this->agencyAgent($this->agency))
            ->postJson('/api/properties', $this->payload())
            ->assertCreated();

        $this->assertSame(0, AppNotification::query()->where('user_id', $admin->id)->count());
    }

    public function test_un_role_sans_properties_create_ne_cree_pas(): void
    {
        // Un agent sans la capacité n'est pas bailleur : il ne propose pas, il est refusé.
        $this->actingAsApi($this->agentWithout($this->agency, Capability::PropertiesCreate))
            ->postJson('/api/properties', $this->payload())
            ->assertForbidden();
    }

    // ─── AC4 — supprimer, modifier le bien d'un autre, publier ───

    public function test_l_agent_du_role_systeme_ne_supprime_ni_ne_modifie_le_bien_d_un_collegue(): void
    {
        $collegue = $this->agencyAgent($this->agency);
        $property = Property::factory()->create(['user_id' => $collegue->id, 'agency_id' => $this->agency->id]);

        $this->actingAsApi($this->agencyAgent($this->agency));
        $this->deleteJson("/api/properties/{$property->id}")->assertForbidden();
        $this->patchJson("/api/properties/{$property->id}", ['title' => 'Repris'])->assertForbidden();
        $this->assertNotSoftDeleted($property);

        $this->actingAsApi($this->agencyAdmin($this->agency));
        $this->patchJson("/api/properties/{$property->id}", ['title' => 'Repris'])->assertOk();
        $this->deleteJson("/api/properties/{$property->id}")->assertStatus(204);
        $this->assertSoftDeleted($property);
    }

    /**
     * `destroy` réutilisait `update` : l'agent du rôle système supprimait son propre bien, et le
     * bailleur le sien, sans tenir `properties.delete`. Ce cas est celui qui distingue les deux
     * abilities — sur le bien d'un collègue, `update` refusait déjà (`update_any`).
     */
    public function test_supprimer_son_propre_bien_exige_properties_delete(): void
    {
        $agent = $this->agencyAgent($this->agency);
        $sien = Property::factory()->create(['user_id' => $agent->id, 'agency_id' => $this->agency->id]);
        $this->actingAsApi($agent)->deleteJson("/api/properties/{$sien->id}")->assertForbidden();

        $bailleur = User::factory()->withOwnerProfile($this->agency)->create();
        $leSien = Property::factory()->create(['user_id' => $bailleur->id, 'agency_id' => $this->agency->id]);
        $this->actingAsApi($bailleur)->deleteJson("/api/properties/{$leSien->id}")->assertForbidden();

        $this->assertNotSoftDeleted($sien);
        $this->assertNotSoftDeleted($leSien);
    }

    public function test_sans_properties_update_own_l_agent_ne_modifie_pas_son_propre_bien(): void
    {
        $agent = $this->agentWithout($this->agency, Capability::PropertiesUpdateOwn);
        $property = Property::factory()->create(['user_id' => $agent->id, 'agency_id' => $this->agency->id]);

        $this->actingAsApi($agent)
            ->patchJson("/api/properties/{$property->id}", ['title' => 'Repris'])
            ->assertForbidden();

        $this->actingAsApi($this->agencyAgent($this->agency));
        $mine = Property::factory()->create(['user_id' => auth('sanctum')->id(), 'agency_id' => $this->agency->id]);
        $this->patchJson("/api/properties/{$mine->id}", ['title' => 'Repris'])->assertOk();
    }

    /** @return array<string, array{string, string, array<string, mixed>}> */
    public static function cheminsDePublication(): array
    {
        return [
            'publish' => ['POST', 'publish', []],
            'visibilité → public' => ['PUT', 'visibility', ['visibility' => 'public']],
            'statut → available' => ['PUT', 'status', ['status' => 'available']],
            'statut → published' => ['PUT', 'status', ['status' => 'published']],
        ];
    }

    /** @param  array<string, mixed>  $body */
    #[DataProvider('cheminsDePublication')]
    public function test_sans_properties_publish_aucun_chemin_ne_publie(string $method, string $path, array $body): void
    {
        $agent = $this->agentWithout($this->agency, Capability::PropertiesPublish);
        $property = Property::factory()->create([
            'user_id' => $agent->id,
            'agency_id' => $this->agency->id,
            'status' => PropertyStatus::Draft,
            'visibility' => PropertyVisibility::Private,
        ]);

        $this->actingAsApi($agent)
            ->json($method, "/api/properties/{$property->id}/{$path}", $body)
            ->assertForbidden();

        // Le rôle système, lui, publie par chacun des chemins.
        $systeme = $this->agencyAgent($this->agency);
        $sien = Property::factory()->create([
            'user_id' => $systeme->id,
            'agency_id' => $this->agency->id,
            'status' => PropertyStatus::Draft,
            'visibility' => PropertyVisibility::Private,
        ]);
        $this->actingAsApi($systeme)
            ->json($method, "/api/properties/{$sien->id}/{$path}", $body)
            ->assertOk();
    }

    public function test_sans_properties_publish_les_autres_statuts_restent_ouverts(): void
    {
        $agent = $this->agentWithout($this->agency, Capability::PropertiesPublish);
        $property = Property::factory()->create(['user_id' => $agent->id, 'agency_id' => $this->agency->id]);

        $this->actingAsApi($agent)
            ->putJson("/api/properties/{$property->id}/status", ['status' => 'archived'])
            ->assertOk();
    }

    // ─── AC5b — réassigner le bien ───────────────────────────────

    public function test_le_bien_ne_se_reassigne_qu_au_personnel_actif_de_l_agence(): void
    {
        $b1 = User::factory()->withOwnerProfile($this->agency)->create();
        $b2 = User::factory()->withOwnerProfile($this->agency)->create();
        $property = Property::factory()->create(['user_id' => $b1->id, 'agency_id' => $this->agency->id]);

        $this->actingAsApi($b1)
            ->putJson("/api/properties/{$property->id}/assigned-agent", ['user_id' => $b2->id])
            ->assertStatus(422);
        $this->assertSame($b1->id, (int) $property->fresh()->user_id);

        $suspendu = User::factory()->create();
        AgentProfile::factory()->create([
            'user_id' => $suspendu->id,
            'agency_id' => $this->agency->id,
            'status' => AgentProfileStatus::Suspended,
        ]);
        $this->putJson("/api/properties/{$property->id}/assigned-agent", ['user_id' => $suspendu->id])
            ->assertStatus(422);
        $this->assertSame($b1->id, (int) $property->fresh()->user_id);

        $agent = $this->agencyAgent($this->agency);
        $this->putJson("/api/properties/{$property->id}/assigned-agent", ['user_id' => $agent->id])
            ->assertOk();
        $this->assertSame($agent->id, (int) $property->fresh()->user_id);
    }
}
