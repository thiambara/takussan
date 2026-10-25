<?php

namespace Tests\Feature\Api;

use App\Http\Resources\PayoutResource;
use App\Http\Resources\PropertyResource;
use App\Models\Agency;
use App\Models\Enums\CollaboratorRole;
use App\Models\Enums\ReferentialStatus;
use App\Models\Enums\TagType;
use App\Models\GeoNeighborhood;
use App\Models\Payout;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\Tag;
use App\Models\User;
use App\Services\Payout\OwnerStatementService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Tests\TestCase;

/**
 * P235.02 (TCK-2369) — les lecteurs de l'API qui recomposaient le nom d'un compte à la main
 * (`trim(first_name.' '.last_name) ?: username`, ou sans repli) rendaient `''` ou `null` pour un
 * compte sans nom ni `username` (compte créé par téléphone) ; ils passent par
 * `User::nameWithoutContact()` : nom, puis `username`, puis « — », jamais une coordonnée.
 */
class NomsVidesDesLecteursTest extends TestCase
{
    use RefreshDatabase;

    private function sansNom(): User
    {
        return User::factory()->create(['first_name' => '', 'last_name' => '', 'username' => null]);
    }

    public function test_le_preparateur_d_un_reversement(): void
    {
        $payout = Payout::factory()->create(['issued_by_id' => $this->sansNom()->id]);

        $data = PayoutResource::make($payout->load('issuer'))->resolve(Request::create('/'));

        $this->assertSame('—', $data['issuer']['name']);
    }

    public function test_le_proprietaire_et_les_collaborateurs_d_un_bien(): void
    {
        $property = Property::factory()->create(['user_id' => $this->sansNom()->id]);
        PropertyCollaborator::query()->create(['property_id' => $property->id, 'user_id' => $this->sansNom()->id, 'role' => CollaboratorRole::Agent]);

        $data = PropertyResource::make($property->load(['owner', 'collaborators.user']))->resolve(Request::create('/'));

        $this->assertSame('—', $data['owner']['name']);
        $this->assertSame('—', $data['collaborators'][0]['user']['name']);
    }

    public function test_un_username_reste_le_repli_avant_le_tiret(): void
    {
        $property = Property::factory()->create(['user_id' => User::factory()->create(['first_name' => '', 'last_name' => '', 'username' => 'awa-diop'])->id]);

        $data = PropertyResource::make($property->load('owner'))->resolve(Request::create('/'));

        $this->assertSame('awa-diop', $data['owner']['name']);
    }

    public function test_le_bailleur_du_releve_de_gerance(): void
    {
        $landlord = $this->sansNom();

        $statement = app(OwnerStatementService::class)->statement(Agency::factory()->create(), $landlord, '2026-06');

        $this->assertSame('—', $statement['landlord']['name']);
    }

    public function test_l_auteur_d_un_equipement_et_d_un_quartier_proposes(): void
    {
        $this->actingAsRole('super_admin');
        $tag = Tag::factory()->create([
            'name' => 'Jacuzzi', 'type' => TagType::Amenity, 'status' => ReferentialStatus::Pending, 'created_by_id' => $this->sansNom()->id,
        ]);
        $quartier = GeoNeighborhood::factory()->pending($this->sansNom())->create();

        $this->postJson("/api/admin/tags/{$tag->id}/approve")->assertOk()->assertJsonPath('data.created_by.name', '—');
        $this->postJson("/api/admin/geo/neighborhoods/{$quartier->id}/approve")->assertOk()->assertJsonPath('data.created_by.name', '—');
    }
}
