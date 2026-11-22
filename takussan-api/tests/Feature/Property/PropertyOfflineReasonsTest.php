<?php

namespace Tests\Feature\Property;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\AgencyStatus;
use App\Models\Lease;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\PlatformProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;

/**
 * TCK-2678 (ADR-0097 § 5) — un bien hors ligne dit pourquoi : `offline_reasons`, la liste des
 * conditions de « en ligne » qu'il ne remplit pas, lue sur LA liste de conditions que
 * `scopePublic` applique ({@see Property::conditionsEnLigne()}).
 *
 * L'oracle écrit à la main (un motif attendu par bien) est ce qui fait rougir le test si l'on retire
 * une condition de la liste : la parité seule resterait verte, les deux côtés lisant la même liste.
 * Le jeu de biens est celui de TCK-2637 (`PropertyOnlineFlagTest`).
 */
class PropertyOfflineReasonsTest extends ApiTestCase
{
    use RefreshDatabase;

    private User $root;

    private User $owner;

    private Agency $active;

    private Agency $suspended;

    /** @var array<string, Property> */
    private array $biens = [];

    /** L'oracle : le motif de chaque bien du jeu, dans l'ordre d'affichage. */
    private const MOTIFS = [
        'En ligne' => [],
        'Statut validé' => [],
        'Sans agence' => [],
        'Privé' => ['private'],
        'Jamais publié' => ['not_published'],
        'Loué' => ['status_rented'],
        'Agence suspendue' => ['agency_inactive'],
        'Bien de test' => ['test'],
        'Brouillon' => ['status_draft'],
    ];

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo('2026-11-11 10:00:00');

        $this->root = User::factory()->withTwoFactor()->create();
        PlatformProfile::factory()->superAdmin()->create(['user_id' => $this->root->id]);

        $this->active = Agency::factory()->create(['status' => AgencyStatus::Active]);
        $this->suspended = Agency::factory()->create(['status' => AgencyStatus::Suspended]);
        $this->owner = User::factory()->create();

        $this->bien('En ligne');
        $this->bien('Statut validé', ['status' => 'published']);
        $this->bien('Sans agence', ['agency_id' => null]);
        $this->bien('Privé', ['visibility' => 'private']);
        $this->bien('Jamais publié', ['published_at' => null]);
        $this->bien('Loué', ['status' => 'rented']);
        $this->bien('Agence suspendue', [], $this->suspended);
        $this->bien('Bien de test', ['is_test' => true]);
        $this->bien('Brouillon', ['status' => 'draft']);
    }

    private function bien(string $title, array $attributes = [], ?Agency $agency = null): Property
    {
        return $this->biens[$title] = Property::factory()->create($attributes + [
            'title' => $title,
            'user_id' => $this->owner->id,
            'agency_id' => ($agency ?? $this->active)->id,
            'status' => 'available',
            'visibility' => 'public',
            'published_at' => '2026-10-01 10:00:00',
            'is_test' => false,
        ]);
    }

    /** @return array<string, array<int, string>> titre → motifs, lus sur la liste */
    private function motifsDeLaListe(string $requete): array
    {
        $rows = $this->getJson('/api/properties?per_page=100&include=offlineReasons'.$requete)->assertOk()->json('data');

        return array_combine(array_column($rows, 'title'), array_column($rows, 'offline_reasons'));
    }

    /** AC1 — chaque bien a l'oracle, même sur une liste qui n'a pas lu `status` ; vide ⇔ en ligne ⇔ `filter[public]=1`. */
    public function test_ac1_les_motifs_de_la_liste_suivent_l_oracle_et_le_filtre_public(): void
    {
        $this->actingAsApi($this->root);

        $motifs = $this->motifsDeLaListe('&fields[properties]=id,title');
        $this->assertEqualsCanonicalizing(array_keys(self::MOTIFS), array_keys($motifs));
        foreach (self::MOTIFS as $titre => $attendus) {
            $this->assertSame($attendus, $motifs[$titre], $titre);
        }

        $publics = array_column($this->getJson('/api/properties?per_page=100&filter[public]=1&fields[properties]=id,title')->assertOk()->json('data'), 'title');
        $sansMotif = array_keys(array_filter($motifs, fn (array $m) => $m === []));
        $this->assertEqualsCanonicalizing($publics, $sansMotif, 'offline_reasons vide ⇔ filter[public]=1');

        $enLigne = $this->getJson('/api/properties?per_page=100&include=online,offlineReasons&fields[properties]=id,title')->assertOk()->json('data');
        foreach ($enLigne as $ligne) {
            $this->assertSame($ligne['offline_reasons'] === [], $ligne['is_online'], $ligne['title']);
        }
    }

    /** AC1 — la fiche et le modèle lisent la même liste. */
    public function test_la_fiche_et_le_modele_rendent_les_memes_motifs(): void
    {
        $this->actingAsApi($this->root);

        foreach ($this->biens as $titre => $property) {
            $this->assertSame(self::MOTIFS[$titre], $property->offlineReasons(), "modèle — {$titre}");
            $this->assertSame(self::MOTIFS[$titre] === [], $property->isOnline(), "isOnline — {$titre}");
            $this->assertSame(self::MOTIFS[$titre], $this->getJson("/api/properties/{$property->id}?include=offlineReasons")
                ->assertOk()->json('data.offline_reasons'), "fiche — {$titre}");
        }
    }

    /** AC2 — en attente de revue, privé, agence suspendue : trois codes, dans l'ordre. */
    public function test_ac2_les_motifs_se_cumulent_dans_l_ordre(): void
    {
        $this->actingAsApi($this->root);

        $bien = $this->bien('Cumul', ['status' => 'pending_review', 'visibility' => 'private'], $this->suspended);
        $this->assertSame(
            ['agency_inactive', 'status_pending_review', 'private'],
            $this->getJson("/api/properties/{$bien->id}?include=offlineReasons")->assertOk()->json('data.offline_reasons'),
        );

        $tout = $this->bien('Tout', ['status' => 'rented', 'visibility' => 'private', 'published_at' => null, 'is_test' => true], $this->suspended);
        $this->assertSame(
            ['agency_inactive', 'status_rented', 'not_published', 'private', 'test'],
            $this->motifsDeLaListe('&fields[properties]=id,title')['Tout'],
        );
        $this->assertSame(['agency_inactive', 'status_rented', 'not_published', 'private', 'test'], $tout->offlineReasons());
    }

    /** `offline_reasons` se demande par `include=offlineReasons`, jamais par `fields[]` (ADR-0021, ADR-0097 § 1). */
    public function test_offline_reasons_suit_son_inclusion(): void
    {
        $this->actingAsApi($this->root);
        $id = $this->biens['Privé']->id;

        $this->assertArrayNotHasKey('offline_reasons', $this->getJson('/api/properties?per_page=1')->assertOk()->json('data.0'));
        $this->assertArrayNotHasKey('offline_reasons', $this->getJson('/api/properties?per_page=1&include=online')->assertOk()->json('data.0'));
        $this->assertArrayNotHasKey('offline_reasons', $this->getJson("/api/properties/{$id}?include=online")->assertOk()->json('data'));
        $this->getJson('/api/properties?per_page=1&fields[properties]=id,offline_reasons')->assertStatus(400);
    }

    /** Le bailleur du bien, qui le lit dans la console, lit son motif. */
    public function test_le_bailleur_du_bien_lit_son_motif(): void
    {
        OwnerProfile::factory()->create(['user_id' => $this->owner->id, 'agency_id' => $this->active->id]);
        $this->actingAsApi($this->owner->fresh());

        $this->assertSame(['private'], $this->getJson("/api/properties/{$this->biens['Privé']->id}?include=offlineReasons")
            ->assertOk()->json('data.offline_reasons'));
    }

    /** AC3 — jamais par les routes publiques : un bien hors ligne n'y existe pas, un bien en ligne n'y porte aucun motif. */
    public function test_ac3_la_route_publique_ne_sert_jamais_de_motif(): void
    {
        $horsLigne = $this->biens['Privé'];
        $reponse = $this->getJson("/api/public/properties/{$horsLigne->slug}?include=offlineReasons")->assertNotFound();
        $this->assertStringNotContainsString('offline_reasons', $reponse->getContent());

        $enLigne = $this->biens['En ligne'];
        $public = $this->getJson("/api/public/properties/{$enLigne->slug}?include=offlineReasons");
        $this->assertStringNotContainsString('offline_reasons', $public->getContent());
    }

    /*
     * Qui lit les motifs (team-lead, 2026-11-13) : le personnel de l'agence du bien et son bailleur
     * SEULEMENT. Le public, un client, un autre bailleur ne reçoivent ni la clé ni le moindre code
     * (« test », « agency_inactive »…) — {@see \App\Services\Property\MotifsHorsLigne}.
     */

    /** Le texte d'une réponse ne contient aucun code de motif, ni la clé. */
    private function assertAucunMotif(string $contenu, string $qui): void
    {
        $this->assertStringNotContainsString('offline_reasons', $contenu, $qui);
        foreach (['agency_inactive', 'status_rented', 'status_draft', 'not_published', '"test"', '"private"'] as $code) {
            $this->assertStringNotContainsString($code, $contenu, "{$qui} — {$code}");
        }
    }

    public function test_le_personnel_de_l_agence_lit_les_motifs_de_son_parc(): void
    {
        $admin = User::factory()->create();
        AgencyAdminProfile::factory()->create(['user_id' => $admin->id, 'agency_id' => $this->active->id]);
        $this->actingAsApi($admin->fresh());

        $motifs = $this->motifsDeLaListe('&fields[properties]=id,title');
        $this->assertSame(['test'], $motifs['Bien de test']);
        $this->assertSame(['status_rented'], $motifs['Loué']);
        $this->assertSame(['test'], $this->getJson("/api/properties/{$this->biens['Bien de test']->id}?include=offlineReasons")
            ->assertOk()->json('data.offline_reasons'));
    }

    public function test_fuite_le_public_ne_recoit_aucun_motif(): void
    {
        $test = $this->biens['Bien de test'];
        $this->assertAucunMotif($this->getJson('/api/properties?include=offlineReasons')->assertUnauthorized()->getContent(), 'liste');
        $this->assertAucunMotif($this->getJson("/api/properties/{$test->id}?include=offlineReasons")->assertUnauthorized()->getContent(), 'fiche');
        $this->assertAucunMotif($this->getJson('/api/public/properties?include=offlineReasons')->getContent(), 'liste publique');
        $this->assertAucunMotif($this->getJson("/api/public/properties/{$test->slug}?include=offlineReasons")->getContent(), 'fiche publique');
    }

    /** Le locataire du bien loué, client de l'agence : ni la fiche, ni une ligne avec un motif. */
    public function test_fuite_un_client_ne_recoit_aucun_motif(): void
    {
        $client = User::factory()->create();
        $dossier = Customer::factory()->create(['user_id' => $client->id, 'agency_id' => $this->active->id]);
        Lease::factory()->active()->create([
            'property_id' => $this->biens['Loué']->id, 'tenant_id' => $dossier->id,
            'landlord_id' => $this->owner->id, 'agency_id' => $this->active->id,
        ]);
        $this->actingAsApi($client->fresh());

        $this->assertAucunMotif($this->getJson('/api/properties?per_page=100&include=online,offlineReasons')->assertOk()->getContent(), 'liste');
        foreach (['Loué', 'Bien de test', 'Agence suspendue'] as $titre) {
            $this->assertAucunMotif($this->getJson("/api/properties/{$this->biens[$titre]->id}?include=offlineReasons")->assertForbidden()->getContent(), $titre);
        }
    }

    /** Un autre bailleur de la même agence lit le motif de SON bien, jamais celui des biens d'un autre. */
    public function test_fuite_un_autre_bailleur_ne_lit_que_le_motif_de_son_bien(): void
    {
        $autre = User::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $autre->id, 'agency_id' => $this->active->id]);
        $this->bien('Le sien', ['user_id' => $autre->id, 'visibility' => 'private']);
        $this->actingAsApi($autre->fresh());

        $this->assertSame(['Le sien' => ['private']], $this->motifsDeLaListe(''));
        foreach (['Bien de test', 'Loué', 'Privé'] as $titre) {
            $this->assertAucunMotif($this->getJson("/api/properties/{$this->biens[$titre]->id}?include=offlineReasons")->assertForbidden()->getContent(), $titre);
        }
    }

    /**
     * La garde, là où `view` et la portée de la liste laissent passer : un agent de l'agence, qui agit
     * sous son profil BAILLEUR d'une autre agence, voit ses saisies (portée de la liste, `view` par
     * l'auteur personnel actif) — sans leur motif : dans ce contexte, il n'est ni le personnel du bien
     * (profil actif) ni son bailleur.
     */
    public function test_fuite_un_agent_sous_son_profil_bailleur_ne_lit_pas_le_motif_de_ses_saisies(): void
    {
        $agent = User::factory()->create();
        AgentProfile::factory()->create(['user_id' => $agent->id, 'agency_id' => $this->active->id]);
        $ailleurs = OwnerProfile::factory()->create(['user_id' => $agent->id, 'agency_id' => Agency::factory()->create()->id]);
        $saisi = $this->bien('Saisi', ['user_id' => $agent->id, 'is_test' => true]);
        $this->actingAsApi($agent->fresh());
        $sousBailleur = ['X-Profile-Id' => "owner:{$ailleurs->id}"];

        $lignes = $this->withHeaders($sousBailleur)->getJson('/api/properties?per_page=100&include=offlineReasons&fields[properties]=id,title')->assertOk()->json('data');
        $this->assertSame(['Saisi'], array_column($lignes, 'title'), 'la portée de la liste rend la saisie');
        $this->assertAucunMotif(json_encode($lignes), 'liste sous le profil bailleur');

        $fiche = $this->withHeaders($sousBailleur)->getJson("/api/properties/{$saisi->id}?include=offlineReasons")->assertOk();
        $this->assertAucunMotif($fiche->getContent(), 'fiche sous le profil bailleur');
    }
}
