<?php

namespace Tests\Feature\Visits;

use App\Models\Agency;
use App\Models\Enums\VisitStatus;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2779 — `GET /api/property-visits` sous `fields[property_visits]` : aucune règle de lecture ne se
 * juge plus sur les colonnes que la ligne rendue porte. Relevé avant le correctif : sans `customer_id`
 * dans `fields`, le bailleur d'un bien d'agence lisait `visitor_name`, `visitor_phone` et
 * `visitor_email` du client de l'agence (la fiche se lisait « absente », donc la visite « sans
 * fiche »), et, sous `include=visitor`, le bloc du compte (e-mail, téléphone).
 *
 * Chaque refus a son jumeau : un lecteur qui y a droit lit la même valeur sous les mêmes `fields`.
 */
class VisitesChampsDemandesTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $agence;

    private Property $bien;

    private User $bailleur;

    private User $agent;

    private User $visiteur;

    private PropertyVisit $visite;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->agence = $this->agence();
        $this->bailleur = $this->bailleur($this->agence);
        $this->bien = $this->bienDe($this->agence, $this->bailleur);
        $this->agent = $this->personnel($this->agence);
        $this->visiteur = $this->client();
        $this->visite = PropertyVisit::factory()->create([
            'property_id' => $this->bien->id,
            'agent_id' => $this->agent->id,
            'visitor_id' => $this->visiteur->id,
            'customer_id' => $this->ficheClient($this->agence, $this->visiteur)->id,
            'status' => VisitStatus::Completed,
            'scheduled_at' => now()->subDay(),
            'notes' => 'Code du portail : 1234',
            'metadata' => ['feedback_agent' => 'Hésite sur le loyer'],
            'visitor_name' => 'Mariama Fall',
            'visitor_phone' => '+221771112233',
            'visitor_email' => 'mariama@example.test',
            'report_outcome' => 'interested',
            'reported_at' => now()->subHours(2),
            'reported_by_id' => $this->agent->id,
        ]);
    }

    /** @return array<string, array{string}> */
    public static function champsEtroits(): array
    {
        // TCK-2797 — la réponse ne rend plus que les clés nommées : `visitor_display` et `report` y
        // sont NOMMÉS, sans quoi leur refus serait vrai faute de demande, et non par la garde. Aucun
        // ne remet au `SELECT` la colonne que chaque cas retire (`report` y ajoute `reported_at` et
        // `report_*`, ni `customer_id`, ni `property_id`, ni `visitor_id`).
        return [
            'sans customer_id' => ['id,status,property_id,visitor_id,visitor_name,visitor_phone,visitor_email,notes,metadata,reported_at,visitor_display,report'],
            'sans property_id' => ['id,status,customer_id,visitor_id,visitor_name,visitor_phone,visitor_email,notes,metadata,reported_at,visitor_display,report'],
            'sans visitor_id' => ['id,status,property_id,customer_id,visitor_name,visitor_phone,visitor_email,notes,metadata,reported_at,visitor_display,report'],
            'le visiteur seul' => ['id,visitor_name,visitor_phone,visitor_email,visitor_display,notes,metadata,report'],
        ];
    }

    /** @return array<string, mixed> */
    private function ligne(User $lecteur, string $requete): array
    {
        Sanctum::actingAs($lecteur);
        $reponse = $this->getJson('/api/property-visits?'.$requete)->assertOk();
        $ligne = collect($reponse->json('data'))->firstWhere('id', $this->visite->id);
        $this->assertNotNull($ligne, "la visite manque à la liste de {$lecteur->id} ({$requete})");

        return $ligne;
    }

    #[DataProvider('champsEtroits')]
    public function test_le_bailleur_ne_lit_ni_le_visiteur_ni_la_fiche_ni_les_outils_de_la_console(string $champs): void
    {
        $ligne = $this->ligne($this->bailleur, "fields[property_visits]={$champs}");

        $this->assertNull($ligne['visitor_name'] ?? null);
        $this->assertNull($ligne['visitor_phone'] ?? null);
        $this->assertNull($ligne['visitor_email'] ?? null);
        $this->assertNull($ligne['customer_id'] ?? null);
        $this->assertNull($ligne['visitor_display'] ?? null);
        $this->assertArrayNotHasKey('notes', $ligne);
        $this->assertArrayNotHasKey('metadata', $ligne);
        $this->assertArrayNotHasKey('report', $ligne);
    }

    #[DataProvider('champsEtroits')]
    public function test_jumeau_le_personnel_lit_le_visiteur_sous_les_memes_fields(string $champs): void
    {
        $ligne = $this->ligne($this->agent, "fields[property_visits]={$champs}");

        $this->assertSame('Mariama Fall', $ligne['visitor_name']);
        $this->assertSame('+221771112233', $ligne['visitor_phone']);
        $this->assertSame('mariama@example.test', $ligne['visitor_email']);
        $this->assertSame('+221771112233', $ligne['visitor_display']['phone'] ?? null);
        $this->assertArrayHasKey('notes', $ligne);
        $this->assertArrayHasKey('metadata', $ligne);
    }

    public function test_le_bailleur_ne_lit_ni_le_compte_ni_la_fiche_par_include_sous_des_fields_etroits(): void
    {
        $ligne = $this->ligne($this->bailleur, 'include=visitor,customer&fields[property_visits]=id,visitor_id');

        $this->assertNull($ligne['visitor']);
        $this->assertNull($ligne['customer']);
    }

    public function test_jumeau_le_personnel_lit_le_compte_et_la_fiche_par_include_sans_property_id(): void
    {
        $ligne = $this->ligne($this->agent, 'include=visitor,customer&fields[property_visits]=id,visitor_id,customer_id');

        $this->assertSame($this->visite->customer_id, $ligne['customer']['id'] ?? null);
        $this->assertSame($this->visiteur->id, $ligne['visitor']['id'] ?? null);
        $this->assertSame($this->visite->customer_id, $ligne['customer_id']);
    }

    public function test_jumeau_le_visiteur_lit_son_telephone_sans_property_id_ni_visitor_id(): void
    {
        $ligne = $this->ligne($this->visiteur, 'fields[property_visits]=id,visitor_phone');

        $this->assertSame('+221771112233', $ligne['visitor_phone']);
    }

    public function test_le_compte_rendu_suit_le_personnel_sans_property_id_et_ne_sort_que_nomme(): void
    {
        // TCK-2797 — `report` nommé suffit : la ressource met au `SELECT` `reported_at` et `report_*`,
        // que l'appelant n'a pas à demander.
        $avec = $this->ligne($this->agent, 'fields[property_visits]=id,status,report');
        $this->assertSame('interested', $avec['report']['outcome'] ?? null);
        $this->assertSame($this->agent->id, $avec['report']['reported_by']['id'] ?? null);

        // Non nommé : la clé n'est pas rendue (`report: null` se lirait « compte rendu à faire »).
        $sans = $this->ligne($this->agent, 'fields[property_visits]=id,status,reported_at');
        $this->assertArrayNotHasKey('report', $sans);

        $bailleur = $this->ligne($this->bailleur, 'fields[property_visits]=id,status,report');
        $this->assertArrayNotHasKey('report', $bailleur);
    }

    public function test_un_geste_rend_le_compte_rendu_comme_avant_sans_fields(): void
    {
        // La visite que le personnel planifie naît sans `reported_at` dans ses attributs : sans
        // `fields`, la réponse garde `report: null`, comme avant le ticket.
        Sanctum::actingAs($this->agent);

        $data = $this->postJson('/api/property-visits', [
            'property_id' => $this->bien->id,
            'customer_id' => $this->visite->customer_id,
            'agent_id' => $this->agent->id,
            'scheduled_at' => $this->creneau(3, 11),
        ])->assertCreated()->json('data');

        $this->assertArrayHasKey('report', $data);
        $this->assertNull($data['report']);
    }

    public function test_un_bien_a_la_corbeille_ferme_la_fiche_et_le_compte_rendu_comme_avant(): void
    {
        // Le personnel ouvre encore la visite (la liste, elle, ne la porte plus) ; la relation
        // `property` d'un bien supprimé est `null`, et la fiche comme le compte rendu se fermaient.
        $this->bien->delete();
        Sanctum::actingAs($this->agent);

        $detail = $this->getJson("/api/property-visits/{$this->visite->id}")->assertOk()->json('data');

        $this->assertNull($detail['customer_id']);
        $this->assertNull($detail['customer']);
        $this->assertNull($detail['visitor_name']);
        $this->assertNull($detail['visitor']);
        $this->assertArrayNotHasKey('report', $detail);
    }

    public function test_jumeau_le_meme_detail_sur_un_bien_vivant(): void
    {
        Sanctum::actingAs($this->agent);

        $detail = $this->getJson("/api/property-visits/{$this->visite->id}")->assertOk()->json('data');

        $this->assertSame($this->visite->customer_id, $detail['customer_id']);
        $this->assertSame('Mariama Fall', $detail['visitor_name']);
        $this->assertSame('interested', $detail['report']['outcome'] ?? null);
    }

    public function test_le_nombre_de_requetes_ne_depend_pas_de_la_taille_de_la_page(): void
    {
        Sanctum::actingAs($this->agent);
        $compter = function (string $requete): int {
            DB::flushQueryLog();
            DB::enableQueryLog();
            $this->getJson('/api/property-visits?'.$requete)->assertOk();
            $n = count(DB::getQueryLog());
            DB::disableQueryLog();

            return $n;
        };

        $une = $compter('per_page=20&fields[property_visits]=id,visitor_phone');
        PropertyVisit::factory()->count(19)->create([
            'property_id' => $this->bien->id, 'agent_id' => $this->agent->id, 'status' => VisitStatus::Confirmed,
            'customer_id' => $this->ficheClient($this->agence, $this->client())->id,
        ]);
        $vingt = $compter('per_page=20&fields[property_visits]=id,visitor_phone');
        $sansChamps = $compter('per_page=20');

        $this->assertSame($une, $vingt);
        $this->assertLessThanOrEqual($sansChamps, $vingt);
        // TCK-2797 (AC6) — le relevé de TCK-2779, sous les clés calculées nommées comme sans elles.
        $this->assertLessThanOrEqual(12, $vingt);
        $this->assertLessThanOrEqual(12, $compter('per_page=20&fields[property_visits]=id,status,visitor_display,report'));
    }

    /* ─────────── TCK-2797 — la réponse ne rend que `id` et les clés de `fields[property_visits]` ─────────── */

    /** @return list<string> */
    private static function cles(array $ligne): array
    {
        $cles = array_keys($ligne);
        sort($cles);

        return $cles;
    }

    public function test_ac1_la_ligne_ne_rend_que_les_cles_demandees(): void
    {
        foreach ([$this->agent, $this->bailleur] as $lecteur) {
            $ligne = $this->ligne($lecteur, 'fields[property_visits]=id,scheduled_at,status,preferred_window');

            $this->assertSame(['id', 'preferred_window', 'scheduled_at', 'status'], self::cles($ligne));
        }
    }

    public function test_les_blocs_de_relation_suivent_include_et_non_fields(): void
    {
        $ligne = $this->ligne($this->agent, 'include=property,agent&fields[property_visits]=id,status,property_id,agent_id&fields[properties]=id,title&fields[users]=id,first_name,last_name');

        $this->assertSame(['agent', 'agent_id', 'id', 'property', 'property_id', 'status'], self::cles($ligne));
        $this->assertSame($this->bien->id, $ligne['property']['id'] ?? null);
    }

    public function test_id_est_toujours_rendu(): void
    {
        $ligne = $this->ligne($this->agent, 'fields[property_visits]=status');

        $this->assertSame(['id', 'status'], self::cles($ligne));
    }

    public function test_ac2_visitor_display_se_demande_et_se_juge_comme_sans_fields(): void
    {
        $sansFiche = PropertyVisit::factory()->create([
            'property_id' => $this->bien->id, 'agent_id' => null, 'visitor_id' => null, 'customer_id' => null,
            'status' => VisitStatus::Scheduled, 'scheduled_at' => now()->addDays(2),
            'visitor_name' => 'Awa Ndiaye', 'visitor_phone' => '+221775556677',
        ]);

        foreach ([$this->agent, $this->bailleur] as $lecteur) {
            Sanctum::actingAs($lecteur);
            $sans = collect($this->getJson('/api/property-visits')->assertOk()->json('data'))->keyBy('id');
            $avec = collect($this->getJson('/api/property-visits?fields[property_visits]=id,visitor_display')->assertOk()->json('data'))->keyBy('id');

            foreach ([$this->visite->id, $sansFiche->id] as $id) {
                $this->assertSame(['id', 'visitor_display'], self::cles($avec[$id]));
                $this->assertSame($sans[$id]['visitor_display'], $avec[$id]['visitor_display'], "lecteur {$lecteur->id}, visite {$id}");
            }
        }

        // Le jumeau et le refus, nommés : le personnel lit la carte, le bailleur la carte réduite
        // d'une demande sans fiche, et rien d'une visite à fiche de l'agence.
        Sanctum::actingAs($this->agent);
        $agent = collect($this->getJson('/api/property-visits?fields[property_visits]=id,visitor_display')->json('data'))->keyBy('id');
        $this->assertSame('customer', $agent[$this->visite->id]['visitor_display']['kind'] ?? null);
        Sanctum::actingAs($this->bailleur);
        $bailleur = collect($this->getJson('/api/property-visits?fields[property_visits]=id,visitor_display')->json('data'))->keyBy('id');
        $this->assertNull($bailleur[$this->visite->id]['visitor_display']);
        $this->assertSame('+221775556677', $bailleur[$sansFiche->id]['visitor_display']['phone'] ?? null);
    }

    public function test_un_nom_inconnu_reste_refuse_et_abilities_ne_sort_pas_d_une_liste(): void
    {
        Sanctum::actingAs($this->agent);
        $this->getJson('/api/property-visits?fields[property_visits]=id,nexistepas')->assertStatus(400);

        $ligne = $this->ligne($this->agent, 'fields[property_visits]=id,abilities');
        $this->assertSame(['id'], self::cles($ligne));
    }

    public function test_le_detail_suit_fields_et_rend_abilities_nomme(): void
    {
        Sanctum::actingAs($this->agent);

        $nomme = $this->getJson("/api/property-visits/{$this->visite->id}?fields[property_visits]=id,status,abilities")->assertOk()->json('data');
        $this->assertSame(['abilities', 'agent', 'customer', 'id', 'property', 'status', 'visitor'], self::cles($nomme));
        $this->assertTrue($nomme['abilities']['manage']);

        $sans = $this->getJson("/api/property-visits/{$this->visite->id}?fields[property_visits]=id,status")->assertOk()->json('data');
        $this->assertArrayNotHasKey('abilities', $sans);
    }

    public function test_report_nomme_rend_null_quand_rien_n_est_ecrit(): void
    {
        // « Compte rendu à faire » : la clé est là, et vide — la visite n'en a pas.
        $aFaire = PropertyVisit::factory()->create([
            'property_id' => $this->bien->id, 'agent_id' => $this->agent->id, 'visitor_id' => null, 'customer_id' => null,
            'status' => VisitStatus::Completed, 'scheduled_at' => now()->subDay(),
        ]);
        Sanctum::actingAs($this->agent);
        $ligne = collect($this->getJson('/api/property-visits?fields[property_visits]=id,status,report')->assertOk()->json('data'))
            ->firstWhere('id', $aFaire->id);

        $this->assertArrayHasKey('report', $ligne);
        $this->assertNull($ligne['report']);
    }
}
