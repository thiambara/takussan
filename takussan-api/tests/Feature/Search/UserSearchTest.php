<?php

namespace Tests\Feature\Search;

use App\Models\Agency;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;
use Tests\Concerns\InteractsWithMeilisearch;

class UserSearchTest extends ApiTestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    public function test_user_search_is_typo_tolerant_for_agency_admin(): void
    {
        $agency = Agency::factory()->create();
        $this->actingAsRole('agency_admin', ['agency' => $agency]);

        User::factory()->create([
            'agency_id' => $agency->id,
            'first_name' => 'Amadou',
            'last_name' => 'Diallo',
        ]);
        $this->indexSearchable(User::class);

        $this->getJson('/api/users?filter[search]=Amadu')
            ->assertOk()
            ->assertJsonPath('meta.total', 1);
    }

    /**
     * AC1 — les trois utilisateurs sont créés dans l'ordre INVERSE de leur
     * pertinence : le `defaultSort('-created_at')` du contrôleur rendrait
     * l'ordre opposé.
     */
    public function test_user_search_ranks_by_relevance_not_by_date(): void
    {
        $agency = Agency::factory()->create();
        $this->actingAsRole('agency_admin', ['agency' => $agency]);

        $exact = User::factory()->create([
            'agency_id' => $agency->id,
            'last_name' => 'Ndiayefall',
            'created_at' => now()->subDays(3),
        ]);
        $oneTypo = User::factory()->create([
            'agency_id' => $agency->id,
            'last_name' => 'Ndiayefalt',
            'created_at' => now()->subDays(2),
        ]);
        $twoTypos = User::factory()->create([
            'agency_id' => $agency->id,
            'last_name' => 'Ndiayefaxt',
            'created_at' => now()->subDay(),
        ]);
        $this->indexSearchable(User::class);

        $ids = $this->getJson('/api/users?filter[search]=Ndiayefall&fields[users]=id,last_name')
            ->assertOk()
            ->assertJsonPath('meta.total', 3)
            ->json('data.*.id');

        $this->assertSame([$exact->id, $oneTypo->id, $twoTypos->id], $ids);
    }

    public function test_user_search_never_leaks_across_agencies(): void
    {
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $this->actingAsRole('agency_admin', ['agency' => $agencyA]);

        User::factory()->create(['agency_id' => $agencyA->id, 'last_name' => 'Crossagencyton']);
        User::factory()->create(['agency_id' => $agencyB->id, 'last_name' => 'Crossagencyton']);
        $this->indexSearchable(User::class);

        $response = $this->getJson('/api/users?filter[search]=Crossagencyton')->assertOk();

        $this->assertSame(1, $response->json('meta.total'));
    }

    public function test_soft_deleted_user_is_not_searchable(): void
    {
        $agency = Agency::factory()->create();
        $this->actingAsRole('agency_admin', ['agency' => $agency]);

        $user = User::factory()->create([
            'agency_id' => $agency->id,
            'last_name' => 'Ghostuserton',
        ]);
        $user->delete();
        $this->indexSearchable(User::class);

        $this->getJson('/api/users?filter[search]=Ghostuserton')
            ->assertOk()
            ->assertJsonPath('meta.total', 0);
    }

    /**
     * TCK-281 item 6 — `GET /api/agencies/{agency}/members` passe par
     * `User::buildQuery`, donc bascule sur Meilisearch avec ce ticket, et le
     * front lui envoie déjà `filter[search]`
     * (`takussan-web/src/lib/queries/agency-members.ts`). Aucun test ne le
     * couvrait : une régression y serait invisible jusqu'en production.
     */
    public function test_agency_members_search_goes_through_meilisearch(): void
    {
        $agency = Agency::factory()->create();
        $this->actingAsRole('agency_admin', ['agency' => $agency]);

        $member = User::factory()->create([
            'agency_id' => $agency->id,
            'last_name' => 'Membreunique',
        ]);
        User::factory()->create(['agency_id' => $agency->id, 'last_name' => 'Absentdici']);
        $this->indexSearchable(User::class);

        $ids = $this->getJson("/api/agencies/{$agency->id}/members?filter[search]=Membreuniqua")
            ->assertOk()
            ->json('data.*.id');

        $this->assertSame([$member->id], $ids);
    }

    /**
     * TCK-281 item 6 — même bascule pour l'équipe vue depuis la console
     * super-admin (`Admin\AgencyDetailController::team`). Ce contrôleur impose
     * son propre `orderBy(first_name)` sur la requête de base : la pertinence
     * ne s'y applique pas, seule la tolérance aux fautes change.
     */
    public function test_admin_agency_team_search_goes_through_meilisearch(): void
    {
        $agency = Agency::factory()->create();
        $this->actingAsRole('super_admin');

        $member = User::factory()->create([
            'agency_id' => $agency->id,
            'last_name' => 'Equipierunique',
        ]);
        User::factory()->create(['agency_id' => $agency->id, 'last_name' => 'Absentdici']);
        $this->indexSearchable(User::class);

        $ids = $this->getJson("/api/admin/agencies/{$agency->id}/team?filter[search]=Equipieruniqua")
            ->assertOk()
            ->json('data.*.id');

        $this->assertSame([$member->id], $ids);
    }
}
