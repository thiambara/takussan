<?php

namespace Tests\Feature\Public;

use App\Models\Address;
use App\Models\Agency;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\UserStatus;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use App\Services\Public\PublicProfileFacts;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-2574 — la fiche d'un propriétaire sert l'agence qui gère ses biens publics
 * (`managing_agency`), et ni la fiche ni l'annuaire ne servent son nom de famille.
 *
 * La règle de l'agence est celle que l'annuaire servait déjà sous `agency`
 * ({@see PublicProfileFacts::agences()}) : chaque test interroge les DEUX
 * surfaces pour le même propriétaire et exige la même réponse — deux règles différentes enverraient
 * le visiteur vers deux agences selon la page d'où il vient.
 */
class FicheProprietaireAgenceDeGestionTest extends TestCase
{
    use RefreshDatabase;

    /** Un nom de famille qu'aucun slug, aucune fabrique ni aucun texte ne produit par hasard. */
    private const NOM_PROPRIETAIRE = 'Zwengbaoui';

    private const NOM_AGENT = 'Kpelleyaro';

    private function proprietaire(string $username, string $nom = self::NOM_PROPRIETAIRE): User
    {
        $user = User::factory()->create([
            'username' => $username,
            'public_slug' => null,
            'first_name' => 'Sokhna',
            'last_name' => $nom,
            'status' => UserStatus::Active,
            // L'annuaire ne liste un propriétaire que s'il l'a choisi (TCK-2506).
            'listed_in_public_directory' => true,
        ]);
        OwnerProfile::factory()->create(['user_id' => $user->id]);

        return $user;
    }

    private function biens(User $user, ?Agency $agence, int $nombre = 1): void
    {
        for ($i = 0; $i < $nombre; $i++) {
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
    }

    /** @return array{0: mixed, 1: mixed} l'agence de gestion lue sur la fiche, puis sur l'annuaire */
    private function agenceDesDeuxSurfaces(string $slug): array
    {
        $fiche = $this->getJson("/api/public/agents/{$slug}")->assertOk();
        $ligne = collect($this->getJson('/api/public/agents?per_page=48')->assertOk()->json('data'))
            ->firstWhere('slug', $slug);
        $this->assertNotNull($ligne, "« {$slug} » doit figurer dans l'annuaire");

        // Même valeur sous `agency` dans l'annuaire, qui la servait déjà (TCK-436).
        $this->assertSame($ligne['managing_agency'], $ligne['agency']);

        return [$fiche->json('data.managing_agency'), $ligne['managing_agency']];
    }

    public function test_ac1_tous_ses_biens_geres_par_une_agence_la_fiche_et_l_annuaire_la_servent(): void
    {
        $agence = Agency::factory()->create(['name' => 'Dakar Immo', 'slug' => 'dakar-immo', 'status' => AgencyStatus::Active]);
        $this->biens($this->proprietaire('sokhna-owner'), $agence, 3);

        [$fiche, $annuaire] = $this->agenceDesDeuxSurfaces('sokhna-owner');

        $this->assertSame(['id' => $agence->id, 'slug' => 'dakar-immo', 'name' => 'Dakar Immo'], $fiche);
        $this->assertSame($fiche, $annuaire);
        // `agency` reste le rattachement de la PERSONNE : un propriétaire n'en a pas.
        $this->getJson('/api/public/agents/sokhna-owner')->assertJsonPath('data.agency', null);
    }

    public function test_ac2_sans_agence_la_cle_est_nulle_sur_les_deux_surfaces(): void
    {
        $this->biens($this->proprietaire('sokhna-seule'), null, 2);

        [$fiche, $annuaire] = $this->agenceDesDeuxSurfaces('sokhna-seule');

        $this->assertNull($fiche);
        $this->assertNull($annuaire);
        $this->getJson('/api/public/agents/sokhna-seule')->assertJsonPath('data.managing_agency', null);
    }

    public function test_ac2_un_espace_individuel_n_est_pas_une_agence_de_gestion(): void
    {
        // L'espace solo que « Publier » crée (`kind: individual`) n'a pas de page `/agencies/…` :
        // le servir enverrait le visiteur vers un 404 à la place du formulaire du propriétaire.
        $espace = Agency::factory()->individual()->create(['slug' => 'espace-de-sokhna']);
        $this->biens($this->proprietaire('sokhna-espace'), $espace, 2);

        [$fiche, $annuaire] = $this->agenceDesDeuxSurfaces('sokhna-espace');

        $this->assertNull($fiche);
        $this->assertNull($annuaire);
        $this->getJson('/api/public/agencies/espace-de-sokhna')->assertNotFound();
    }

    public function test_ac2_plusieurs_agences_la_majoritaire_et_a_egalite_la_plus_ancienne(): void
    {
        $premiere = Agency::factory()->create(['slug' => 'premiere']);
        $seconde = Agency::factory()->create(['slug' => 'seconde']);

        $majorite = $this->proprietaire('sokhna-majorite');
        $this->biens($majorite, $premiere, 1);
        $this->biens($majorite, $seconde, 2);
        // Des biens sans agence ne comptent pas : ils ne désignent aucune agence à qui écrire.
        $this->biens($majorite, null, 4);

        [$fiche, $annuaire] = $this->agenceDesDeuxSurfaces('sokhna-majorite');
        $this->assertSame('seconde', $fiche['slug']);
        $this->assertSame($fiche, $annuaire);

        $egalite = $this->proprietaire('sokhna-egalite');
        $this->biens($egalite, $seconde, 1);
        $this->biens($egalite, $premiere, 1);

        [$fiche, $annuaire] = $this->agenceDesDeuxSurfaces('sokhna-egalite');
        $this->assertSame('premiere', $fiche['slug']);
        $this->assertSame($fiche, $annuaire);
    }

    public function test_ac3_ni_la_fiche_ni_l_annuaire_ne_servent_le_nom_de_famille_d_un_proprietaire(): void
    {
        $agence = Agency::factory()->create(['slug' => 'dakar-immo']);
        $this->biens($this->proprietaire('sokhna-owner'), $agence, 2);

        $agent = User::factory()->create([
            'username' => 'moussa-agent',
            'public_slug' => null,
            'first_name' => 'Moussa',
            'last_name' => self::NOM_AGENT,
            'status' => UserStatus::Active,
        ]);
        AgentProfile::factory()->create(['user_id' => $agent->id, 'agency_id' => $agence->id]);
        $this->biens($agent, $agence, 1);

        $fiche = $this->getJson('/api/public/agents/sokhna-owner')->assertOk();
        $annuaire = $this->getJson('/api/public/agents?per_page=48')->assertOk();

        // Balayage du corps BRUT, casse repliée : portefeuille et avis compris.
        $this->assertStringNotContainsStringIgnoringCase(self::NOM_PROPRIETAIRE, $fiche->getContent());
        $this->assertStringNotContainsStringIgnoringCase(self::NOM_PROPRIETAIRE, $annuaire->getContent());

        $fiche->assertJsonPath('data.full_name', 'Sokhna Z.')
            ->assertJsonPath('data.first_name', 'Sokhna')
            ->assertJsonPath('data.last_name', 'Z.');
        $ligne = collect($annuaire->json('data'))->firstWhere('slug', 'sokhna-owner');
        $this->assertSame('Sokhna Z.', $ligne['full_name']);
        $this->assertSame('Z.', $ligne['last_name']);

        // L'agent garde son nom complet : sans cette moitié, un champ toujours abrégé passerait.
        $ficheAgent = $this->getJson('/api/public/agents/moussa-agent')->assertOk();
        $this->assertStringContainsString(self::NOM_AGENT, $ficheAgent->getContent());
        $ficheAgent->assertJsonPath('data.full_name', 'Moussa '.self::NOM_AGENT);
        $this->assertStringContainsString(self::NOM_AGENT, $annuaire->getContent());
    }

    public function test_ac3_la_recherche_de_l_annuaire_ne_retrouve_pas_un_proprietaire_par_son_nom_de_famille(): void
    {
        // Sans cette règle, une recherche préfixe lettre à lettre reconstituait le nom que la
        // réponse ne sert plus.
        $agence = Agency::factory()->create();
        $this->biens($this->proprietaire('sokhna-owner'), $agence, 1);

        $agent = User::factory()->create([
            'username' => 'moussa-agent',
            'first_name' => 'Moussa',
            'last_name' => self::NOM_AGENT,
            'status' => UserStatus::Active,
        ]);
        AgentProfile::factory()->create(['user_id' => $agent->id, 'agency_id' => $agence->id]);
        $this->biens($agent, $agence, 1);

        $slugs = fn (string $q) => array_column(
            $this->getJson('/api/public/agents?filter[search]='.rawurlencode($q))->assertOk()->json('data'),
            'slug',
        );

        $this->assertSame([], $slugs('zweng'));
        $this->assertSame(['sokhna-owner'], $slugs('sokhna'));
        $this->assertSame(['moussa-agent'], $slugs('kpelle'));
    }
}
