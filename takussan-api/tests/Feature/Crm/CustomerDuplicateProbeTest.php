<?php

namespace Tests\Feature\Crm;

use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\Customer;
use App\Models\Enums\Capability;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\User;
use App\Services\Crm\CustomerDuplicateDetector;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Symfony\Component\HttpFoundation\Response;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2588 — la sonde de doublon pendant la saisie : les fiches de l'agence ACTIVE au même
 * téléphone normalisé ou au même e-mail replié, `{id, name, stage}`, cinq au plus, rien d'autre.
 * Réservée à qui peut créer une fiche (403 au bailleur) ; limitée en débit.
 */
class CustomerDuplicateProbeTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $agence;

    private User $agent;

    private Customer $mariama;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agence = $this->agence();
        $this->agent = $this->personnel($this->agence);
        $this->mariama = $this->ficheClient($this->agence, null, [
            'first_name' => 'Mariama', 'last_name' => 'Fall', 'phone' => '+221706482056',
            'email' => 'Mariama.Fall@example.com', 'pipeline_stage' => CustomerPipelineStage::Qualified,
            'id_number' => '1234567890123', 'occupation' => 'Juriste',
        ]);
    }

    /** AC5 — l'agent de son agence la trouve, sous les deux écritures du « + » dans l'URL. */
    public function test_ac5_l_agent_de_l_agence_trouve_mariama(): void
    {
        Sanctum::actingAs($this->agent);

        $attendu = [['id' => $this->mariama->id, 'name' => 'Mariama Fall', 'stage' => 'qualified']];
        // Écrit tel quel, le « + » arrive décodé en espace.
        $this->assertSame($attendu, $this->getJson('/api/customers/duplicates?phone=+221706482056')->assertOk()->json('data'));
        $this->assertSame($attendu, $this->getJson('/api/customers/duplicates?phone=%2B221706482056')->assertOk()->json('data'));
        $this->assertSame($attendu, $this->getJson('/api/customers/duplicates?phone=70%20648%2020%2056')->assertOk()->json('data'));
        $this->assertSame($attendu, $this->getJson('/api/customers/duplicates?email=mariama.fall@EXAMPLE.com')->assertOk()->json('data'));

        $this->assertSame([], $this->getJson('/api/customers/duplicates?phone=%2B221700000000')->assertOk()->json('data'));
    }

    /** Rien d'autre que l'identifiant, le nom et l'étape : ni pièce, ni téléphone, ni profession. */
    public function test_la_sonde_ne_rend_que_trois_champs(): void
    {
        Sanctum::actingAs($this->agent);
        $corps = $this->getJson('/api/customers/duplicates?phone=%2B221706482056')->assertOk();

        $this->assertSame(['id', 'name', 'stage'], array_keys($corps->json('data.0')));
        foreach (['1234567890123', 'Juriste', '706482056', 'example.com'] as $secret) {
            $this->assertStringNotContainsString($secret, $corps->getContent());
        }
    }

    /** AC5 — un agent d'une autre agence : liste vide ; un bailleur : 403, avant la validation. */
    public function test_ac5_autre_agence_vide_et_bailleur_403(): void
    {
        Sanctum::actingAs($this->personnel($this->agence()));
        $this->getJson('/api/customers/duplicates?phone=%2B221706482056')->assertOk()->assertExactJson(['data' => []]);

        Sanctum::actingAs($this->bailleur($this->agence));
        $this->getJson('/api/customers/duplicates?phone=%2B221706482056')->assertForbidden();
        $this->getJson('/api/customers/duplicates')->assertForbidden();

        Sanctum::actingAs($this->client());
        $this->getJson('/api/customers/duplicates?phone=%2B221706482056')->assertForbidden();
    }

    /** Sans `crm.view_all`, le doublon d'un collègue se signale sans nom, sans identifiant, sans étape. */
    public function test_sans_vue_globale_le_doublon_se_signale_sans_rien_livrer(): void
    {
        $role = AgencyRole::factory()->for($this->agence)->withCapabilities([Capability::PropertiesCreate])->create();
        Sanctum::actingAs($this->personnel($this->agence, agencyRole: $role));

        $this->getJson('/api/customers/duplicates?phone=%2B221706482056')
            ->assertOk()
            ->assertExactJson(['data' => [['id' => null, 'name' => null, 'stage' => null]]]);
    }

    public function test_un_critere_est_requis(): void
    {
        Sanctum::actingAs($this->agent);
        $this->getJson('/api/customers/duplicates')->assertStatus(422);
    }

    public function test_la_sonde_est_limitee_a_20_par_minute(): void
    {
        Sanctum::actingAs($this->agent);
        for ($i = 0; $i < 20; $i++) {
            $this->getJson('/api/customers/duplicates?email=x'.$i.'@example.com')->assertOk();
        }
        $this->getJson('/api/customers/duplicates?email=y@example.com')->assertStatus(429);
    }

    /**
     * TCK-2590 (AC3) — « 70 648 20 » montre déjà Mariama : un numéro sénégalais entamé de sept
     * chiffres se compare par préfixe, sous toutes ses écritures.
     */
    public function test_tck2590_sept_chiffres_trouvent_mariama_par_prefixe(): void
    {
        Sanctum::actingAs($this->agent);

        $attendu = [['id' => $this->mariama->id, 'name' => 'Mariama Fall', 'stage' => 'qualified']];
        foreach (['70%20648%2020', '%2B2217064820', '+2217064820', '002217064820', '70648205'] as $saisie) {
            $this->assertSame($attendu, $this->getJson('/api/customers/duplicates?phone='.$saisie)->assertOk()->json('data'), $saisie);
        }
        // Un préfixe qui n'est pas le sien ne la rend pas.
        $this->assertSame([], $this->getJson('/api/customers/duplicates?phone=70%20648%2021')->assertOk()->json('data'));
    }

    /** TCK-2590 — six chiffres ne sondent rien, même quand ils sont le début d'une fiche. */
    public function test_tck2590_six_chiffres_ne_sondent_rien(): void
    {
        Sanctum::actingAs($this->agent);

        $this->getJson('/api/customers/duplicates?phone=70%20648%202')->assertOk()->assertExactJson(['data' => []]);
        $this->getJson('/api/customers/duplicates?phone=%2B221706482')->assertOk()->assertExactJson(['data' => []]);
    }

    /** TCK-2590 — le préfixe ne sort pas de l'agence active : la fiche d'une autre agence au même début n'est pas rendue. */
    public function test_tck2590_le_prefixe_reste_dans_l_agence(): void
    {
        $autre = $this->agence();
        $this->ficheClient($autre, null, ['first_name' => 'Awa', 'last_name' => 'Ndiaye', 'phone' => '+221706482099']);

        Sanctum::actingAs($this->agent);
        $this->assertSame(
            [$this->mariama->id],
            array_column($this->getJson('/api/customers/duplicates?phone=7064820')->assertOk()->json('data'), 'id'),
        );

        Sanctum::actingAs($this->personnel($autre));
        $this->assertSame(['Awa Ndiaye'], array_column($this->getJson('/api/customers/duplicates?phone=7064820')->assertOk()->json('data'), 'name'));
    }

    /**
     * TCK-2590 — cinq fiches au plus sous un préfixe partagé ; à qui ne les lit pas, le préfixe n'en
     * rend aucune, masquée ou non, et les fiches cachées n'occupent pas les places de la limite : la
     * fiche qu'il a lui-même ajoutée, huitième au même début, revient seule et nommée.
     */
    public function test_tck2590_cinq_au_plus_et_le_prefixe_ne_rend_que_ce_qu_on_lit(): void
    {
        foreach (range(10, 16) as $n) {
            $this->ficheClient($this->agence, null, ['phone' => '+2217064820'.$n]);
        }

        Sanctum::actingAs($this->agent);
        $this->assertCount(5, $this->getJson('/api/customers/duplicates?phone=7064820')->assertOk()->json('data'));

        $role = AgencyRole::factory()->for($this->agence)->withCapabilities([Capability::PropertiesCreate])->create();
        $membre = $this->personnel($this->agence, agencyRole: $role);
        Sanctum::actingAs($membre);
        $this->assertSame([], $this->getJson('/api/customers/duplicates?phone=7064820')->assertOk()->json('data'));

        $sienne = $this->ficheClient($this->agence, null, [
            'first_name' => 'Codou', 'last_name' => 'Sarr', 'phone' => '+221706482099', 'added_by_id' => $membre->id,
        ]);
        $this->assertSame(
            [['id' => $sienne->id, 'name' => 'Codou Sarr', 'stage' => $sienne->pipeline_stage?->value]],
            $this->getJson('/api/customers/duplicates?phone=7064820')->assertOk()->json('data'),
        );
    }

    /**
     * Vérification de TCK-2590 — la sonde n'est pas un oracle : un membre qui ne lit pas la fiche de
     * Mariama (403 sur elle) n'apprend rien d'un préfixe, à aucune longueur. Il ne l'apprend qu'en
     * saisissant le numéro ENTIER (ou l'e-mail), et alors sans nom, sans identifiant, sans étape —
     * l'avertissement contre le doublon, comme avant TCK-2590. Témoin : avec `crm.view_all`, le même
     * préfixe la rend.
     */
    public function test_tck2590_un_prefixe_ne_reconstitue_pas_le_numero_d_une_fiche_cachee(): void
    {
        $role = AgencyRole::factory()->for($this->agence)->withCapabilities([Capability::PropertiesCreate])->create();
        Sanctum::actingAs($this->personnel($this->agence, agencyRole: $role));

        $this->getJson('/api/customers/'.$this->mariama->id)->assertForbidden();
        foreach (['7064820', '70648205', '%2B2217064820', '70%20648%2020%205'] as $prefixe) {
            $this->assertSame([], $this->getJson('/api/customers/duplicates?phone='.$prefixe)->assertOk()->json('data'), $prefixe);
        }

        $masquee = [['id' => null, 'name' => null, 'stage' => null]];
        $this->assertSame($masquee, $this->getJson('/api/customers/duplicates?phone=706482056')->assertOk()->json('data'));
        $this->assertSame($masquee, $this->getJson('/api/customers/duplicates?email=mariama.fall@example.com')->assertOk()->json('data'));

        Sanctum::actingAs($this->agent);
        $this->assertSame([$this->mariama->id], array_column($this->getJson('/api/customers/duplicates?phone=7064820')->assertOk()->json('data'), 'id'));
    }

    /** TCK-2590 — la création garde l'égalité stricte : un numéro entamé n'y fait aucun 409. */
    public function test_tck2590_la_creation_ne_compare_pas_par_prefixe(): void
    {
        $detecteur = app(CustomerDuplicateDetector::class);

        $this->assertSame([], $detecteur->find($this->agence->id, '70 648 20', null, $this->agent));
        $this->assertCount(1, $detecteur->probe($this->agence->id, '70 648 20', null, $this->agent));
    }

    /**
     * TCK-2590 — aucun joker de l'appelant n'entre dans le `LIKE` : `%` et `_` font renoncer au
     * préfixe, ils ne sont pas « nettoyés » en chiffres. Rien de plus large qu'une saisie de chiffres
     * ne revient, ni par la route ni par le détecteur.
     */
    public function test_tck2590_les_jokers_de_l_appelant_n_elargissent_rien(): void
    {
        $this->ficheClient($this->agence, null, ['first_name' => 'Awa', 'last_name' => 'Ndiaye', 'phone' => '+221776543210']);
        $detecteur = app(CustomerDuplicateDetector::class);

        Sanctum::actingAs($this->agent);
        foreach (['70%', '7_6', '%', '_', '7%0', '7064820%', '706482_', '706_820', '7__________'] as $saisie) {
            $this->assertSame([], $this->getJson('/api/customers/duplicates?phone='.rawurlencode($saisie))->assertOk()->json('data'), $saisie);
            $this->assertSame([], $detecteur->probe($this->agence->id, $saisie, null, $this->agent), $saisie);
        }

        // Témoin : les mêmes chiffres, sans joker, trouvent Mariama et elle seule.
        $this->assertSame([$this->mariama->id], array_column($detecteur->probe($this->agence->id, '7064820', null, $this->agent), 'id'));
    }

    /**
     * TCK-2590 (décision 8 du porteur, 2026-11-12) — le signalement « fiche masquée » au numéro
     * COMPLET reste, sous un limiteur de 20 sondes au numéro complet par heure et par personne : qui
     * connaît sept chiffres ne teste plus cent fins en cinq minutes. Les appels sont espacés pour que le
     * limiteur de la route (20 par minute) ne réponde pas à sa place.
     */
    public function test_tck2590_vingt_sondes_au_numero_complet_par_heure_puis_429(): void
    {
        Sanctum::actingAs($this->agent);
        for ($i = 0; $i < 20; $i++) {
            if ($i % 10 === 0) {
                $this->travel(61)->seconds();
            }
            $this->getJson('/api/customers/duplicates?phone=%2B2217064820'.str_pad((string) $i, 2, '0', STR_PAD_LEFT))->assertOk();
        }
        $this->travel(61)->seconds();

        $refus = $this->getJson('/api/customers/duplicates?phone=%2B221706482056')->assertStatus(429);
        $this->assertNotNull($refus->headers->get('Retry-After'));

        // Ni le préfixe ni l'e-mail ne comptent : ils ne livrent pas de fiche cachée.
        $this->getJson('/api/customers/duplicates?phone=7064820')->assertOk();
        $this->getJson('/api/customers/duplicates?email=mariama.fall@example.com')->assertOk();

        // Par personne : un collègue garde ses vingt sondes.
        Sanctum::actingAs($this->personnel($this->agence));
        $this->getJson('/api/customers/duplicates?phone=%2B221706482056')->assertOk();

        // La première sonde de l'heure suivante passe.
        Sanctum::actingAs($this->agent);
        $this->travel(1)->hours();
        $this->assertSame(
            [['id' => $this->mariama->id, 'name' => 'Mariama Fall', 'stage' => 'qualified']],
            $this->getJson('/api/customers/duplicates?phone=%2B221706482056')->assertOk()->json('data'),
        );
    }

    /** Un membre qui ne lit pas la fiche de Mariama (ni `crm.view_all`, ni référent). */
    private function membreSansVueGlobale(): User
    {
        $role = AgencyRole::factory()->for($this->agence)->withCapabilities([Capability::PropertiesCreate])->create();

        return $this->personnel($this->agence, agencyRole: $role);
    }

    /** @return TestResponse<Response> */
    private function creerAuNumeroDeMariama(int $i)
    {
        return $this->postJson('/api/customers', ['first_name' => 'Essai', 'last_name' => 'N'.$i, 'phone' => '+221706482056']);
    }

    /**
     * TCK-2590 (décision 8, seconde porte) — la création signale aussi une fiche cachée au numéro complet
     * (409 masqué). Elle puise dans le MÊME budget que la sonde : vingt signalements par heure et par
     * personne. Au-delà, un numéro porté par une fiche cachée rend 429 générique, sans rien de la fiche,
     * et rien n'est créé (correction de team-lead : laisser passer créerait le doublon en silence). Un
     * numéro libre, lui, ne consomme rien et passe toujours. La sonde, au même compteur, rend 429.
     */
    public function test_tck2590_la_creation_puise_dans_le_budget_du_numero_complet(): void
    {
        Sanctum::actingAs($membre = $this->membreSansVueGlobale());
        for ($i = 0; $i < 20; $i++) {
            $this->creerAuNumeroDeMariama($i)->assertStatus(409)
                ->assertJsonPath('code', 'customer.duplicate')
                ->assertJsonPath('existing.0.id', null)
                ->assertJsonPath('existing.0.matched_on', 'phone');
        }

        $vingtEtUnieme = $this->creerAuNumeroDeMariama(20)->assertStatus(429)->assertJsonPath('code', 'http.too_many_requests');
        $this->assertArrayNotHasKey('existing', $vingtEtUnieme->json());
        $this->assertNotNull($vingtEtUnieme->headers->get('Retry-After'));
        $this->assertSame(1, Customer::query()->where('phone', '+221706482056')->count(), 'aucun doublon créé');

        // Un numéro libre ne consomme rien et n'est jamais bloqué.
        $this->postJson('/api/customers', ['first_name' => 'Libre', 'last_name' => 'Numero', 'phone' => '+221771112233'])->assertCreated();

        // Un seul compteur : la sonde au numéro complet est épuisée elle aussi.
        $this->travel(61)->seconds();
        $this->getJson('/api/customers/duplicates?phone=%2B221706482056')->assertStatus(429);

        // Par personne, et pour une heure.
        $this->travel(1)->hours();
        Sanctum::actingAs($membre);
        $this->creerAuNumeroDeMariama(21)->assertStatus(409)->assertJsonPath('existing.0.id', null);
    }

    /** Dans l'autre sens : vingt sondes au numéro complet, et la création au numéro d'une fiche cachée rend 429. */
    public function test_tck2590_la_sonde_epuise_aussi_le_signalement_de_la_creation(): void
    {
        Sanctum::actingAs($this->membreSansVueGlobale());
        for ($i = 0; $i < 20; $i++) {
            if ($i % 10 === 0) {
                $this->travel(61)->seconds();
            }
            $this->getJson('/api/customers/duplicates?phone=%2B2217064820'.str_pad((string) $i, 2, '0', STR_PAD_LEFT))->assertOk();
        }

        $this->creerAuNumeroDeMariama(0)->assertStatus(429);
        $this->assertSame(1, Customer::query()->where('phone', '+221706482056')->count());
    }

    /** Même règle à la mise à jour : changer le numéro d'une fiche vers celui d'une fiche cachée, budget épuisé → 429. */
    public function test_tck2590_la_mise_a_jour_suit_la_meme_regle(): void
    {
        Sanctum::actingAs($this->membreSansVueGlobale());
        $id = $this->postJson('/api/customers', ['first_name' => 'Ma', 'last_name' => 'Fiche', 'phone' => '+221771112244'])->assertCreated()->json('data.id');
        for ($i = 0; $i < 20; $i++) {
            if ($i % 10 === 0) {
                $this->travel(61)->seconds();
            }
            $this->getJson('/api/customers/duplicates?phone=%2B2217064820'.str_pad((string) $i, 2, '0', STR_PAD_LEFT))->assertOk();
        }

        $this->patchJson("/api/customers/{$id}", ['phone' => '+221706482056'])->assertStatus(429);
        $this->assertSame('+221771112244', Customer::query()->findOrFail($id)->phone);
    }

    /** Le budget ne tait que le masqué : une fiche que l'appelant lit reste signalée, budget épuisé. */
    public function test_tck2590_budget_epuise_une_fiche_lisible_reste_signalee(): void
    {
        Sanctum::actingAs($this->agent);
        for ($i = 0; $i < 20; $i++) {
            if ($i % 10 === 0) {
                $this->travel(61)->seconds();
            }
            $this->getJson('/api/customers/duplicates?phone=%2B2217064820'.str_pad((string) $i, 2, '0', STR_PAD_LEFT))->assertOk();
        }

        $this->creerAuNumeroDeMariama(0)->assertStatus(409)->assertJsonPath('existing.0.id', $this->mariama->id);
    }

    /** Un numéro entamé, même à huit chiffres, ne consomme pas le budget du numéro complet. */
    public function test_tck2590_le_prefixe_ne_consomme_pas_le_budget_du_numero_complet(): void
    {
        Sanctum::actingAs($this->agent);
        for ($i = 0; $i < 25; $i++) {
            if ($i % 10 === 0) {
                $this->travel(61)->seconds();
            }
            $this->getJson('/api/customers/duplicates?phone=%2B22170648205')->assertOk();
        }

        $this->getJson('/api/customers/duplicates?phone=%2B221706482056')->assertOk();
    }

    /** Le prédicat du limiteur est celui de la sonde : un E.164 de huit chiffres nationaux n'est pas complet. */
    public function test_tck2590_numero_complet_suit_la_sonde(): void
    {
        $this->assertSame('+221706482056', CustomerDuplicateDetector::numeroComplet('70 648 20 56'));
        $this->assertNull(CustomerDuplicateDetector::numeroComplet('+22170648205'));
        $this->assertNull(CustomerDuplicateDetector::numeroComplet('7064820'));
        $this->assertNull(CustomerDuplicateDetector::numeroComplet(null));
    }
}
