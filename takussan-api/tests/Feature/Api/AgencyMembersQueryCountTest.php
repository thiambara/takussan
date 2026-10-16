<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Lease;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\PlatformProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\ApiTestCase;

/**
 * TCK-653 (piste P02.01) — `GET /api/agencies/{id}/members` ne doit pas émettre de requêtes PAR
 * LIGNE.
 *
 * `UserResource` lit, pour chaque membre, `profileTypes()` (cinq `exists()` et un `first()`), l'accesseur
 * `agency_id` (quatre `get()` sur les profils) et `getFirstMediaUrl('avatar')`. Mesuré le 2026-10-15 :
 * environ 11 requêtes par ligne, sparse fieldset compris (129 pour 11 lignes, 1 669 pour 151), alors
 * que le front appelle la route avec `per_page=100` pour remplir des listes de noms.
 *
 * Deux tests, et le second n'est pas un ornement : un préchargement qui changerait la sortie
 * (un profil révoqué compté, un rôle perdu) rendrait le premier vert pour une mauvaise raison.
 */
class AgencyMembersQueryCountTest extends ApiTestCase
{
    use RefreshDatabase;

    public function test_le_nombre_de_requetes_ne_depend_pas_du_nombre_de_membres(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $url = "/api/agencies/{$agency->id}/members?per_page=100&fields[users]=id,first_name,last_name";

        $this->membresDeChaqueSorte($agency);
        $avant = $this->requetesDe($url, 7);

        $this->membresDeChaqueSorte($agency);
        $this->membresDeChaqueSorte($agency);
        $apres = $this->requetesDe($url, 19);

        $this->assertSame(
            $avant,
            $apres,
            "La liste des membres émet {$avant} requêtes pour 7 lignes et {$apres} pour 19 : "
            .'au moins une lecture de `UserResource` se fait encore ligne par ligne.'
        );
    }

    public function test_les_roles_et_l_agence_de_chaque_membre_sont_inchanges(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $membres = $this->membresDeChaqueSorte($agency);

        $lignes = collect($this->getJson("/api/agencies/{$agency->id}/members?per_page=100")
            ->assertOk()
            ->json('data'))
            ->keyBy('id');

        $attendu = [
            'agent' => [['agent', 'customer'], $agency->id],
            'agent_bailleur' => [['agent', 'owner', 'customer'], $agency->id],
            'super_admin' => [['super_admin', 'agent', 'customer'], $agency->id],
            'plateforme_revoquee' => [['agent', 'customer'], $agency->id],
            'bailleur_locataire' => [['owner', 'customer', 'tenant'], $agency->id],
            'agent_prestataire' => [['agent', 'service_provider', 'customer'], $agency->id],
        ];

        foreach ($attendu as $sorte => [$roles, $agencyId]) {
            $ligne = $lignes->get($membres[$sorte]->id);
            $this->assertNotNull($ligne, "Le membre « {$sorte} » manque à la liste.");
            $this->assertSame($roles, $ligne['roles'], "Rôles du membre « {$sorte} ».");
            $this->assertSame($agencyId, $ligne['agency_id'], "Agence du membre « {$sorte} ».");
            $this->assertNull($ligne['avatar_url'], "Avatar du membre « {$sorte} ».");
        }
    }

    /** Le nombre de requêtes émises par un appel, une fois la réponse vérifiée. */
    private function requetesDe(string $url, int $lignesAttendues): int
    {
        DB::flushQueryLog();
        DB::enableQueryLog();
        $reponse = $this->getJson($url)->assertOk();
        $compte = count(DB::getQueryLog());
        DB::disableQueryLog();

        // L'admin authentifié figure dans la liste : 1 + 6 par lot de la fixture.
        $this->assertCount($lignesAttendues, $reponse->json('data'));

        return $compte;
    }

    /**
     * Un membre de chaque sorte que `UserResource` distingue : chacune touche une relation que la
     * ressource lit.
     *
     * @return array<string, User>
     */
    private function membresDeChaqueSorte(Agency $agency): array
    {
        $agent = fn (User $u) => AgentProfile::factory()->create(['user_id' => $u->id, 'agency_id' => $agency->id]);
        $bailleur = fn (User $u) => OwnerProfile::factory()->create(['user_id' => $u->id, 'agency_id' => $agency->id]);

        $m = [];

        $agent($m['agent'] = User::factory()->create());

        $agent($m['agent_bailleur'] = User::factory()->create());
        $bailleur($m['agent_bailleur']);

        $agent($m['super_admin'] = User::factory()->create());
        PlatformProfile::factory()->superAdmin()->create(['user_id' => $m['super_admin']->id]);

        $agent($m['plateforme_revoquee'] = User::factory()->create());
        PlatformProfile::factory()->superAdmin()->revoked()->create(['user_id' => $m['plateforme_revoquee']->id]);

        $bailleur($m['bailleur_locataire'] = User::factory()->create());
        $client = Customer::factory()->create(['user_id' => $m['bailleur_locataire']->id]);
        Lease::factory()->active()->create(['tenant_id' => $client->id, 'agency_id' => $agency->id]);

        $agent($m['agent_prestataire'] = User::factory()->create());
        ServiceProviderProfile::factory()->create(['user_id' => $m['agent_prestataire']->id]);

        return $m;
    }
}
