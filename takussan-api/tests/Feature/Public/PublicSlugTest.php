<?php

namespace Tests\Feature\Public;

use App\Http\Resources\ReviewResource;
use App\Models\Address;
use App\Models\Agency;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\UserStatus;
use App\Models\Enums\VisitStatus;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\Review;
use App\Models\User;
use App\Services\Account\AccountDeletionService;
use App\Services\Public\PublicSlugService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-2519 — l'adresse d'une fiche dit qui l'on va voir (`/agents/sokhna-gueye`), et un lien déjà
 * partagé (`/agents/dakar-immo-owner-4`, un ancien slug) continue de mener à la bonne fiche.
 *
 * Chaque test de redirection porte son contrôle : l'adresse canonique répond SANS
 * `canonical_slug`, sans quoi un front qui redirigerait toujours bouclerait.
 */
class PublicSlugTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agence;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agence = Agency::factory()->create(['status' => AgencyStatus::Active, 'slug' => 'dakar-immo']);
    }

    /** Un agent en exercice qui publie un bien public. */
    private function agent(string $prenom, string $nom, string $username): User
    {
        $user = $this->publieur($prenom, $nom, $username);
        AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $this->agence->id]);

        return $user;
    }

    /** Un propriétaire : un bien public, aucun profil d'agent. */
    private function publieur(string $prenom, string $nom, string $username): User
    {
        $user = User::factory()->create([
            'first_name' => $prenom,
            'last_name' => $nom,
            'username' => $username,
            'status' => UserStatus::Active,
        ]);
        $bien = Property::factory()->published()->create(['user_id' => $user->id, 'agency_id' => $this->agence->id]);
        Address::factory()->create(['addressable_type' => Property::class, 'addressable_id' => $bien->id, 'city' => 'Dakar']);

        return $user;
    }

    private function remplir(): void
    {
        $this->artisan('users:public-slugs')->assertSuccessful();
    }

    // ── Le calcul ────────────────────────────────────────────────────────────────────────────────

    public function test_le_slug_d_un_agent_est_son_nom_translittere_en_minuscules_ascii(): void
    {
        $agent = $this->agent('Sokhna', 'Guèye', 'dakar-immo-agent-1');
        $this->remplir();

        $this->assertSame('sokhna-gueye', $agent->fresh()->public_slug);
    }

    public function test_ac2_deux_awa_diop_obtiennent_awa_diop_et_awa_diop_2(): void
    {
        $premiere = $this->agent('Awa', 'Diop', 'dakar-immo-agent-1');
        $seconde = $this->agent('AWA', 'DIOP', 'dakar-immo-agent-2');
        $this->remplir();

        $this->assertSame('awa-diop', $premiere->fresh()->public_slug);
        $this->assertSame('awa-diop-2', $seconde->fresh()->public_slug);
    }

    public function test_le_slug_d_un_proprietaire_est_abrege_comme_son_nom(): void
    {
        $proprietaire = $this->publieur('Awa', 'Diop', 'dakar-immo-owner-4');
        $this->remplir();

        // La fiche d'un propriétaire montre un nom abrégé (décision 1b) : le slug ne dit pas plus.
        $this->assertSame('awa-d', $proprietaire->fresh()->public_slug);
        $this->assertStringNotContainsString('diop', (string) $proprietaire->fresh()->public_slug);
    }

    public function test_un_slug_neuf_ne_prend_pas_le_username_d_un_autre_compte(): void
    {
        // Les liens `/agents/awa-diop` déjà partagés mènent à CE compte par son `username`.
        $this->publieur('Fatou', 'Sow', 'awa-diop');
        $agent = $this->agent('Awa', 'Diop', 'dakar-immo-agent-1');
        $this->remplir();

        $this->assertSame('awa-diop-2', $agent->fresh()->public_slug);
    }

    public function test_le_remplissage_est_idempotent(): void
    {
        $agent = $this->agent('Awa', 'Diop', 'dakar-immo-agent-1');
        $this->remplir();
        $avant = $agent->fresh()->only(['public_slug', 'metadata', 'updated_at']);

        $this->travel(5)->minutes();
        $this->artisan('users:public-slugs')->expectsOutputToContain('0 slug(s) écrit(s)')->assertSuccessful();

        $this->assertEquals($avant, $agent->fresh()->only(['public_slug', 'metadata', 'updated_at']));
    }

    public function test_un_compte_sans_fiche_publique_n_a_pas_de_slug(): void
    {
        $client = User::factory()->create(['first_name' => 'Moussa', 'last_name' => 'Fall', 'status' => UserStatus::Active]);
        $this->remplir();

        $this->assertNull($client->fresh()->public_slug);
    }

    // ── La résolution à trois niveaux ────────────────────────────────────────────────────────────

    public function test_ac1_l_ancienne_adresse_au_username_porte_le_slug_canonique(): void
    {
        $this->publieur('Awa', 'Diop', 'dakar-immo-owner-4');
        $this->remplir();

        $this->getJson('/api/public/agents/dakar-immo-owner-4')
            ->assertOk()
            ->assertJsonPath('data.slug', 'awa-d')
            ->assertJsonPath('data.canonical_slug', 'awa-d');

        // Le contrôle : l'adresse canonique ne redirige pas.
        $this->getJson('/api/public/agents/awa-d')
            ->assertOk()
            ->assertJsonPath('data.slug', 'awa-d')
            ->assertJsonMissingPath('data.canonical_slug');
    }

    public function test_ac3_apres_changement_de_nom_l_ancien_slug_redirige_vers_le_nouveau(): void
    {
        $agent = $this->agent('Awa', 'Diop', 'dakar-immo-agent-1');
        $this->remplir();

        $agent->fresh()->update(['last_name' => 'Ndiaye']);

        $frais = $agent->fresh();
        $this->assertSame('awa-ndiaye', $frais->public_slug);
        $this->assertSame(['awa-diop'], $frais->metadata['previous_public_slugs']);

        $this->getJson('/api/public/agents/awa-diop')
            ->assertOk()
            ->assertJsonPath('data.id', $agent->id)
            ->assertJsonPath('data.canonical_slug', 'awa-ndiaye');
        $this->getJson('/api/public/agents/awa-ndiaye')->assertOk()->assertJsonMissingPath('data.canonical_slug');
        // Le `username` mène toujours, lui aussi, au slug courant.
        $this->getJson('/api/public/agents/dakar-immo-agent-1')->assertJsonPath('data.canonical_slug', 'awa-ndiaye');
    }

    public function test_revenir_a_un_ancien_nom_reprend_l_ancien_slug_sans_le_garder_en_double(): void
    {
        $agent = $this->agent('Awa', 'Diop', 'dakar-immo-agent-1');
        $this->remplir();
        $agent->fresh()->update(['last_name' => 'Ndiaye']);
        $agent->fresh()->update(['last_name' => 'Diop']);

        $frais = $agent->fresh();
        $this->assertSame('awa-diop', $frais->public_slug);
        $this->assertSame(['awa-ndiaye'], $frais->metadata['previous_public_slugs']);
    }

    public function test_une_autre_casse_mene_a_la_fiche_et_redirige_vers_la_minuscule(): void
    {
        $this->agent('Awa', 'Diop', 'dakar-immo-agent-1');
        $this->remplir();

        $this->getJson('/api/public/agents/Awa-Diop')->assertOk()->assertJsonPath('data.canonical_slug', 'awa-diop');
    }

    public function test_l_ancien_slug_d_une_fiche_devenue_privee_rend_404(): void
    {
        $agent = $this->agent('Awa', 'Diop', 'dakar-immo-agent-1');
        $this->remplir();
        $agent->fresh()->update(['last_name' => 'Ndiaye']);

        // Le témoin : l'ancienne adresse mène bien à la fiche tant qu'elle est publique.
        $this->getJson('/api/public/agents/awa-diop')->assertOk();

        // Plus d'exercice, plus d'annonce, aucun choix d'annuaire : la fiche n'est plus publique.
        AgentProfile::query()->where('user_id', $agent->id)->delete();
        Property::query()->where('user_id', $agent->id)->delete();

        foreach (['awa-diop', 'awa-ndiaye', 'dakar-immo-agent-1'] as $adresse) {
            $this->getJson("/api/public/agents/{$adresse}")->assertNotFound();
        }
    }

    public function test_le_portefeuille_et_le_contact_se_resolvent_par_les_memes_trois_niveaux(): void
    {
        $agent = $this->agent('Awa', 'Diop', 'dakar-immo-agent-1');
        $this->remplir();
        $agent->fresh()->update(['last_name' => 'Ndiaye']);

        foreach (['awa-ndiaye', 'awa-diop', 'dakar-immo-agent-1'] as $adresse) {
            $this->getJson("/api/public/agents/{$adresse}/properties")->assertOk()->assertJsonCount(1, 'data');
        }
    }

    // ── AC4 — aucun émetteur ne sert `username` quand `public_slug` existe ───────────────────────

    public function test_ac4_tous_les_emetteurs_servent_le_slug_au_nom(): void
    {
        $agent = $this->agent('Sokhna', 'Guèye', 'dakar-immo-agent-1');
        $proprietaire = $this->publieur('Awa', 'Diop', 'dakar-immo-owner-4');
        $proprietaire->forceFill(['listed_in_public_directory' => true])->save();
        Review::factory()->create([
            'reviewable_type' => User::class,
            'reviewable_id' => $agent->id,
            'is_approved' => true,
        ]);
        $this->remplir();

        $surfaces = [
            'annuaire' => $this->getJson('/api/public/agents?per_page=48')->assertOk()->json('data.*.slug'),
            'fiche' => [$this->getJson('/api/public/agents/sokhna-gueye')->assertOk()->json('data.slug')],
            'équipe' => $this->getJson('/api/public/agencies/dakar-immo')->assertOk()->json('data.agents.*.slug'),
        ];
        // La fiche d'un bien (`PropertyResource::buildUserLite()`) : le bailleur et le contact.
        foreach (Property::query()->pluck('slug') as $bien) {
            $fiche = $this->getJson("/api/public/properties/{$bien}")->assertOk();
            $surfaces['fiche de bien'][] = $fiche->json('data.owner.slug');
            $surfaces['fiche de bien'][] = $fiche->json('data.primary_contact.slug');
        }
        $surfaces['fiche de bien'] = array_values(array_filter($surfaces['fiche de bien']));

        foreach ($surfaces as $surface => $slugs) {
            $this->assertNotEmpty($slugs, "{$surface} : rien n'a été émis, le balayage ne prouverait rien");
            foreach ($slugs as $s) {
                $this->assertNotContains($s, ['dakar-immo-agent-1', 'dakar-immo-owner-4'], "{$surface} sert encore un username");
            }
        }
        $this->assertEqualsCanonicalizing(['sokhna-gueye', 'awa-d'], $surfaces['annuaire']);
        $this->assertSame(['sokhna-gueye'], $surfaces['équipe']);
        $this->assertContains('sokhna-gueye', $surfaces['fiche de bien']);
        $this->assertContains('awa-d', $surfaces['fiche de bien']);

        // La cible d'un avis sur une personne (`ReviewResource::target.slug`).
        $avis = Review::query()->with('reviewable')->sole();
        $cible = (new ReviewResource($avis))->toArray(request());
        $this->assertSame('sokhna-gueye', $cible['target']['slug'] ?? null);
    }

    public function test_sans_slug_au_nom_les_emetteurs_gardent_le_username(): void
    {
        $this->agent('Awa', 'Diop', 'dakar-immo-agent-1');

        $this->getJson('/api/public/agents')->assertOk()->assertJsonPath('data.0.slug', 'dakar-immo-agent-1');
        $this->getJson('/api/public/agents/dakar-immo-agent-1')->assertOk()->assertJsonMissingPath('data.canonical_slug');
    }

    // ── Les garde-fous de la revue adverse ───────────────────────────────────────────────────────

    /**
     * La règle anti-détournement : un ancien slug reste RÉSERVÉ à son compte. Sans la réservation
     * (`previous_public_slugs` dans `PublicSlugService::pris()`), un homonyme prendrait `awa-diop`
     * et le lien déjà partagé de la première Awa Diop mènerait chez lui.
     */
    public function test_apres_un_renommage_un_homonyme_ne_prend_pas_l_ancien_slug(): void
    {
        $premiere = $this->agent('Awa', 'Diop', 'dakar-immo-agent-1');
        $this->remplir();
        $premiere->fresh()->update(['last_name' => 'Ndiaye']);
        $this->assertSame('awa-ndiaye', $premiere->fresh()->public_slug);

        $homonyme = $this->agent('Awa', 'Diop', 'dakar-immo-agent-2');
        $this->remplir();

        $this->assertSame('awa-diop-2', $homonyme->fresh()->public_slug);
        $this->getJson('/api/public/agents/awa-diop')->assertOk()
            ->assertJsonPath('data.id', $premiere->id)
            ->assertJsonPath('data.canonical_slug', 'awa-ndiaye');
    }

    /**
     * L'ordre des niveaux : `pris()` ne protège qu'au moment où un slug est CALCULÉ. Un `username`
     * posé ensuite (console, import, seed) qui égale le slug d'un autre ne doit pas détourner son
     * lien : le slug au nom passe d'abord.
     */
    public function test_un_username_pose_apres_le_slug_d_un_autre_ne_detourne_pas_la_fiche(): void
    {
        $agent = $this->agent('Awa', 'Diop', 'dakar-immo-agent-1');
        $this->remplir();
        $this->assertSame('awa-diop', $agent->fresh()->public_slug);

        $this->publieur('Fatou', 'Sow', 'awa-diop');

        $this->getJson('/api/public/agents/awa-diop')->assertOk()->assertJsonPath('data.id', $agent->id);
    }

    /**
     * La fiche se résout par le slug REPLIÉ en minuscules : `/agents/Awa-D`, lien partagé du
     * `username` `Awa-D`, mènerait au propriétaire qui prendrait `awa-d`. La réservation compare donc
     * le `username` sans la casse.
     */
    public function test_un_username_en_casse_mixte_reserve_son_slug_replie(): void
    {
        $fatou = $this->publieur('Fatou', 'Sow', 'Awa-D');
        $awa = $this->publieur('Awa', 'Diop', 'dakar-immo-owner-4');
        $this->remplir();

        $this->assertSame('awa-d-2', $awa->fresh()->public_slug);
        $this->getJson('/api/public/agents/Awa-D')->assertOk()->assertJsonPath('data.id', $fatou->id);
    }

    /**
     * L'effacement d'un compte efface son slug, tiré du NOM : il ne survit pas dans `public_slug`,
     * et il n'est plus réservé (`pris()` lit aussi les comptes supprimés) — une nouvelle Sokhna Gueye
     * peut le prendre.
     */
    public function test_un_compte_efface_perd_son_slug_et_libere_le_nom(): void
    {
        $agent = $this->agent('Sokhna', 'Gueye', 'dakar-immo-agent-1');
        $this->remplir();
        // Un ancien nom aussi, pour que l'effacement ait des deux à effacer.
        $agent->fresh()->update(['last_name' => 'Gueye-Fall']);
        $agent->fresh()->update(['last_name' => 'Gueye']);
        $this->assertSame('sokhna-gueye', $agent->fresh()->public_slug);
        $this->assertSame(['sokhna-gueye-fall'], $agent->fresh()->metadata['previous_public_slugs'] ?? null);

        app(AccountDeletionService::class)->anonymize($agent->fresh(), false);

        $efface = User::withTrashed()->findOrFail($agent->id);
        $this->assertNull($efface->public_slug);
        $this->assertNull($efface->metadata);

        $nouvelle = $this->agent('Sokhna', 'Gueye', 'dakar-immo-agent-2');
        $this->remplir();
        $this->assertSame('sokhna-gueye', $nouvelle->fresh()->public_slug);
    }

    /** `ReviewEligibility::opportunities` — l'invitation à noter un agent porte son slug au nom. */
    public function test_l_invitation_a_noter_un_agent_sert_son_slug_au_nom(): void
    {
        $agent = $this->agent('Sokhna', 'Gueye', 'dakar-immo-agent-1');
        $this->remplir();
        $visiteur = User::factory()->create(['status' => UserStatus::Active]);
        PropertyVisit::factory()->create([
            'property_id' => Property::query()->where('user_id', $agent->id)->value('id'),
            'visitor_id' => $visiteur->id,
            'agent_id' => $agent->id,
            'status' => VisitStatus::Completed,
        ]);

        $this->actingAs($visiteur)->getJson('/api/me/review-opportunities')->assertOk()
            ->assertJsonPath('data.0.type', 'agent')
            ->assertJsonPath('data.0.subject.slug', 'sokhna-gueye');
    }

    public function test_le_service_ne_pose_rien_sans_nom(): void
    {
        $anonyme = User::factory()->create(['first_name' => '', 'last_name' => '', 'username' => 'u-123']);

        $this->assertNull(app(PublicSlugService::class)->base($anonyme, 'agent'));
        $this->assertFalse(app(PublicSlugService::class)->assigner($anonyme, 'agent'));
        $this->assertNull($anonyme->fresh()->public_slug);
    }
}
