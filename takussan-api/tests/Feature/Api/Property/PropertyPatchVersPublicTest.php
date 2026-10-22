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
 * P147.03 (TCK-1429) — un passage à `public` par le `PATCH` du bien est une publication : il
 * appelle `publish()`, comme `PUT …/visibility`. Avant, le `PATCH` rendait public un bien `sold`
 * que `publish` refuse, et écrivait un état « public » sans `published_at` : affiché public à la
 * console, absent du catalogue.
 */
class PropertyPatchVersPublicTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use PubliePret;
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create(['moderation_required' => false]);
        $this->agent = $this->agencyAgent($this->agency);
        $this->rendrePubliable($this->agent);
    }

    private function bien(PropertyStatus $status): Property
    {
        return Property::factory()->create([
            'user_id' => $this->agent->id,
            'agency_id' => $this->agency->id,
            'status' => $status,
            'visibility' => PropertyVisibility::Private,
            'published_at' => null,
            'title' => 'Avant',
        ]);
    }

    public function test_un_bien_vendu_ne_devient_pas_public_par_le_patch(): void
    {
        $bien = $this->bien(PropertyStatus::Sold);

        $this->actingAsApi($this->agent)
            ->patchJson("/api/properties/{$bien->id}", ['visibility' => 'public', 'title' => 'Après'])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'property.cannot_publish');

        $bien->refresh();
        $this->assertSame(PropertyVisibility::Private, $bien->visibility);
        $this->assertNull($bien->published_at);
        // Le refus annule le PATCH entier, pas seulement la publication.
        $this->assertSame('Avant', $bien->title);
    }

    public function test_un_brouillon_rendu_public_par_le_patch_est_publie(): void
    {
        $bien = $this->bien(PropertyStatus::Draft);

        $this->actingAsApi($this->agent)
            ->patchJson("/api/properties/{$bien->id}", ['visibility' => 'public', 'title' => 'Après'])
            ->assertOk()
            ->assertJsonPath('data.status', PropertyStatus::Available->value)
            ->assertJsonPath('data.visibility', PropertyVisibility::Public->value)
            ->assertJsonPath('data.title', 'Après');

        $bien->refresh();
        $this->assertNotNull($bien->published_at);
        $this->assertTrue(Property::query()->public()->whereKey($bien->id)->exists());
    }

    public function test_le_brouillon_du_bailleur_ne_devient_pas_public_par_le_patch(): void
    {
        $bailleur = User::factory()->withOwnerProfile($this->agency)->create();
        $this->rendrePubliable($bailleur);
        $bien = Property::factory()->create([
            'user_id' => $bailleur->id,
            'agency_id' => $this->agency->id,
            'status' => PropertyStatus::Draft,
            'visibility' => PropertyVisibility::Private,
            'published_at' => null,
        ]);

        $this->actingAsApi($bailleur)
            ->patchJson("/api/properties/{$bien->id}", ['status' => 'available', 'visibility' => 'public', 'accept_terms' => true])
            ->assertForbidden();

        $bien->refresh();
        $this->assertSame(PropertyVisibility::Private, $bien->visibility);
        $this->assertNull($bien->published_at);
    }

    public function test_renvoyer_public_sur_un_bien_deja_public_ne_republie_pas(): void
    {
        $bien = $this->bien(PropertyStatus::Available);
        $bien->forceFill(['visibility' => PropertyVisibility::Public, 'published_at' => now()->subDays(3)])->save();
        $publieLe = $bien->fresh()->published_at;

        $this->actingAsApi($this->agent)
            ->patchJson("/api/properties/{$bien->id}", ['visibility' => 'public', 'title' => 'Après'])
            ->assertOk();

        $this->assertTrue($publieLe->equalTo($bien->fresh()->published_at));
    }
}
