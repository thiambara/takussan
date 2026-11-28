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

    /**
     * TCK-462 — **l'acteur est une ligne comme les autres, et il est indexé comme les autres.**
     *
     * `actingAsRole('agency_admin', ['agency' => $agency])` crée un utilisateur DANS l'agence
     * cherchée, que `indexSearchable(User::class)` pousse dans Meilisearch au même titre que les
     * cibles du test. Son nom vient de la fabrique — donc d'un tirage, et d'un tirage qui n'est
     * même pas le même partout : `APP_FAKER_LOCALE` vaut `en_US` dans le `.env` de la machine et
     * `fr_FR` dans le `.env.example` que la CI recopie (`api-ci.yml`). *Un total compté sur un nom
     * tiré au hasard n'affirme rien du code ; il affirme que le tirage a été clément.*
     *
     * Ces deux valeurs sont hors d'atteinte de la tolérance aux fautes de Meilisearch pour toutes
     * les requêtes de ce fichier — et elles sont ÉCRITES, donc elles ne peuvent plus changer sans
     * qu'on le décide.
     *
     * **TCK-462 D3 — le remède n'a délibérément PAS été porté dans `actingAsRole`.** Mesuré le
     * 2026-08-29 : **313 sites d'appel dans 51 fichiers**, et **26 assertions** de la suite
     * portent sur `first_name`/`last_name`. Un nom fixe posé par défaut changerait donc le
     * peuplement de 313 tests d'un coup pour en réparer quatre, et ferait de ce nom partagé une
     * nouvelle source de collisions — d'unicité, et de recherche EXACTE, où deux acteurs
     * homonymes sont pires qu'un acteur au nom tiré. *Le remède le plus large n'est pas le plus
     * sûr : ici il déplacerait le tirage au lieu de le supprimer.* La correction reste donc au
     * point d'exposition, qui est le seul endroit où l'on sait ce qui est cherché.
     */
    private const ACTEUR_HORS_ATTEINTE = ['first_name' => 'Zulqarnayn', 'last_name' => 'Wxyzptlk'];

    /**
     * AC1 — les trois utilisateurs sont créés dans l'ordre INVERSE de leur
     * pertinence : le `defaultSort('-created_at')` du contrôleur rendrait
     * l'ordre opposé.
     *
     * TCK-462 — l'acteur porte un nom hors d'atteinte : sans cela, `Ndiayefall` compte 3 tant
     * que la fabrique reste clémente. Reproduit le 2026-08-29 en nommant l'admin `Ndiayefall` :
     * *« Failed asserting that 4 is identical to 3 »*.
     */
    public function test_user_search_ranks_by_relevance_not_by_date(): void
    {
        $agency = Agency::factory()->create();
        $this->actingAsRole('agency_admin', ['agency' => $agency, ...self::ACTEUR_HORS_ATTEINTE]);

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

    /**
     * TCK-462 — `Crossagencyton` est une chaîne inventée, donc hors d'atteinte d'un nom de
     * fabrique **aujourd'hui**. Ce n'est pas une propriété du test : elle se perdra le jour où
     * quelqu'un rendra la requête plus réaliste, et rien ne le dira. L'acteur est donc nommé,
     * et l'assertion porte sur l'identité du seul résultat attendu.
     */
    public function test_user_search_never_leaks_across_agencies(): void
    {
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $this->actingAsRole('agency_admin', ['agency' => $agencyA, ...self::ACTEUR_HORS_ATTEINTE]);

        $dedans = User::factory()->create(['agency_id' => $agencyA->id, 'last_name' => 'Crossagencyton']);
        User::factory()->create(['agency_id' => $agencyB->id, 'last_name' => 'Crossagencyton']);
        $this->indexSearchable(User::class);

        $response = $this->getJson('/api/users?filter[search]=Crossagencyton')->assertOk();

        $this->assertSame(1, $response->json('meta.total'));
        $this->assertSame([$dedans->id], $response->json('data.*.id'));
    }

    /**
     * TCK-462 — même raison que ci-dessus. Un total de 0 est le plus fragile de tous : il est
     * satisfait par la panne comme par le succès. L'assertion sur `data` le rend explicite.
     */
    public function test_soft_deleted_user_is_not_searchable(): void
    {
        $agency = Agency::factory()->create();
        $this->actingAsRole('agency_admin', ['agency' => $agency, ...self::ACTEUR_HORS_ATTEINTE]);

        $user = User::factory()->create([
            'agency_id' => $agency->id,
            'last_name' => 'Ghostuserton',
        ]);
        $user->delete();
        $this->indexSearchable(User::class);

        $this->getJson('/api/users?filter[search]=Ghostuserton')
            ->assertOk()
            ->assertJsonPath('meta.total', 0)
            ->assertJsonPath('data', []);
    }

    /**
     * TCK-281 item 6 — `GET /api/agencies/{agency}/members` passe par
     * `User::buildQuery`, donc bascule sur Meilisearch avec ce ticket, et le
     * front lui envoie déjà `filter[search]`
     * (`takussan-web/src/lib/queries/agency-members.ts`). Aucun test ne le
     * couvrait : une régression y serait invisible jusqu'en production.
     *
     * TCK-462 — ce test et le suivant assertent une IDENTITÉ (`assertSame([$member->id], …)`)
     * et jamais un cardinal : l'acteur, s'il tombait dans la tolérance aux fautes, ferait
     * rougir l'assertion au lieu de la satisfaire silencieusement. Ils n'ont donc rien à
     * corriger — c'est exactement la propriété que les quatre tests ci-dessus ont acquise.
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
