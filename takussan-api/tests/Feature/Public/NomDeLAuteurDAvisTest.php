<?php

namespace Tests\Feature\Public;

use App\Models\Agency;
use App\Models\Enums\AgencyStatus;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\Review;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * TCK-537 (décision du porteur du 2026-11-16) — l'auteur d'un avis montré au public est nommé par son
 * prénom et l'initiale de son nom : « Awa N. ». Le nom de famille, choisi introuvable ailleurs
 * (« Ndiouckmbaye »), ne figure dans AUCUN octet des trois réponses publiques qui servent des avis —
 * fiche de bien, d'agent, d'agence —, même pour un lecteur connecté qui modère l'agence.
 *
 * La console garde le nom entier pour qui en a l'usage : l'auteur lui-même, et qui modère.
 */
class NomDeLAuteurDAvisTest extends ApiTestCase
{
    use RefreshDatabase;

    private const NOM = 'Ndiouckmbaye';

    private Agency $agence;

    private User $agent;

    private User $auteur;

    private Property $bien;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agence = Agency::factory()->create(['status' => AgencyStatus::Active, 'slug' => 'dakar-immo']);
        $this->agent = User::factory()->create(['username' => 'awa-diop', 'status' => 'active']);
        AgentProfile::factory()->create(['user_id' => $this->agent->id, 'agency_id' => $this->agence->id]);
        $this->bien = Property::factory()->published()->create(['agency_id' => $this->agence->id]);
        $this->auteur = User::factory()->create([
            'first_name' => 'Awa',
            'last_name' => self::NOM,
            'username' => 'awa.'.mb_strtolower(self::NOM),
        ]);

        foreach ([$this->bien, $this->agent, $this->agence] as $sujet) {
            Review::factory()->create([
                'reviewable_type' => $sujet::class,
                'reviewable_id' => $sujet->id,
                'author_id' => $this->auteur->id,
                'rating' => 5,
                'title' => 'Très bien',
                'content' => 'Suivi sérieux.',
                'is_approved' => true,
                'approved_at' => now(),
            ]);
        }
    }

    public function test_la_fiche_de_bien_nomme_l_auteur_par_son_prenom_et_son_initiale(): void
    {
        $reponse = $this->getJson("/api/public/properties/{$this->bien->slug}/reviews")->assertOk();

        $this->assertSame('Awa N.', $reponse->json('data.0.author.name'));
        $this->assertStringNotContainsStringIgnoringCase(self::NOM, $reponse->getContent());
    }

    public function test_la_fiche_d_agent_nomme_l_auteur_par_son_prenom_et_son_initiale(): void
    {
        $reponse = $this->getJson('/api/public/agents/awa-diop')->assertOk();

        $this->assertSame('Awa N.', $reponse->json('data.reviews.recent.0.author.name'));
        $this->assertStringNotContainsStringIgnoringCase(self::NOM, $reponse->getContent());
    }

    public function test_la_fiche_d_agence_nomme_l_auteur_par_son_prenom_et_son_initiale(): void
    {
        $reponse = $this->getJson('/api/public/agencies/dakar-immo')->assertOk();

        $this->assertSame('Awa N.', $reponse->json('data.reviews.recent.0.author.name'));
        $this->assertStringNotContainsStringIgnoringCase(self::NOM, $reponse->getContent());
    }

    public function test_une_route_publique_abrege_meme_pour_qui_modere(): void
    {
        $admin = User::factory()->create();
        $this->materializeRoleProfile($admin, 'agency_admin', $this->agence);
        $this->actingAsApi($admin);

        foreach ([
            "/api/public/properties/{$this->bien->slug}/reviews",
            '/api/public/agents/awa-diop',
            '/api/public/agencies/dakar-immo',
        ] as $url) {
            $this->assertStringNotContainsStringIgnoringCase(self::NOM, $this->getJson($url)->assertOk()->getContent(), $url);
        }
    }

    public function test_l_auteur_lit_son_nom_entier_dans_sa_console(): void
    {
        $this->actingAsApi($this->auteur);

        $noms = collect($this->getJson('/api/reviews?filter[author_id]=me')->assertOk()->json('data'))->pluck('author.name');

        $this->assertNotEmpty($noms);
        $this->assertSame(['Awa '.self::NOM], $noms->unique()->values()->all());
    }

    public function test_qui_modere_lit_le_nom_entier_dans_la_file(): void
    {
        $admin = User::factory()->create();
        $this->materializeRoleProfile($admin, 'agency_admin', $this->agence);
        $this->actingAsApi($admin);

        $noms = collect($this->getJson('/api/reviews')->assertOk()->json('data'))->pluck('author.name');

        $this->assertNotEmpty($noms);
        $this->assertContains('Awa '.self::NOM, $noms->all());
    }

    /**
     * TCK-1781 (P175.05, ex-`ReviewAuthorNameTest`, versé par TCK-3017) — l'API ne rend pas de libellé pour un
     * auteur sans nom : `author.name` est nul, et le front écrit « Anonyme » dans la langue du lecteur
     * (principe n°5). Un compte supprimé, puis un compte sans nom ni identifiant.
     */
    public function test_un_auteur_supprime_ou_sans_nom_n_a_pas_de_nom(): void
    {
        $supprime = User::factory()->create();
        $sansNom = User::factory()->create(['first_name' => '', 'last_name' => '', 'username' => null]);

        foreach ([$supprime, $sansNom] as $auteur) {
            $bien = Property::factory()->published()->create();
            Review::factory()->create([
                'reviewable_type' => Property::class, 'reviewable_id' => $bien->id, 'author_id' => $auteur->id,
                'rating' => 4, 'is_approved' => true, 'approved_at' => now(),
            ]);
            $biens[$auteur->id] = $bien;
        }
        $supprime->delete();

        $this->getJson("/api/public/properties/{$biens[$supprime->id]->slug}/reviews")
            ->assertOk()
            ->assertJsonPath('data.0.author.name', null);
        $this->getJson("/api/public/properties/{$biens[$sansNom->id]->slug}/reviews")
            ->assertOk()
            ->assertJsonPath('data.0.author.id', $sansNom->id)
            ->assertJsonPath('data.0.author.name', null);
    }
}
