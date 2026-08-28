<?php

namespace Tests\Feature\Public;

use App\Http\Requests\Public\IndexPublicProfilesRequest;
use App\Models\Address;
use App\Models\Agency;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\ContractType;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Enums\UserStatus;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\Review;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * Les DEUX index publics de profils — TCK-436.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER REFUSE DE FAIRE
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * · **Il ne vérifie pas la présence de l'éligible en croyant vérifier l'exclusion.** Chaque test
 *   d'AC2 crée un profil de chaque sorte et affirme les DEUX faits — l'éligible est là, le
 *   non-éligible n'y est pas. Une requête d'éligibilité qui ne filtrerait rien coche la moitié
 *   d'une assertion écrite à l'envers.
 * · **Il n'éprouve pas la seule première page.** Une pagination cassée rend la première page
 *   correctement ; c'est la deuxième qui parle. Et l'union de toutes les pages est vérifiée SANS
 *   DOUBLON, ce qui est le défaut propre d'un `ORDER BY` non total sous PostgreSQL.
 * · **Il ne cherche pas les fuites champ par champ.** {@see self::assertAucunContactPersonnel()}
 *   marche la charge DÉCODÉE en entier — clés et valeurs — et le motif central de ce lot s'y
 *   applique : *une garde qui ne connaît que la liste des champs interdits ne garde rien, « le
 *   reste » EST le défaut.* Elle refuse donc toute CLÉ dont le nom évoque un contact, y compris un
 *   champ qui n'existe pas encore, et toute VALEUR de forme adresse ou téléphone.
 *
 * ⚠ La garde d'AC3 est elle-même éprouvée : {@see self::test_la_garde_de_pii_voit_reellement_une_fuite}
 * la lance sur la charge de la FICHE d'agence, qui publie l'e-mail de l'agence, et exige qu'elle
 * échoue. Sans ce contrôle, une garde qui ne verrait jamais rien rendrait le même vert qu'une
 * garde satisfaite.
 */
class PublicProfileIndexTest extends TestCase
{
    use RefreshDatabase;

    // ════════════════════════════════════════════════════════════════════════════════════════════
    // Fabriques locales — un profil ÉLIGIBLE, et rien d'autre en une ligne.
    // ════════════════════════════════════════════════════════════════════════════════════════════

    private function agenceEligible(array $attributs = [], int $biens = 1, string $ville = 'Dakar'): Agency
    {
        $agence = Agency::factory()->create(array_merge([
            'status' => AgencyStatus::Active,
        ], $attributs));

        for ($i = 0; $i < $biens; $i++) {
            $this->bienPublic(['agency_id' => $agence->id], $ville);
        }

        return $agence;
    }

    private function agentEligible(array $attributs = [], int $biens = 1, string $ville = 'Dakar', ?Agency $agence = null): User
    {
        $agent = User::factory()->create(array_merge([
            'status' => UserStatus::Active,
        ], $attributs));

        for ($i = 0; $i < $biens; $i++) {
            $this->bienPublic([
                'user_id' => $agent->id,
                'agency_id' => $agence?->id,
            ], $ville);
        }

        return $agent;
    }

    private function bienPublic(array $attributs = [], string $ville = 'Dakar'): Property
    {
        $bien = Property::factory()->published()->create($attributs);

        Address::factory()->create([
            'addressable_type' => Property::class,
            'addressable_id' => $bien->id,
            'city' => $ville,
        ]);

        return $bien;
    }

    /** @return array<int,mixed> */
    private function slugs(TestResponse $reponse): array
    {
        return array_column($reponse->json('data'), 'slug');
    }

    // ════════════════════════════════════════════════════════════════════════════════════════════
    // AC1 — 200 anonyme, enveloppe paginée, et la SECONDE page
    // ════════════════════════════════════════════════════════════════════════════════════════════

    public function test_ac1_index_des_agences_repond_200_sans_authentification_avec_enveloppe_paginee(): void
    {
        $this->agenceEligible(['name' => 'Sahel Homes']);

        $this->getJson('/api/public/agencies')
            ->assertOk()
            ->assertJsonStructure([
                'data' => [['id', 'slug', 'name', 'city', 'cities', 'portfolio_count', 'rent_count', 'sale_count', 'reviews' => ['average', 'count']]],
                'meta' => ['total', 'per_page', 'current_page', 'last_page'],
            ])
            ->assertJsonPath('meta.total', 1);
    }

    public function test_ac1_index_des_agents_repond_200_sans_authentification_avec_enveloppe_paginee(): void
    {
        $this->agentEligible(['username' => 'awa-diop', 'first_name' => 'Awa', 'last_name' => 'Diop']);

        $this->getJson('/api/public/agents')
            ->assertOk()
            ->assertJsonStructure([
                'data' => [['id', 'slug', 'full_name', 'city', 'cities', 'portfolio_count', 'reviews' => ['average', 'count']]],
                'meta' => ['total', 'per_page', 'current_page', 'last_page'],
            ])
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.slug', 'awa-diop');
    }

    public function test_ac1_la_seconde_page_des_agences_rend_des_agences_differentes_de_la_premiere(): void
    {
        for ($i = 0; $i < 5; $i++) {
            $this->agenceEligible(['name' => "Agence {$i}"]);
        }

        $page1 = $this->getJson('/api/public/agencies?per_page=2&page=1')->assertOk();
        $page2 = $this->getJson('/api/public/agencies?per_page=2&page=2')->assertOk();
        $page3 = $this->getJson('/api/public/agencies?per_page=2&page=3')->assertOk();

        $this->assertSame(2, $page2->json('meta.current_page'));
        $this->assertSame(3, $page2->json('meta.last_page'));
        $this->assertSame(5, $page2->json('meta.total'));

        $this->assertCount(2, $page2->json('data'));
        $this->assertCount(1, $page3->json('data'));

        // Le point que la seule première page ne peut pas dire : l'union des trois pages couvre
        // les cinq agences, SANS DOUBLON. Un `ORDER BY` non total les rendrait en désordre, avec
        // des répétitions, et chaque page prise isolément resterait plausible.
        $tous = array_merge($this->slugs($page1), $this->slugs($page2), $this->slugs($page3));
        $this->assertCount(5, $tous);
        $this->assertCount(5, array_unique($tous));
    }

    public function test_ac1_la_seconde_page_des_agents_rend_des_agents_differents_de_la_premiere(): void
    {
        for ($i = 0; $i < 5; $i++) {
            $this->agentEligible(['username' => "agent-{$i}"]);
        }

        $page1 = $this->getJson('/api/public/agents?per_page=2&page=1')->assertOk();
        $page2 = $this->getJson('/api/public/agents?per_page=2&page=2')->assertOk();
        $page3 = $this->getJson('/api/public/agents?per_page=2&page=3')->assertOk();

        $this->assertSame(2, $page2->json('meta.current_page'));
        $this->assertSame(5, $page2->json('meta.total'));

        $tous = array_merge($this->slugs($page1), $this->slugs($page2), $this->slugs($page3));
        $this->assertCount(5, $tous);
        $this->assertCount(5, array_unique($tous));
        $this->assertSame([], array_intersect($this->slugs($page1), $this->slugs($page2)));
    }

    public function test_ac1_lordre_de_pagination_est_total_sur_les_deux_index(): void
    {
        // ⚠ **Ce test lit le SQL, et c'est une décision, pas une paresse.**
        //
        // Le défaut visé — deux pages successives qui rendent deux fois la même ligne — est un
        // comportement AUTORISÉ de PostgreSQL sur un `ORDER BY` non total, pas un comportement
        // garanti. Mesuré par ablation le 2026-08-28 : retirer `->orderBy('agencies.id')` laisse
        // le test de pagination sur cinq agences parfaitement VERT, parce que le moteur choisit
        // ici un ordre stable. *Un test de résultat ne peut donc pas garder cette propriété : il
        // garderait une coïncidence.*
        //
        // Ce qu'on peut garder, c'est que la requête DÉCLARE un ordre total : le dernier terme du
        // `ORDER BY` est la clé primaire, qui départage toutes les lignes. Le test est donc un
        // plancher assumé — il constate une déclaration, pas un comportement — et c'est le même
        // registre que le `orderBy('id')` du sitemap de TCK-431.
        $this->agenceEligible();
        $this->agentEligible(['username' => 'ordre-total']);

        foreach ([
            '/api/public/agencies' => ['agencies', '"agencies"."id" asc'],
            '/api/public/agents' => ['users', '"users"."id" asc'],
        ] as $url => [$table, $terminaison]) {
            $requetes = [];
            DB::listen(function ($requete) use (&$requetes) {
                $requetes[] = $requete->sql;
            });

            $this->getJson($url)->assertOk();
            DB::flushQueryLog();

            // La requête de PAGE : celle qui lit la table du profil, ordonne, et n'est pas le
            // `count(*)` de la pagination. Le filtre nomme la table — sans quoi il attrape la
            // première requête ordonnée venue (mesuré : `maintenance_windows`, posée par un
            // middleware).
            $avecOrdre = array_values(array_filter(
                $requetes,
                fn (string $sql) => str_contains($sql, 'from "'.$table.'"')
                    && str_contains($sql, 'order by')
                    && ! str_contains($sql, 'count(*) as aggregate'),
            ));

            $this->assertNotSame([], $avecOrdre, "aucune requête ordonnée observée sur {$url}");
            $principale = $avecOrdre[0];

            $this->assertSame(
                1,
                preg_match('/ order by (.+?) limit /', $principale, $clause),
                "clause ORDER BY illisible sur {$url} : ".$principale,
            );
            $termes = array_map('trim', explode(',', $clause[1]));

            $this->assertSame(
                $terminaison,
                end($termes),
                "le DERNIER terme de l'ORDER BY de {$url} n'est pas la clé primaire : l'ordre ".
                'n\'est pas total, et deux pages successives peuvent rendre deux fois la même '.
                'ligne. ORDER BY = '.$clause[1],
            );
        }
    }

    public function test_ac1_per_page_est_plafonne_sur_les_deux_index(): void
    {
        $this->agenceEligible();
        $this->agentEligible(['username' => 'agent-plafond']);

        $plafond = IndexPublicProfilesRequest::PER_PAGE_MAX;

        // Au-delà du plafond : 422. `PublicPropertyController::index()` accepte n'importe quelle
        // valeur ; une route qui énumère des personnes ne le peut pas.
        $this->getJson('/api/public/agencies?per_page='.($plafond + 1))->assertStatus(422);
        $this->getJson('/api/public/agents?per_page='.($plafond + 1))->assertStatus(422);

        $this->getJson("/api/public/agencies?per_page={$plafond}")->assertOk()
            ->assertJsonPath('meta.per_page', $plafond);
    }

    // ════════════════════════════════════════════════════════════════════════════════════════════
    // AC2 — l'EXCLUSION des profils non éligibles
    // ════════════════════════════════════════════════════════════════════════════════════════════

    public function test_ac2_agences_non_eligibles_absentes_de_lindex(): void
    {
        $eligible = $this->agenceEligible(['name' => 'Éligible', 'slug' => 'eligible']);

        // 1. Aucune annonce du tout.
        Agency::factory()->create(['slug' => 'sans-bien', 'status' => AgencyStatus::Active]);

        // 2. Une annonce, mais en brouillon.
        $brouillon = Agency::factory()->create(['slug' => 'brouillon-seul', 'status' => AgencyStatus::Active]);
        Property::factory()->draft()->create(['agency_id' => $brouillon->id]);

        // 3. Une annonce publique, mais l'agence est suspendue.
        $suspendue = Agency::factory()->create(['slug' => 'suspendue', 'status' => AgencyStatus::Suspended]);
        $this->bienPublic(['agency_id' => $suspendue->id]);

        // 4. Une annonce publique, mais l'agence est archivée (soft delete).
        $supprimee = $this->agenceEligible(['slug' => 'supprimee']);
        $supprimee->delete();

        // 5. Une annonce visible mais NON publiée (`published_at` nul) : `scopePublic()` l'exclut,
        //    et l'écrire ici prouve que le prédicat retenu est bien celui-là et non le
        //    `status + visibility` des fiches.
        $nonPubliee = Agency::factory()->create(['slug' => 'non-publiee', 'status' => AgencyStatus::Active]);
        Property::factory()->create([
            'agency_id' => $nonPubliee->id,
            'status' => PropertyStatus::Available,
            'visibility' => PropertyVisibility::Public,
            'published_at' => null,
        ]);

        // 6. Une annonce publiée mais marquée `is_test`.
        $test = Agency::factory()->create(['slug' => 'agence-de-test', 'status' => AgencyStatus::Active]);
        Property::factory()->published()->create(['agency_id' => $test->id, 'is_test' => true]);

        // 7. Une annonce publiée mais PRIVÉE.
        $privee = Agency::factory()->create(['slug' => 'privee', 'status' => AgencyStatus::Active]);
        Property::factory()->published()->create([
            'agency_id' => $privee->id,
            'visibility' => PropertyVisibility::Private,
        ]);

        // 8. Une annonce que `scopePublic()` ADMET — `pending` n'est pas dans ses huit statuts
        //    exclus — mais que la fiche `/agencies/{slug}` n'affiche PAS, puisqu'elle n'y montre
        //    que le statut `available`. C'est le cas qui rend l'INTERSECTION de
        //    `Property::scopePublicPortfolio()` nécessaire : sans `available()`, cette agence
        //    entrerait dans l'index et mènerait à une fiche au portefeuille vide.
        $enAttente = Agency::factory()->create(['slug' => 'en-attente', 'status' => AgencyStatus::Active]);
        Property::factory()->published()->create([
            'agency_id' => $enAttente->id,
            'status' => PropertyStatus::Pending,
        ]);

        $reponse = $this->getJson('/api/public/agencies?per_page='.IndexPublicProfilesRequest::PER_PAGE_MAX)->assertOk();
        $slugs = $this->slugs($reponse);

        $this->assertContains($eligible->slug, $slugs, "l'agence éligible doit être listée");
        foreach (['sans-bien', 'brouillon-seul', 'suspendue', 'supprimee', 'non-publiee', 'agence-de-test', 'privee', 'en-attente'] as $exclu) {
            $this->assertNotContains($exclu, $slugs, "« {$exclu} » ne doit PAS figurer dans l'index public");
        }
        $this->assertSame(1, $reponse->json('meta.total'));
    }

    public function test_ac2_agents_non_eligibles_absents_de_lindex(): void
    {
        $eligible = $this->agentEligible(['username' => 'eligible-agent']);

        // 1. Aucune annonce.
        User::factory()->create(['username' => 'sans-bien', 'status' => UserStatus::Active]);

        // 2. Une annonce publique, mais l'utilisateur n'est pas actif — les trois statuts non
        //    actifs, et non le seul `inactive` : « le reste » est précisément ce qu'une garde
        //    écrite sur une valeur connue laisse passer.
        foreach ([UserStatus::Inactive, UserStatus::Blocked, UserStatus::Deleted] as $statut) {
            $inactif = User::factory()->create([
                'username' => 'inactif-'.$statut->value,
                'status' => $statut,
            ]);
            $this->bienPublic(['user_id' => $inactif->id]);
        }

        // 3. Une annonce publique, mais aucun `username` : le slug de l'URL EST le `username`.
        //    Sans lui, l'index rendrait une ligne dont le lien ne mène nulle part.
        $sansSlug = User::factory()->create(['username' => null, 'status' => UserStatus::Active]);
        $this->bienPublic(['user_id' => $sansSlug->id]);

        // 4. Une annonce, mais en brouillon.
        $brouillon = User::factory()->create(['username' => 'brouillon-seul', 'status' => UserStatus::Active]);
        Property::factory()->draft()->create(['user_id' => $brouillon->id]);

        // 5. Une annonce `pending` : admise par `scopePublic()`, jamais affichée par la fiche.
        //    Cf. le cas jumeau du test des agences — c'est ce qui rend `available()` nécessaire.
        $enAttente = User::factory()->create(['username' => 'en-attente', 'status' => UserStatus::Active]);
        Property::factory()->published()->create([
            'user_id' => $enAttente->id,
            'status' => PropertyStatus::Pending,
        ]);

        // 6. Une annonce visible mais NON publiée, et une annonce marquée `is_test` : les deux
        //    cases que `scopePublic()` couvre et que `status + visibility` seuls laisseraient
        //    passer. Elles étaient absentes de ce test et présentes dans son jumeau des agences —
        //    mesuré par ablation le 2026-08-28 : remplacer `public()` par
        //    `available() + visibility` ne faisait rougir QUE le test des agences.
        $nonPubliee = User::factory()->create(['username' => 'non-publiee', 'status' => UserStatus::Active]);
        Property::factory()->create([
            'user_id' => $nonPubliee->id,
            'status' => PropertyStatus::Available,
            'visibility' => PropertyVisibility::Public,
            'published_at' => null,
        ]);

        $bienDeTest = User::factory()->create(['username' => 'agent-de-test', 'status' => UserStatus::Active]);
        Property::factory()->published()->create(['user_id' => $bienDeTest->id, 'is_test' => true]);

        $privee = User::factory()->create(['username' => 'privee', 'status' => UserStatus::Active]);
        Property::factory()->published()->create([
            'user_id' => $privee->id,
            'visibility' => PropertyVisibility::Private,
        ]);

        // 7. Actif, porteur d'un AgentProfile, mais SANS portefeuille public : le ticket range
        //    « un profil sans portefeuille » parmi les non-éligibles, et c'est le cas que la
        //    définition métier de l'agent aurait fait entrer.
        $agence = Agency::factory()->create();
        $mandateSansBien = User::factory()->create(['username' => 'mandate-sans-bien', 'status' => UserStatus::Active]);
        AgentProfile::factory()->create(['user_id' => $mandateSansBien->id, 'agency_id' => $agence->id]);

        $reponse = $this->getJson('/api/public/agents?per_page='.IndexPublicProfilesRequest::PER_PAGE_MAX)->assertOk();
        $slugs = $this->slugs($reponse);

        $this->assertContains('eligible-agent', $slugs);
        $exclus = [
            'sans-bien', 'inactif-inactive', 'inactif-blocked', 'inactif-deleted',
            'brouillon-seul', 'en-attente', 'non-publiee', 'agent-de-test', 'privee',
            'mandate-sans-bien',
        ];
        foreach ($exclus as $exclu) {
            $this->assertNotContains($exclu, $slugs, "« {$exclu} » ne doit PAS figurer dans l'index public");
        }
        $this->assertNotContains(null, $slugs, 'un profil sans `username` produirait un lien mort');
        $this->assertSame(1, $reponse->json('meta.total'));
        $this->assertSame($eligible->id, $reponse->json('data.0.id'));
    }

    public function test_ac2_un_profil_liste_mene_a_une_fiche_servie(): void
    {
        // La propriété que l'exclusion existe pour garantir, éprouvée de bout en bout plutôt
        // qu'affirmée : chaque slug rendu par l'index doit être servi par sa fiche.
        $this->agenceEligible(['slug' => 'agence-liee']);
        $this->agentEligible(['username' => 'agent-lie']);

        foreach ($this->slugs($this->getJson('/api/public/agencies')->assertOk()) as $slug) {
            $this->getJson('/api/public/agencies/'.$slug)->assertOk();
        }

        foreach ($this->slugs($this->getJson('/api/public/agents')->assertOk()) as $slug) {
            $this->getJson('/api/public/agents/'.$slug)
                ->assertOk()
                // Et la fiche n'est pas vide : l'index promet un portefeuille, la fiche le tient.
                ->assertJsonPath('data.portfolio_count', 1);
        }
    }

    // ════════════════════════════════════════════════════════════════════════════════════════════
    // AC3 — aucune donnée de contact personnelle, sur la charge ENTIÈRE
    // ════════════════════════════════════════════════════════════════════════════════════════════

    /**
     * Les clés qu'une charge d'index public ne peut pas porter — écrites sur une FORME.
     *
     * Le motif que ce lot a rencontré six fois : *une garde qui ne connaît que la liste des valeurs
     * valides et écarte le reste ne garde rien.* Ici c'est l'inverse et c'est le bon sens de la
     * garde : on nomme la forme interdite, pas les trois champs qui existent aujourd'hui. Un champ
     * `contact_email`, `mobile_phone` ou `whatsapp` ajouté demain la fait rougir sans qu'on y pense.
     */
    private const MOTIF_DE_CLE_DE_CONTACT = '/(e-?mail|courriel|phone|telephone|téléphone|^tel$|_tel$|mobile|whatsapp)/i';

    /** @param  array<string,mixed>|list<mixed>  $charge */
    private function assertAucunContactPersonnel(array $charge, string $ou): void
    {
        $this->assertSame(
            [],
            $this->coordonneesTrouvees($charge),
            "coordonnée personnelle exposée par {$ou}",
        );
    }

    /**
     * Les chemins fautifs, RENDUS plutôt qu'assertés — c'est ce qui rend la garde éprouvable.
     *
     * Une garde qui n'existe que sous forme d'assertion ne peut être mise à l'épreuve qu'en
     * attrapant son exception et en lisant son message, c'est-à-dire en dépendant du formatage de
     * PHPUnit. Séparer la DÉTECTION de l'ASSERTION permet à
     * {@see self::test_la_garde_de_pii_voit_reellement_une_fuite} de l'appeler directement.
     *
     * @param  array<string,mixed>|list<mixed>  $charge
     * @return array<int,string>
     */
    private function coordonneesTrouvees(array $charge): array
    {
        $cheminsFautifs = [];

        $marcher = function (mixed $noeud, string $chemin) use (&$marcher, &$cheminsFautifs): void {
            if (is_array($noeud)) {
                foreach ($noeud as $cle => $valeur) {
                    $sous = $chemin === '' ? (string) $cle : $chemin.'.'.$cle;
                    if (is_string($cle) && preg_match(self::MOTIF_DE_CLE_DE_CONTACT, $cle) === 1) {
                        $cheminsFautifs[] = "clé « {$sous} »";
                    }
                    $marcher($valeur, $sous);
                }

                return;
            }

            if (! is_string($noeud)) {
                return;
            }

            // Une adresse électronique, quelle que soit la clé qui la porte.
            if (preg_match('/[\w.+-]+@[\w-]+\.[\w.]+/', $noeud) === 1) {
                $cheminsFautifs[] = "valeur de forme e-mail en « {$chemin} » : {$noeud}";
            }

            // Un numéro : au moins huit chiffres consécutifs, espaces et séparateurs retirés.
            $chiffres = preg_replace('/[^0-9+]/', '', $noeud) ?? '';
            if (preg_match('/^\+?[0-9]{8,}$/', $chiffres) === 1 && preg_match('/[0-9]{6}/', $noeud) === 1) {
                $cheminsFautifs[] = "valeur de forme téléphone en « {$chemin} » : {$noeud}";
            }
        };

        $marcher($charge, '');

        return $cheminsFautifs;
    }

    public function test_ac3_lindex_des_agents_ne_porte_aucune_coordonnee_personnelle(): void
    {
        $agence = Agency::factory()->create([
            'email' => 'agence@exemple.test',
            'phone' => '+221338001122',
        ]);
        $this->agentEligible([
            'username' => 'awa-diop',
            'first_name' => 'Awa',
            'last_name' => 'Diop',
            'email' => 'awa.diop@exemple.test',
            'phone' => '+221771234567',
            'bio' => 'Joignable au +221771234567 ou sur awa.diop@exemple.test.',
        ], 1, 'Dakar', $agence);

        $reponse = $this->getJson('/api/public/agents')->assertOk();

        $this->assertSame('awa-diop', $reponse->json('data.0.slug'));
        $this->assertAucunContactPersonnel($reponse->json(), 'GET /api/public/agents');
    }

    public function test_ac3_lindex_des_agences_ne_porte_aucune_coordonnee_personnelle(): void
    {
        $agence = $this->agenceEligible([
            'name' => 'Sahel Homes',
            'slug' => 'sahel-homes',
            'email' => 'contact@sahel.test',
            'phone' => '+221338001122',
            'description' => 'Nous écrire : contact@sahel.test',
        ]);

        // Un membre d'équipe joignable, pour que l'index ait quelque chose à fuiter.
        $agent = $this->agentEligible([
            'username' => 'moussa-ndiaye',
            'email' => 'moussa@sahel.test',
            'phone' => '+221770001122',
        ], 1, 'Dakar', $agence);
        AgentProfile::factory()->create(['user_id' => $agent->id, 'agency_id' => $agence->id]);

        $reponse = $this->getJson('/api/public/agencies')->assertOk();

        $this->assertSame(['sahel-homes'], $this->slugs($reponse));
        $this->assertAucunContactPersonnel($reponse->json(), 'GET /api/public/agencies');
    }

    public function test_la_garde_de_pii_voit_reellement_une_fuite(): void
    {
        // Le contrôle de la garde : sans lui, `assertAucunContactPersonnel` pourrait ne rien
        // savoir voir et rendre exactement le même vert. La FICHE d'agence publie `email` et
        // `phone` — c'est une décision de TCK-177, hors périmètre ici — donc la garde DOIT y
        // échouer.
        $agence = $this->agenceEligible([
            'slug' => 'temoin',
            'email' => 'contact@temoin.test',
            'phone' => '+221338009988',
        ]);

        $charge = $this->getJson('/api/public/agencies/'.$agence->slug)->assertOk()->json();

        $trouvees = implode(' | ', $this->coordonneesTrouvees($charge));

        $this->assertNotSame(
            '',
            $trouvees,
            'La garde de PII n’a rien vu sur une charge qui porte pourtant `email` et `phone` : '.
            'elle ne prouve rien sur les index.',
        );
        // Les trois mécanismes de détection, chacun nommé — clé, valeur d'e-mail, valeur de
        // téléphone. Si l'un d'eux cessait de fonctionner, les deux autres masqueraient sa panne.
        $this->assertStringContainsString('clé « data.email »', $trouvees);
        $this->assertStringContainsString('contact@temoin.test', $trouvees);
        $this->assertStringContainsString('+221338009988', $trouvees);
    }

    // ════════════════════════════════════════════════════════════════════════════════════════════
    // Filtres, tri, facette
    // ════════════════════════════════════════════════════════════════════════════════════════════

    public function test_le_filtre_par_ville_porte_sur_les_villes_du_portefeuille(): void
    {
        $this->agenceEligible(['slug' => 'dakaroise'], 1, 'Dakar');
        $this->agenceEligible(['slug' => 'thiessoise'], 1, 'Thiès');

        $this->assertSame(
            ['dakaroise'],
            $this->slugs($this->getJson('/api/public/agencies?filter[city]=Dakar')->assertOk()),
        );

        // Le repli de casse passe par `CaseInsensitive` des DEUX côtés : `lower()` nu sous
        // `--locale=C` ne replierait pas le `È` (mesuré : `LOWER('THIÈS')` rend `thiÈs`), et
        // `strtolower()` de PHP non plus. C'est le seul cas du fichier qui distingue les deux
        // formes — un test qui ne chercherait que de l'ASCII resterait vert sur `LOWER()` nu.
        //
        // ⚠ `rawurlencode` n'est pas décoratif : `Request::create()` de Symfony, qui sert les
        // requêtes de test, rend des octets MALFORMÉS pour un caractère non-ASCII écrit tel quel
        // dans la chaîne de requête (mesuré le 2026-08-28 — un `filter[city]=THIÈS` littéral
        // produisait « Malformed UTF-8 characters » à la sérialisation). Un vrai client encode ;
        // le test doit encoder aussi, sans quoi il éprouve un défaut du harnais.
        $this->assertSame(
            ['thiessoise'],
            $this->slugs($this->getJson('/api/public/agencies?filter[city]='.rawurlencode('THIÈS'))->assertOk()),
        );
    }

    public function test_le_filtre_par_ville_sapplique_aussi_aux_agents(): void
    {
        $this->agentEligible(['username' => 'agent-dakar'], 1, 'Dakar');
        $this->agentEligible(['username' => 'agent-saly'], 1, 'Saly');

        $this->assertSame(
            ['agent-saly'],
            $this->slugs($this->getJson('/api/public/agents?filter[city]=saly')->assertOk()),
        );
    }

    public function test_la_recherche_par_nom_replie_la_casse_et_les_deux_index_la_servent(): void
    {
        $this->agenceEligible(['name' => 'Étoile Immobilier', 'slug' => 'etoile']);
        $this->agenceEligible(['name' => 'Sahel Homes', 'slug' => 'sahel']);

        $this->assertSame(
            ['etoile'],
            $this->slugs($this->getJson('/api/public/agencies?filter[search]='.rawurlencode('ÉTOILE'))->assertOk()),
        );

        // ⚠ Le cas ci-dessus ne suffit PAS à éprouver le repli ICU, et l'ablation l'a montré :
        // avec `LOWER()` nu + `strtolower()`, l'accent reste MAJUSCULE des deux côtés et la
        // comparaison passe quand même. Il faut que la casse de la lettre accentuée DIFFÈRE entre
        // la donnée et la recherche pour que le repli ASCII échoue — c'est ce que fait ce
        // second couple (`ÉCLAT` en base, `éclat` cherché).
        $this->agenceEligible(['name' => 'ÉCLAT PATRIMOINE', 'slug' => 'eclat']);
        $this->assertSame(
            ['eclat'],
            $this->slugs($this->getJson('/api/public/agencies?filter[search]='.rawurlencode('éclat'))->assertOk()),
        );

        $this->agentEligible(['username' => 'awa-diop', 'first_name' => 'Awa', 'last_name' => 'Diop']);
        $this->agentEligible(['username' => 'moussa-fall', 'first_name' => 'Moussa', 'last_name' => 'Fall']);

        $this->assertSame(
            ['moussa-fall'],
            $this->slugs($this->getJson('/api/public/agents?filter[search]=FALL')->assertOk()),
        );
    }

    public function test_le_tri_par_defaut_classe_par_volume_de_portefeuille(): void
    {
        $this->agenceEligible(['slug' => 'petite'], 1);
        $this->agenceEligible(['slug' => 'grande'], 3);
        $this->agenceEligible(['slug' => 'moyenne'], 2);

        $reponse = $this->getJson('/api/public/agencies')->assertOk();

        $this->assertSame(['grande', 'moyenne', 'petite'], $this->slugs($reponse));
        $this->assertSame([3, 2, 1], array_column($reponse->json('data'), 'portfolio_count'));

        // Et le tri demandé reste souverain — le tiebreak `id` n'écrase jamais le tri explicite.
        $this->assertSame(
            ['petite', 'moyenne', 'grande'],
            $this->slugs($this->getJson('/api/public/agencies?sort=portfolio_count')->assertOk()),
        );
    }

    public function test_un_tri_non_declare_est_refuse_par_un_422_et_non_par_une_400_de_spatie(): void
    {
        $this->agenceEligible();

        $this->getJson('/api/public/agencies?sort=commission_rate')->assertStatus(422);
        // `last_name` est admis sur les agents, pas sur les agences : la liste est PROPRE à
        // chaque route, elle n'est pas partagée.
        $this->getJson('/api/public/agencies?sort=last_name')->assertStatus(422);
        $this->getJson('/api/public/agents?sort=name')->assertStatus(422);
    }

    public function test_les_compteurs_par_contrat_et_les_villes_sont_derives_du_portefeuille(): void
    {
        $agence = Agency::factory()->create(['slug' => 'mixte', 'status' => AgencyStatus::Active]);
        $this->bienPublic(['agency_id' => $agence->id, 'contract_type' => ContractType::Rent], 'Dakar');
        $this->bienPublic(['agency_id' => $agence->id, 'contract_type' => ContractType::Rent], 'Dakar');
        $this->bienPublic(['agency_id' => $agence->id, 'contract_type' => ContractType::Sale], 'Thiès');
        // Un brouillon ne compte dans aucun des trois chiffres.
        Property::factory()->draft()->create(['agency_id' => $agence->id, 'contract_type' => ContractType::Sale]);

        $ligne = $this->getJson('/api/public/agencies')->assertOk()->json('data.0');

        $this->assertSame(3, $ligne['portfolio_count']);
        $this->assertSame(2, $ligne['rent_count']);
        $this->assertSame(1, $ligne['sale_count']);
        // La ville PRINCIPALE est celle où l'agence publie le plus, pas l'adresse de son siège.
        $this->assertSame('Dakar', $ligne['city']);
        $this->assertSame(['Dakar', 'Thiès'], $ligne['cities']);
    }

    public function test_la_note_moyenne_est_nulle_sans_avis_et_ne_compte_que_les_avis_approuves(): void
    {
        $note = $this->agenceEligible(['slug' => 'notee']);
        $sansNote = $this->agenceEligible(['slug' => 'sans-note']);

        Review::factory()->create([
            'reviewable_type' => Agency::class,
            'reviewable_id' => $note->id,
            'rating' => 5,
            'is_approved' => true,
        ]);
        Review::factory()->create([
            'reviewable_type' => Agency::class,
            'reviewable_id' => $note->id,
            'rating' => 4,
            'is_approved' => true,
        ]);
        Review::factory()->create([
            'reviewable_type' => Agency::class,
            'reviewable_id' => $note->id,
            'rating' => 1,
            'is_approved' => false,
        ]);

        $lignes = collect($this->getJson('/api/public/agencies')->assertOk()->json('data'))
            ->keyBy('slug');

        $this->assertSame(4.5, $lignes['notee']['reviews']['average']);
        $this->assertSame(2, $lignes['notee']['reviews']['count']);
        // `null` et non `0` : une moyenne de zéro est une très mauvaise note, une moyenne absente
        // est une absence.
        $this->assertNull($lignes['sans-note']['reviews']['average']);
        $this->assertSame(0, $lignes['sans-note']['reviews']['count']);
    }

    public function test_lagence_dun_agent_est_derivee_de_son_portefeuille(): void
    {
        $agence = Agency::factory()->create(['name' => 'Sahel Homes', 'slug' => 'sahel-homes']);
        $this->agentEligible(['username' => 'awa-diop'], 2, 'Dakar', $agence);

        // Un publieur SANS agence : le champ est nul, pas absent — le front distingue les deux.
        $this->agentEligible(['username' => 'independant'], 1);

        $lignes = collect($this->getJson('/api/public/agents')->assertOk()->json('data'))->keyBy('slug');

        $this->assertSame('sahel-homes', $lignes['awa-diop']['agency']['slug']);
        $this->assertSame('Sahel Homes', $lignes['awa-diop']['agency']['name']);
        $this->assertArrayHasKey('agency', $lignes['independant']);
        $this->assertNull($lignes['independant']['agency']);
    }

    public function test_lagence_dun_agent_nest_rendue_que_si_lindex_des_agences_laccepte(): void
    {
        // Incohérence relevée par la revue adverse : `/agents` liait une enseigne que
        // `/agencies` refuse de lister. Le test éprouve les DEUX bouts — l'agence suspendue est
        // absente de son propre index ET absente du champ `agency` de l'agent — sans quoi il
        // resterait vert sur la moitié de la correction.
        $suspendue = Agency::factory()->create([
            'name' => 'Enseigne Suspendue',
            'slug' => 'suspendue',
            'status' => AgencyStatus::Suspended,
        ]);
        $active = Agency::factory()->create([
            'name' => 'Enseigne Active',
            'slug' => 'active',
            'status' => AgencyStatus::Active,
        ]);

        $this->agentEligible(['username' => 'sous-suspendue'], 1, 'Dakar', $suspendue);
        $this->agentEligible(['username' => 'sous-active'], 1, 'Dakar', $active);

        $lignes = collect($this->getJson('/api/public/agents')->assertOk()->json('data'))
            ->keyBy('slug');

        $this->assertNull($lignes['sous-suspendue']['agency']);
        $this->assertSame('active', $lignes['sous-active']['agency']['slug']);

        // …et l'agence suspendue reste absente de son propre index, faute de quoi les deux
        // surfaces se contrediraient dans l'autre sens.
        $this->assertSame(
            ['active'],
            $this->slugs($this->getJson('/api/public/agencies')->assertOk()),
        );
    }

    public function test_la_facette_de_villes_est_derivee_du_catalogue_eligible(): void
    {
        $this->agenceEligible(['slug' => 'a'], 2, 'Dakar');
        $this->agenceEligible(['slug' => 'b'], 1, 'Thiès');

        // Une ville qui n'appartient qu'à un bien NON éligible ne doit pas entrer dans la facette :
        // proposer un filtre qui ne rendra jamais rien est une promesse fausse.
        $brouillon = Agency::factory()->create(['status' => AgencyStatus::Active]);
        $bien = Property::factory()->draft()->create(['agency_id' => $brouillon->id]);
        Address::factory()->create([
            'addressable_type' => Property::class,
            'addressable_id' => $bien->id,
            'city' => 'Ziguinchor',
        ]);

        $villes = $this->getJson('/api/public/agencies')->assertOk()->json('meta.cities');

        $this->assertSame(['Dakar', 'Thiès'], $villes);
        $this->assertNotContains('Ziguinchor', $villes);
    }
}
