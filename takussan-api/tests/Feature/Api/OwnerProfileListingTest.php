<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Profiles\OwnerProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * TCK-284 — `GET /api/owners` et la restriction `kind`.
 *
 * TCK-256 avait décidé que le carnet de propriétaires est réservé aux
 * agences `standard` — dans une agence `individual`, le propriétaire est le
 * créateur du compte lui-même. La décision n'avait été tenue que sur
 * l'invitation (`OwnerProfilePolicy::invite`) et sur l'écran Next : la
 * LECTURE de la liste restait ouverte au `curl`.
 *
 * Ces tests fixent les deux bords de la garde : elle refuse les acteurs
 * d'une agence `individual`, et elle ne refuse personne d'autre.
 */
class OwnerProfileListingTest extends ApiTestCase
{
    use RefreshDatabase;

    public function test_standard_agency_admin_lists_owners(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        $mine = OwnerProfile::factory()->count(2)->create(['agency_id' => $agency->id]);
        $autre = OwnerProfile::factory()->create();

        $response = $this->apiGet('/api/owners')->assertOk();

        // Pas de `meta.total` en dur : l'observer de `User` matérialise déjà un
        // OwnerProfile pour l'acteur lui-même (TCK-142), donc le compte exact
        // dépend du harnais. On vérifie la PROPRIÉTÉ : mes propriétaires sont
        // là, ceux d'une autre agence n'y sont pas.
        $ids = collect($response->json('data'))->pluck('id')->all();
        foreach ($mine as $profil) {
            $this->assertContains($profil->id, $ids);
        }
        $this->assertNotContains($autre->id, $ids);
    }

    public function test_individual_agency_admin_receives_403(): void
    {
        $agency = Agency::factory()->individual()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        OwnerProfile::factory()->create(['agency_id' => $agency->id]);

        $this->apiGet('/api/owners')->assertForbidden();

        $agency->update(['kind' => AgencyKind::Standard]);

        $this->apiGet('/api/owners')->assertOk();
    }

    /**
     * `viewAny` autorise aussi les agents : la garde doit valoir pour eux,
     * sinon elle laisse un chemin ouvert sur la même donnée.
     */
    public function test_individual_agency_agent_receives_403(): void
    {
        $agency = Agency::factory()->individual()->create();
        $this->apiActingAsRole('agent', ['agency' => $agency]);

        $this->apiGet('/api/owners')->assertForbidden();
    }

    /**
     * AC3 — le bord opposé : hors du périmètre tranché, rien ne change.
     * Un agent d'agence `standard` lit toujours la liste.
     */
    public function test_standard_agency_agent_is_not_refused(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agent', ['agency' => $agency]);

        OwnerProfile::factory()->create(['agency_id' => $agency->id]);

        $this->apiGet('/api/owners')->assertOk();
    }

    /**
     * Le super-admin est transverse par construction : il opère sur
     * n'importe quelle agence quel que soit son `kind`
     * (cf. `AgencyKindGuard::ensureStandardForNonGlobal`).
     */
    public function test_super_admin_is_not_locked_by_agency_kind(): void
    {
        $agency = Agency::factory()->individual()->create();
        $this->apiActingAsRole('super_admin', ['agency' => $agency]);

        OwnerProfile::factory()->create(['agency_id' => $agency->id]);

        $this->apiGet('/api/owners')->assertOk();
    }
}
