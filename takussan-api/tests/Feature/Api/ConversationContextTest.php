<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * TCK-576 — `GET /api/conversations/context/properties` et `…/context/leases` : le bien et le bail
 * auxquels on rattache un groupe, cherchés par leur nom.
 *
 * Retour de vérification de TCK-565 (2026-09-24) : les deux listes de « Nouveau groupe » lisaient
 * `/api/properties` et `/api/leases`, plafonnées à 100 et sans recherche — 106 des 206 biens d'un
 * agent de démo ne pouvaient pas être choisis. Et la recherche de `/api/properties` ne suffit pas :
 * elle passe par Meilisearch, qui n'indexe que les biens publics et publiés.
 *
 * Trois propriétés tenues ici, et la première est une frontière d'isolation :
 *
 *  1. **le périmètre est celui que le serveur accepte** — tout ce qui est listé passe la policy
 *     `view` que `CreateGroupConversationRequest` applique, dans un monde où d'autres agences,
 *     d'autres propriétaires et d'autres locataires existent, et rien d'une autre agence ne sort,
 *     même quand la recherche le désigne ;
 *  2. **la recherche atteint ce que Meilisearch n'indexe pas** — brouillon, bien privé ;
 *  3. **la liste blanche est étroite** — tout autre paramètre rend 400.
 */
class ConversationContextTest extends ApiTestCase
{
    use RefreshDatabase;

    private function bien(array $attributs): Property
    {
        return Property::factory()->create($attributs);
    }

    /** @return list<int> */
    private function ids(string $url): array
    {
        $response = $this->getJson($url)->assertOk();

        return collect($response->json('data'))->pluck('id')->map(fn ($id) => (int) $id)->sort()->values()->all();
    }

    /**
     * Une agence, son agent, ses biens de tous statuts, et autour d'elle ce qui NE doit PAS sortir.
     *
     * @return array{agency: Agency, agent: User, visibles: list<Property>, archive: Property, etrangers: list<Property>}
     */
    private function monde(): array
    {
        $agency = Agency::factory()->create();
        $autreAgence = Agency::factory()->create();

        $agent = User::factory()->create();
        $this->materializeRoleProfile($agent, 'agent', $agency);

        $visibles = [
            $this->bien(['agency_id' => $agency->id, 'title' => 'Villa Almadies']),
            // Ni l'un ni l'autre n'est dans l'index Meilisearch (`shouldBeSearchable()`).
            $this->bien(['agency_id' => $agency->id, 'title' => 'Espace de bureau à Mbour', 'visibility' => PropertyVisibility::Private, 'status' => PropertyStatus::Rented]),
            $this->bien(['agency_id' => $agency->id, 'title' => 'Maison familiale - Amitié', 'visibility' => PropertyVisibility::Private, 'status' => PropertyStatus::Draft]),
            // Le bien PERSONNEL de l'agent, hors de toute agence : la policy l'accepte.
            $this->bien(['user_id' => $agent->id, 'agency_id' => null, 'title' => 'Terrain personnel à Saly']),
        ];

        $archive = $this->bien(['agency_id' => $agency->id, 'title' => 'Villa archivée Almadies', 'status' => PropertyStatus::Archived]);

        $etrangers = [
            // Même titre qu'un bien visible : seule l'agence les distingue.
            $this->bien(['agency_id' => $autreAgence->id, 'title' => 'Villa Almadies']),
            $this->bien(['agency_id' => $autreAgence->id, 'title' => 'Espace de bureau à Mbour', 'visibility' => PropertyVisibility::Private]),
            // Un bien sans agence d'un autre utilisateur.
            $this->bien(['agency_id' => null, 'title' => 'Villa Almadies particulier']),
        ];

        return compact('agency', 'agent', 'visibles', 'archive', 'etrangers');
    }

    public function test_un_visiteur_anonyme_est_refuse(): void
    {
        $this->getJson('/api/conversations/context/properties')->assertUnauthorized();
        $this->getJson('/api/conversations/context/leases')->assertUnauthorized();
    }

    public function test_liste_les_biens_que_la_creation_accepte_et_eux_seuls(): void
    {
        ['agent' => $agent, 'visibles' => $visibles, 'archive' => $archive, 'etrangers' => $etrangers] = $this->monde();
        $this->actingAsApi($agent);

        $listes = $this->ids('/api/conversations/context/properties?per_page=100');

        $this->assertSame(collect($visibles)->pluck('id')->sort()->values()->all(), $listes);
        $this->assertNotContains($archive->id, $listes, 'un bien archivé n’est pas proposé');
        foreach ($etrangers as $etranger) {
            $this->assertNotContains($etranger->id, $listes);
        }

        // Inclusion dans ce que le serveur accepte : la garde de contexte lit cette policy.
        foreach (Property::query()->whereKey($listes)->get() as $bien) {
            $this->assertTrue($agent->can('view', $bien), "bien {$bien->id} listé mais refusé par la policy");
        }
    }

    public function test_la_recherche_atteint_les_biens_que_meilisearch_n_indexe_pas(): void
    {
        ['agent' => $agent, 'visibles' => $visibles] = $this->monde();
        $this->actingAsApi($agent);

        // Mots dans le désordre, casse mêlée, et un mot partiel.
        $this->assertSame([$visibles[1]->id], $this->ids('/api/conversations/context/properties?filter[search]=MBOUR%20bureau'));
        $this->assertSame([$visibles[2]->id], $this->ids('/api/conversations/context/properties?filter[search]=maison%20amiti'));
        // Le repli de casse vaut aussi hors ASCII (ADR-0025) : « AMITIÉ » trouve « Amitié ».
        $this->assertSame([$visibles[2]->id], $this->ids('/api/conversations/context/properties?filter[search]=AMITI%C3%89'));
        // Par la référence.
        $this->assertSame([$visibles[0]->id], $this->ids('/api/conversations/context/properties?filter[search]='.urlencode(strtolower($visibles[0]->reference_number))));
    }

    public function test_la_recherche_reste_dans_le_perimetre(): void
    {
        ['agent' => $agent, 'visibles' => $visibles] = $this->monde();
        $this->actingAsApi($agent);

        // « Villa Almadies » existe dans l'autre agence et chez un particulier : seul le nôtre sort.
        $this->assertSame([$visibles[0]->id], $this->ids('/api/conversations/context/properties?filter[search]=villa%20almadies'));
        $this->assertSame([$visibles[1]->id], $this->ids('/api/conversations/context/properties?filter[search]=bureau'));
    }

    public function test_les_jokers_saisis_ne_valent_pas_tout(): void
    {
        ['agent' => $agent] = $this->monde();
        $this->actingAsApi($agent);

        $this->assertSame([], $this->ids('/api/conversations/context/properties?filter[search]=%25'));
        $this->assertSame([], $this->ids('/api/conversations/context/properties?filter[search]=_'));
    }

    public function test_un_proprietaire_sans_agence_ne_voit_que_ses_biens(): void
    {
        ['etrangers' => $etrangers] = $this->monde();
        $particulier = User::factory()->create();
        $sien = $this->bien(['user_id' => $particulier->id, 'agency_id' => null, 'title' => 'Studio Ouakam']);
        $this->actingAsApi($particulier);

        $this->assertSame([$sien->id], $this->ids('/api/conversations/context/properties'));
        $this->assertSame([], $this->ids('/api/conversations/context/properties?filter[search]=villa'));
        $this->assertNotContains($etrangers[2]->id, $this->ids('/api/conversations/context/properties'));
    }

    public function test_la_pagination_ne_rend_jamais_deux_fois_le_meme_bien(): void
    {
        $agency = Agency::factory()->create();
        $agent = User::factory()->create();
        $this->materializeRoleProfile($agent, 'agent', $agency);
        // Cinq biens de MÊME titre : le tri par titre seul ne fixe aucun ordre entre eux.
        $biens = collect(range(1, 5))->map(fn () => $this->bien(['agency_id' => $agency->id, 'title' => 'Garage à Ngor']));
        $this->actingAsApi($agent);

        $vus = [];
        foreach (range(1, 5) as $page) {
            $vus = [...$vus, ...$this->ids("/api/conversations/context/properties?per_page=1&page={$page}")];
        }
        sort($vus);

        $this->assertSame($biens->pluck('id')->sort()->values()->all(), $vus);
    }

    public function test_ne_rend_que_le_titre_et_la_reference(): void
    {
        ['agent' => $agent, 'visibles' => $visibles] = $this->monde();
        $this->actingAsApi($agent);

        $ligne = collect($this->getJson('/api/conversations/context/properties?fields[properties]=id,title,reference_number&per_page=100')
            ->assertOk()
            ->assertJsonStructure(['data', 'meta' => ['total', 'per_page', 'current_page', 'last_page']])
            ->json('data'))->firstWhere('id', $visibles[0]->id);

        $this->assertSame(['id', 'title', 'reference_number'], array_keys($ligne));
    }

    public function test_les_parametres_hors_liste_blanche_sont_refuses(): void
    {
        ['agent' => $agent] = $this->monde();
        $this->actingAsApi($agent);

        foreach ([
            '/api/conversations/context/properties?fields[properties]=id,price',
            '/api/conversations/context/properties?sort=price',
            '/api/conversations/context/properties?include=owner',
            '/api/conversations/context/properties?filter[status]=draft',
            '/api/conversations/context/properties?filter[agency_id]=1',
            '/api/conversations/context/leases?fields[leases]=id,monthly_rent',
            '/api/conversations/context/leases?include=tenant',
            '/api/conversations/context/leases?filter[agency_id]=1',
        ] as $url) {
            $this->getJson($url)->assertStatus(400);
        }

        $this->getJson('/api/conversations/context/properties?sort=-title')->assertOk();
    }

    // ── Baux ────────────────────────────────────────────────────────────────────────────────────

    /**
     * @return array{agent: User, bailleur: User, locataire: User, agence: list<Lease>, bailleurSeul: Lease, locataireSeul: Lease, etranger: Lease}
     */
    private function mondeDesBaux(): array
    {
        $agency = Agency::factory()->create();
        $autreAgence = Agency::factory()->create();

        $agent = User::factory()->create();
        $this->materializeRoleProfile($agent, 'agent', $agency);

        $bienAgence = $this->bien(['agency_id' => $agency->id, 'title' => 'Espace de bureau à Mbour']);
        $autreBienAgence = $this->bien(['agency_id' => $agency->id, 'title' => 'Villa Almadies']);
        $agence = [
            Lease::factory()->create(['property_id' => $bienAgence->id, 'agency_id' => $agency->id, 'reference_number' => 'LS-AGENCE-001']),
            Lease::factory()->create(['property_id' => $autreBienAgence->id, 'agency_id' => $agency->id, 'reference_number' => 'LS-AGENCE-002']),
        ];

        $bailleur = User::factory()->create();
        $bailleurSeul = Lease::factory()->create(['landlord_id' => $bailleur->id, 'agency_id' => null, 'reference_number' => 'LS-BAILLEUR-01']);

        $locataire = User::factory()->create();
        $fiche = Customer::factory()->create(['user_id' => $locataire->id]);
        $locataireSeul = Lease::factory()->create(['tenant_id' => $fiche->id, 'agency_id' => null, 'reference_number' => 'LS-LOCATAIRE-01']);

        $bienEtranger = $this->bien(['agency_id' => $autreAgence->id, 'title' => 'Espace de bureau à Mbour']);
        $etranger = Lease::factory()->create(['property_id' => $bienEtranger->id, 'agency_id' => $autreAgence->id, 'reference_number' => 'LS-AGENCE-003']);

        return compact('agent', 'bailleur', 'locataire', 'agence', 'bailleurSeul', 'locataireSeul', 'etranger');
    }

    public function test_liste_les_baux_que_la_creation_accepte_et_eux_seuls(): void
    {
        $monde = $this->mondeDesBaux();
        $tous = Lease::query()->get();

        foreach ([
            'agent' => [$monde['agent'], collect($monde['agence'])->pluck('id')->all()],
            'bailleur' => [$monde['bailleur'], [$monde['bailleurSeul']->id]],
            'locataire' => [$monde['locataire'], [$monde['locataireSeul']->id]],
        ] as $qui => [$acteur, $attendus]) {
            $this->actingAsApi($acteur);
            sort($attendus);
            $listes = $this->ids('/api/conversations/context/leases?per_page=100');

            $this->assertSame($attendus, $listes, "périmètre du {$qui}");
            $this->assertNotContains($monde['etranger']->id, $listes);
            // Inclusion dans ce que le serveur accepte, ET exhaustivité sur ce monde.
            foreach ($tous as $bail) {
                $this->assertSame(
                    $acteur->can('view', $bail),
                    in_array($bail->id, $listes, true),
                    "{$qui} : bail {$bail->id} — policy et liste divergent",
                );
            }
        }
    }

    public function test_les_baux_se_filtrent_par_bien_et_se_cherchent(): void
    {
        $monde = $this->mondeDesBaux();
        [$bureau, $villa] = $monde['agence'];
        $this->actingAsApi($monde['agent']);

        $this->assertSame([$bureau->id], $this->ids("/api/conversations/context/leases?filter[property_id]={$bureau->property_id}"));
        // Par la référence du bail, ou par le titre de son bien — jamais hors périmètre (le bail
        // étranger porte un bien de même titre).
        $this->assertSame([$villa->id], $this->ids('/api/conversations/context/leases?filter[search]=agence-002'));
        $this->assertSame([$bureau->id], $this->ids('/api/conversations/context/leases?filter[search]=mbour%20BUREAU'));
        $this->assertSame([], $this->ids('/api/conversations/context/leases?filter[search]=agence-003'));
    }

    /**
     * TCK-576, réparation 1 (vérificateur du 2026-09-24) : `filter[property_id]=abc` rendait 500
     * — `SQLSTATE[22P02] invalid input syntax for type bigint`, message SQL compris en débogage
     * local. Une saisie mal formée est une erreur du CLIENT : 422, sans rien de la base.
     */
    public function test_un_bien_mal_forme_dans_le_filtre_rend_422_et_pas_500(): void
    {
        $monde = $this->mondeDesBaux();
        [$bureau] = $monde['agence'];
        $this->actingAsApi($monde['agent']);

        foreach (['abc', '1.5', '99999999999999999999', '1%2C2'] as $valeur) {
            $this->getJson("/api/conversations/context/leases?filter[property_id]={$valeur}")
                ->assertUnprocessable()
                ->assertJsonValidationErrors(['filter.property_id'])
                ->assertDontSee('SQLSTATE', false);
        }

        // Témoin : un identifiant bien formé filtre toujours.
        $this->assertSame([$bureau->id], $this->ids("/api/conversations/context/leases?filter[property_id]={$bureau->property_id}"));
    }

    /**
     * TCK-576, reprise des défauts mineurs (2026-09-24) — le 422 disait « Le champ filter.property
     * id doit être un nombre entier. » : Laravel fabrique le nom du champ depuis la clé à points
     * quand la requête ne le nomme pas. Il se dit dans la langue de la requête.
     */
    public function test_le_422_du_filtre_nomme_le_bien_dans_la_langue_de_la_requete(): void
    {
        $monde = $this->mondeDesBaux();
        $this->actingAsApi($monde['agent']);

        $phrases = [];
        foreach (['fr', 'en', 'wo'] as $langue) {
            $message = $this->getJson('/api/conversations/context/leases?filter[property_id]=abc', ['Accept-Language' => $langue])
                ->assertUnprocessable()
                ->json('errors')['filter.property_id'][0];

            $this->assertStringNotContainsString('filter', $message, $langue);
            $this->assertStringNotContainsString('property id', $message, $langue);
            $this->assertStringContainsString(__('messaging.attributes.property_filter', [], $langue), $message, $langue);
            $phrases[] = $message;
        }
        $this->assertCount(3, array_unique($phrases));
    }

    public function test_un_bail_rend_le_titre_de_son_bien_et_rien_d_autre(): void
    {
        $monde = $this->mondeDesBaux();
        [$bureau] = $monde['agence'];
        $this->actingAsApi($monde['agent']);

        $ligne = collect($this->getJson('/api/conversations/context/leases?fields[leases]=id,reference_number,property_id&fields[properties]=id,title,reference_number&include=property')
            ->assertOk()
            ->json('data'))->firstWhere('id', $bureau->id);

        $this->assertSame(['id', 'reference_number', 'property_id', 'property'], array_keys($ligne));
        $this->assertSame('Espace de bureau à Mbour', $ligne['property']['title']);
        $this->assertSame(['id', 'title', 'reference_number'], array_keys($ligne['property']));
    }
}
