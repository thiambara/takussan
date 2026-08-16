<?php

namespace Tests\Feature\Media;

use App\Models\Agency;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;

/**
 * TCK-290 — Upload du logo d'agence via `POST /api/media`.
 *
 * Avant ce ticket, `MediaController::authorizeAttach` ne trouvait aucune
 * policy pour `Agency` et retombait sur sa branche « propriétaire seulement » :
 * une `Agency` n'est pas un `User` et n'a pas de colonne `user_id` (elle a
 * `primary_admin_id`), donc `abort(403)` inconditionnel — y compris pour un
 * super-admin, puisque cette branche ne consulte jamais la Gate et n'atteint
 * donc pas le bypass `Gate::before`.
 *
 * Ces tests pinnent la règle d'accès, qui doit rester MOT POUR MOT celle
 * d'`AgencyController::update` : super-admin, ou `primary_admin_id`, ou
 * (profil actif SUR l'agence cible ET `AgencyAdminProfile` sur cette agence).
 */
class AgencyLogoUploadTest extends ApiTestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
    }

    public function test_agency_admin_can_upload_own_agency_logo(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        $this->postLogo($agency)
            ->assertCreated()
            ->assertJsonPath('data.collection_name', 'logo')
            ->assertJsonPath('data.model_type', Agency::class)
            ->assertJsonPath('data.model_id', $agency->id);

        $this->assertDatabaseCount('media', 1);
    }

    public function test_agency_admin_of_another_agency_is_forbidden(): void
    {
        $cible = Agency::factory()->create();
        $autre = Agency::factory()->create();

        $this->apiActingAsRole('agency_admin', ['agency' => $autre]);

        $this->postLogo($cible)->assertForbidden();

        $this->assertDatabaseCount('media', 0);
    }

    public function test_unrelated_user_is_forbidden(): void
    {
        $agency = Agency::factory()->create();
        Sanctum::actingAs(User::factory()->create());

        $this->postLogo($agency)->assertForbidden();

        $this->assertDatabaseCount('media', 0);
    }

    /**
     * Le compte fondateur : `AgencyController::store` pose `primary_admin_id`
     * sans matérialiser le moindre profil. Il peut faire `PATCH /api/agencies`,
     * il doit donc pouvoir téléverser le logo — c'est la moitié de la règle
     * qu'une implémentation par `Capability::AgencyUpdate` perdrait en silence.
     */
    public function test_primary_admin_without_admin_profile_can_upload_logo(): void
    {
        $admin = User::factory()->create();
        $agency = Agency::factory()->create(['primary_admin_id' => $admin->id]);

        Sanctum::actingAs($admin);

        $this->postLogo($agency)->assertCreated();

        $this->assertDatabaseCount('media', 1);
    }

    /**
     * Cas qui échouait AVANT le correctif : la branche de repli de
     * `authorizeAttach` n'atteint jamais `Gate::before`, donc le 403 ne
     * visait pas que les admins d'agence.
     */
    public function test_super_admin_can_upload_any_agency_logo(): void
    {
        $this->apiActingAsRole('super_admin');
        $agency = Agency::factory()->create();

        $this->postLogo($agency)->assertCreated();

        $this->assertDatabaseCount('media', 1);
    }

    /**
     * Garde du contrat strict TCK-146, et garde anti-implémentation-par-capacité.
     *
     * Bob est `agency_admin` chez Y et agent chez X et Y. Il agit sous son
     * profil X et vise Y : refusé, exactement comme `PUT /api/agencies/{Y}`.
     * `MembershipCapabilityResolver` n'exige PAS la correspondance de profil
     * actif ; une policy écrite sur `Capability::AgencyUpdate` autoriserait
     * ce cas sans qu'aucun autre test ne s'en aperçoive.
     */
    public function test_admin_acting_under_another_agency_profile_is_forbidden(): void
    {
        $bob = User::factory()->create();
        $agencyX = Agency::factory()->create();
        $agencyY = Agency::factory()->create();

        $agentX = AgentProfile::factory()->create(['user_id' => $bob->id, 'agency_id' => $agencyX->id]);
        AgentProfile::factory()->create(['user_id' => $bob->id, 'agency_id' => $agencyY->id]);

        $this->materializeRoleProfile($bob, 'agency_admin', $agencyY);

        Sanctum::actingAs($bob);

        $this->postLogo($agencyY, ['X-Profile-Id' => "agent:{$agentX->id}"])
            ->assertForbidden();

        $this->assertDatabaseCount('media', 0);
    }

    /**
     * AC3 — la règle est écrite UNE fois. Ce test, et non un commentaire,
     * est ce qui empêche les deux définitions de « qui administre cette
     * agence » de diverger à nouveau : pour un acteur AUTORISÉ, l'upload du
     * logo et la mise à jour de l'agence doivent être d'accord.
     */
    public function test_logo_upload_and_agency_update_agree_for_authorized_actors(): void
    {
        // Admin d'agence, profil actif aligné.
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $this->assertAgree($agency);

        // Fondateur (`primary_admin_id`), sans aucun profil.
        $fondateur = User::factory()->create();
        $sienne = Agency::factory()->create(['primary_admin_id' => $fondateur->id]);
        Sanctum::actingAs($fondateur);
        $this->assertAgree($sienne);
    }

    /**
     * AC3, versant refus — mêmes acteurs des deux côtés, même verdict.
     */
    public function test_logo_upload_and_agency_update_agree_for_denied_actors(): void
    {
        // Admin d'une AUTRE agence.
        $cible = Agency::factory()->create();
        $autre = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $autre]);
        $this->assertAgree($cible);

        // Utilisateur sans aucun lien.
        Sanctum::actingAs(User::factory()->create());
        $this->assertAgree($cible);
    }

    /**
     * Asserte que `POST /api/media` et `PATCH /api/agencies/{id}` rendent le
     * même verdict (autorisé / refusé) pour l'acteur courant.
     *
     * @param  array<string,string>  $headers
     */
    private function assertAgree(Agency $agency, array $headers = []): void
    {
        $upload = $this->postLogo($agency, $headers)->getStatusCode();
        $update = $this->patchJson("/api/agencies/{$agency->id}", ['name' => 'Nom revu'], $headers)
            ->getStatusCode();

        $this->assertSame(
            $upload < 400,
            $update < 400,
            "POST /api/media a rendu {$upload} et PATCH /api/agencies/{$agency->id} a rendu {$update} ".
            'pour le même acteur : les deux définitions de « qui administre cette agence » ont divergé.'
        );
    }

    /**
     * @param  array<string,string>  $headers
     */
    private function postLogo(Agency $agency, array $headers = []): TestResponse
    {
        return $this->postJson('/api/media', [
            'file' => UploadedFile::fake()->image('logo.png', 400, 400),
            'collection' => 'logo',
            'model_type' => Agency::class,
            'model_id' => $agency->id,
        ], $headers);
    }
}
