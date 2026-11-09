<?php

namespace Tests\Feature\Public;

use App\Models\Address;
use App\Models\Agency;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Enums\UserStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * TCK-2506 — un propriétaire particulier ne paraît dans l'annuaire public que s'il l'a choisi.
 *
 * Chaque test d'annuaire crée les DEUX sortes de personnes et affirme les deux faits : un filtre
 * qui écarterait tout le monde (ou personne) cocherait la moitié d'une assertion écrite pour une
 * seule. Le défaut `false` est éprouvé sur la COLONNE (compte créé sans la clé), pas sur la
 * fabrique.
 */
class PublicDirectoryOwnerOptInTest extends TestCase
{
    use RefreshDatabase;

    private const DEMANDE = [
        'name' => 'Moussa Fall',
        'email' => 'moussa@example.test',
        'message' => 'Bonjour, je cherche un F3 aux Almadies.',
    ];

    private function publieur(string $username, ?Agency $agence = null, bool $avecBien = true): User
    {
        $user = User::factory()->create([
            'username' => $username,
            'first_name' => 'Awa',
            'last_name' => 'Diop',
            'status' => UserStatus::Active,
        ]);

        if ($avecBien) {
            $bien = Property::factory()->published()->create([
                'user_id' => $user->id,
                'agency_id' => $agence?->id,
            ]);
            Address::factory()->create([
                'addressable_type' => Property::class,
                'addressable_id' => $bien->id,
                'city' => 'Dakar',
            ]);
        }

        return $user;
    }

    /** @return list<string> */
    private function usernamesListes(TestResponse $reponse): array
    {
        $ids = array_column($reponse->assertOk()->json('data'), 'id');

        return User::query()->whereIn('id', $ids)->pluck('username')->sort()->values()->all();
    }

    public function test_la_colonne_vaut_false_pour_un_compte_cree_sans_la_preciser(): void
    {
        $user = $this->publieur('awa-defaut');

        $this->assertFalse($user->fresh()->listed_in_public_directory);
    }

    public function test_un_proprietaire_n_est_pas_liste_par_defaut_un_agent_l_est(): void
    {
        $agence = Agency::factory()->create(['status' => AgencyStatus::Active]);

        $proprietaire = $this->publieur('awa-proprietaire', $agence);
        OwnerProfile::factory()->create(['user_id' => $proprietaire->id, 'agency_id' => $agence->id]);

        $agent = $this->publieur('moussa-agent', $agence);
        AgentProfile::factory()->create(['user_id' => $agent->id, 'agency_id' => $agence->id]);

        $this->assertSame(['moussa-agent'], $this->usernamesListes($this->getJson('/api/public/agents')));
    }

    public function test_un_proprietaire_qui_l_a_choisi_est_liste_comme_proprietaire(): void
    {
        $proprietaire = $this->publieur('awa-sur-option');
        $this->publieur('fatou-discrete');
        $proprietaire->forceFill(['listed_in_public_directory' => true])->save();

        $reponse = $this->getJson('/api/public/agents');

        $this->assertSame(['awa-sur-option'], $this->usernamesListes($reponse));
        $reponse->assertJsonPath('data.0.public_role', 'owner');
    }

    public function test_l_admin_d_une_agence_standard_est_liste_l_hote_d_un_espace_individuel_non(): void
    {
        $standard = Agency::factory()->create(['status' => AgencyStatus::Active]);
        $espace = Agency::factory()->individual()->create(['status' => AgencyStatus::Active]);

        $admin = $this->publieur('admin-standard', $standard);
        AgencyAdminProfile::factory()->create(['user_id' => $admin->id, 'agency_id' => $standard->id]);

        $hote = $this->publieur('hote-espace', $espace);
        AgencyAdminProfile::factory()->create(['user_id' => $hote->id, 'agency_id' => $espace->id]);

        $this->assertSame(['admin-standard'], $this->usernamesListes($this->getJson('/api/public/agents')));
    }

    public function test_un_profil_d_agent_suspendu_ne_vaut_pas_exercice(): void
    {
        $agence = Agency::factory()->create(['status' => AgencyStatus::Active]);
        $suspendu = $this->publieur('agent-suspendu', $agence);
        AgentProfile::factory()->suspended()->create(['user_id' => $suspendu->id, 'agency_id' => $agence->id]);

        $this->assertSame([], $this->usernamesListes($this->getJson('/api/public/agents')));
    }

    public function test_la_fiche_d_un_proprietaire_non_liste_ouverte_depuis_son_annonce_repond_200_non_indexable(): void
    {
        $this->publieur('awa-annonce');

        $this->getJson('/api/public/agents/awa-annonce')
            ->assertOk()
            ->assertJsonPath('data.public_role', 'owner')
            ->assertJsonPath('data.indexable', false);
    }

    public function test_la_fiche_d_un_proprietaire_liste_ou_d_un_agent_est_indexable(): void
    {
        $agence = Agency::factory()->create(['status' => AgencyStatus::Active]);
        $liste = $this->publieur('awa-listee');
        $liste->forceFill(['listed_in_public_directory' => true])->save();
        $agent = $this->publieur('moussa-agent', $agence);
        AgentProfile::factory()->create(['user_id' => $agent->id, 'agency_id' => $agence->id]);

        $this->getJson('/api/public/agents/awa-listee')->assertOk()->assertJsonPath('data.indexable', true);
        $this->getJson('/api/public/agents/moussa-agent')->assertOk()->assertJsonPath('data.indexable', true);
    }

    /**
     * Sans annonce publique ni choix, aucune page ne mène à la fiche d'un particulier : elle
     * n'existe pas. Avant, `show()` servait le nom de N'IMPORTE QUEL compte actif par son
     * `username`, client compris.
     */
    public function test_la_fiche_d_un_particulier_sans_annonce_publique_ni_choix_rend_404(): void
    {
        $this->publieur('client-sans-bien', avecBien: false);

        $this->getJson('/api/public/agents/client-sans-bien')->assertNotFound();
        $this->getJson('/api/public/agents/client-sans-bien/properties')->assertNotFound();
        // Le contact suit la fiche : sans elle, on ne dépose pas de demande au nom d'un client.
        $this->postJson('/api/public/agents/client-sans-bien/contact-lead', self::DEMANDE)->assertNotFound();
    }

    /**
     * « Une annonce PUBLIQUE », pas « un bien » : un brouillon ou un bien privé n'est relié à aucune
     * page publique, il n'ouvre donc pas de fiche. Sans ce test, `publicPortfolio()` remplacé par
     * n'importe quel bien laissait la suite verte.
     */
    public function test_un_brouillon_ou_un_bien_prive_n_ouvre_pas_de_fiche(): void
    {
        $agence = Agency::factory()->create(['status' => AgencyStatus::Active]);
        $proprietaire = $this->publieur('proprio-sans-annonce', avecBien: false);
        OwnerProfile::factory()->create(['user_id' => $proprietaire->id, 'agency_id' => $agence->id]);
        Property::factory()->draft()->create(['user_id' => $proprietaire->id, 'agency_id' => $agence->id]);
        Property::factory()->create([
            'user_id' => $proprietaire->id,
            'agency_id' => $agence->id,
            'visibility' => PropertyVisibility::Private,
        ]);
        // Témoin : le même compte avec une annonce publique a sa fiche.
        $this->publieur('proprio-temoin');

        $this->getJson('/api/public/agents/proprio-temoin')->assertOk();
        $this->getJson('/api/public/agents/proprio-sans-annonce')->assertNotFound();
        $this->getJson('/api/public/agents/proprio-sans-annonce/properties')->assertNotFound();
        $this->postJson('/api/public/agents/proprio-sans-annonce/contact-lead', self::DEMANDE)->assertNotFound();
    }

    /**
     * Le chemin réel d'un agent : `AuthController::register` ne pose aucun `username`, seul
     * `users:public-slugs` lui donne une adresse. L'index exigeait un `username` non nul : un agent
     * en exercice inscrit par le formulaire n'y paraissait jamais.
     */
    public function test_un_agent_sans_username_parait_dans_l_annuaire_par_son_slug_au_nom(): void
    {
        $agence = Agency::factory()->create(['status' => AgencyStatus::Active]);
        $agent = $this->publieur('a-effacer', $agence);
        $agent->forceFill(['username' => null, 'first_name' => 'Sokhna', 'last_name' => 'Gueye'])->save();
        AgentProfile::factory()->create(['user_id' => $agent->id, 'agency_id' => $agence->id]);
        $this->artisan('users:public-slugs')->assertSuccessful();

        $this->assertNull($agent->fresh()->username);
        $this->assertSame('sokhna-gueye', $agent->fresh()->public_slug);
        $lignes = $this->getJson('/api/public/agents?per_page=48')->assertOk()->json('data');
        $this->assertSame([[$agent->id, 'sokhna-gueye']], array_map(fn (array $l) => [$l['id'], $l['slug']], $lignes));
        $this->getJson('/api/public/agents/sokhna-gueye')->assertOk()->assertJsonPath('data.id', $agent->id);
    }

    public function test_un_agent_sans_annonce_garde_sa_fiche(): void
    {
        $agence = Agency::factory()->create(['status' => AgencyStatus::Active]);
        $agent = $this->publieur('agent-sans-bien', $agence, avecBien: false);
        AgentProfile::factory()->create(['user_id' => $agent->id, 'agency_id' => $agence->id]);

        $this->getJson('/api/public/agents/agent-sans-bien')->assertOk();
    }

    public function test_le_compte_change_lui_meme_sa_preference_par_patch_me(): void
    {
        $user = $this->publieur('awa-moi');

        $this->actingAs($user)
            ->patchJson('/api/me', ['listed_in_public_directory' => true])
            ->assertOk()
            ->assertJsonPath('data.listed_in_public_directory', true);

        $this->assertTrue($user->fresh()->listed_in_public_directory);

        $this->actingAs($user)
            ->patchJson('/api/me', ['listed_in_public_directory' => false])
            ->assertOk()
            ->assertJsonPath('data.listed_in_public_directory', false);

        $this->assertFalse($user->fresh()->listed_in_public_directory);
    }

    public function test_la_preference_refuse_une_valeur_non_booleenne(): void
    {
        $user = $this->publieur('awa-moi');

        $this->actingAs($user)
            ->patchJson('/api/me', ['listed_in_public_directory' => 'peut-etre'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('listed_in_public_directory');
    }

    /**
     * « Ni l'agence, ni la plateforme » : la colonne est hors `$fillable`, donc aucun remplissage
     * en masse — formulaire d'agence, import, console — ne peut l'écrire à la place du compte.
     */
    public function test_la_preference_n_est_pas_assignable_en_masse(): void
    {
        $user = $this->publieur('awa-masse');
        $user->fill(['listed_in_public_directory' => true])->save();

        $this->assertFalse($user->fresh()->listed_in_public_directory);
    }

    public function test_la_preference_ne_sort_que_pour_soi(): void
    {
        $agence = Agency::factory()->create(['status' => AgencyStatus::Active]);
        $moi = $this->publieur('awa-moi', $agence);

        $this->actingAs($moi)->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('listed_in_public_directory', false);

        // La fiche publique ne dit pas le réglage, elle en applique la conséquence (`indexable`).
        $this->getJson('/api/public/agents/awa-moi')
            ->assertOk()
            ->assertJsonMissingPath('data.listed_in_public_directory');
    }
}
