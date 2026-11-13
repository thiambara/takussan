<?php

namespace Tests\Feature\Documents;

use App\Http\Resources\CustomerResource;
use App\Models\Agency;
use App\Models\Customer;
use App\Models\Document;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\DocumentType;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Testing\TestResponse;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\Support\CoffreDeDocuments;
use Tests\TestCase;

/**
 * TCK-2759 — deux chemins que la vérification de 90250c936 a trouvés ouverts.
 *
 * r3 — `include=documents` de la fiche client jugeait la fiche telle que `fields[customers]` l'avait
 * sélectionnée : sans `user_id`, « jamais le sujet » sautait, et le membre du personnel sujet de la
 * fiche lisait ses documents internes ; sans `agency_id`, le personnel perdait les siens.
 *
 * r4 — `GET /api/search/documents` ne bornait que `uploaded_by` : l'agent suspendu retrouvait (et
 * téléchargeait) l'interne qu'il avait déposé, le personnel parti ses autres téléversements, que
 * `view()` et la liste lui refusent. La recherche suit la lecture (ADR-0099 § 1).
 *
 * Meilisearch réel (`InteractsWithMeilisearch`) : le pilote `collection` rejouerait le filtre en PHP.
 */
class DocumentInterneFicheEtRechercheTest extends TestCase
{
    use CoffreDeDocuments;
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->batirLeCoffre();
    }

    private function televerser(Customer $fiche, string $nom, array $extra = []): int
    {
        return (int) $this->post('/api/documents', [
            'documentable_type' => 'customer',
            'documentable_id' => $fiche->id,
            'name' => $nom,
            'type' => DocumentType::Other->value,
            'file' => UploadedFile::fake()->create('note.pdf', 12, 'application/pdf'),
        ] + $extra, ['Accept' => 'application/json'])->assertCreated()->json('data.id');
    }

    /** @return list<int> */
    private function documentsDeLaFiche(TestResponse $reponse, int $ficheId): array
    {
        $data = $reponse->assertOk()->json('data');
        if (array_is_list($data)) {
            $data = collect($data)->firstWhere('id', $ficheId);
        }
        $ids = collect($data['documents'] ?? [])->pluck('id')->map(fn ($id) => (int) $id)->all();
        sort($ids);

        return $ids;
    }

    /** @return list<int> */
    private function trouves(string $q): array
    {
        return collect($this->getJson('/api/search/documents?q='.$q)->assertOk()->json('data'))
            ->pluck('id')->map(fn ($id) => (int) $id)->all();
    }

    public function test_r3_le_sujet_membre_du_personnel_ne_lit_pas_ses_internes_quels_que_soient_les_fields(): void
    {
        $fiche = Customer::factory()->create([
            'agency_id' => $this->agency->id, 'user_id' => $this->admin->id, 'added_by_id' => $this->agent->id,
        ]);
        $this->connecter($this->agent);
        $interne = $this->televerser($fiche, 'Note de solvabilité');
        $visible = $this->televerser($fiche, 'Pièce visible', ['is_internal' => '0']);
        $this->assertNotSame($interne, $visible);

        $this->connecter($this->admin);
        foreach (['', '&fields[customers]=id,agency_id', '&fields[customers]=id,first_name,agency_id', '&fields[customers]=id'] as $fields) {
            $this->assertSame([$visible], $this->documentsDeLaFiche(
                $this->getJson("/api/customers/{$fiche->id}?include=documents{$fields}"), $fiche->id,
            ), "show{$fields}");
            $this->assertSame([$visible], $this->documentsDeLaFiche(
                $this->getJson("/api/customers?include=documents{$fields}&per_page=100"), $fiche->id,
            ), "liste{$fields}");
        }
    }

    /**
     * t1 (vérification de 73ae34ca9) — le verdict « lit les internes » est mémoïsé par requête : sa clé doit
     * séparer la fiche dont l'appelant est le SUJET d'une fiche TIERCE de la même agence. Trié par
     * `created_at`, la fiche tierce est jugée en premier (verdict vrai, l'admin est du personnel) ; une clé
     * sans cette part le resservirait à sa propre fiche, dont l'interne apparaîtrait alors dans la liste.
     */
    public function test_t1_en_liste_une_fiche_tierce_jugee_avant_la_sienne_ne_lui_ouvre_pas_ses_internes(): void
    {
        $tierce = Customer::factory()->create([
            'agency_id' => $this->agency->id, 'added_by_id' => $this->agent->id, 'created_at' => now()->subDays(2),
        ]);
        $sienne = Customer::factory()->create([
            'agency_id' => $this->agency->id, 'user_id' => $this->admin->id, 'added_by_id' => $this->agent->id,
            'created_at' => now()->subDay(),
        ]);
        $this->connecter($this->agent);
        $interneTierce = $this->televerser($tierce, 'Note de solvabilité tierce');
        $interne = $this->televerser($sienne, 'Note de solvabilité');
        $visible = $this->televerser($sienne, 'Pièce visible', ['is_internal' => '0']);

        $this->connecter($this->admin);
        $liste = $this->getJson('/api/customers?include=documents&sort=created_at&per_page=100')->assertOk();
        $ordre = collect($liste->json('data'))->pluck('id')->map(fn ($id) => (int) $id);
        $this->assertLessThan($ordre->search($sienne->id), $ordre->search($tierce->id), 'la fiche tierce est jugée avant la sienne');

        $this->assertContains($interneTierce, $this->documentsDeLaFiche($liste, $tierce->id), 'personnel : l’interne de la fiche tierce');
        $this->assertSame([$visible], $this->documentsDeLaFiche($liste, $sienne->id), 'sujet : jamais ses internes');
        $this->assertNotContains($interne, $this->documentsDeLaFiche($liste, $sienne->id));
    }

    public function test_r3_le_personnel_garde_ses_internes_sans_agency_id_dans_les_fields(): void
    {
        $fiche = Customer::query()->where('user_id', $this->tenant->id)->where('agency_id', $this->agency->id)->firstOrFail();
        $this->connecter($this->agent);
        $interne = $this->televerser($fiche, 'Note de solvabilité');

        foreach (['&fields[customers]=id', '&fields[customers]=id,first_name'] as $fields) {
            $show = $this->getJson("/api/customers/{$fiche->id}?include=documents{$fields}")->assertOk();
            $this->assertContains($interne, $this->documentsDeLaFiche($show, $fiche->id), "show{$fields}");
            $offre = collect($show->json('data.documents'))->firstWhere('id', $interne)['abilities']['set_visibility'] ?? null;
            $this->assertTrue($offre, "set_visibility{$fields}");
            $this->assertContains($interne, $this->documentsDeLaFiche(
                $this->getJson("/api/customers?include=documents{$fields}&per_page=100"), $fiche->id,
            ), "liste{$fields}");
        }
    }

    public function test_r3_l_include_n_offre_pas_la_bascule_sur_la_piece_du_sujet_sans_user_id(): void
    {
        $fiche = Customer::query()->where('user_id', $this->tenant->id)->where('agency_id', $this->agency->id)->firstOrFail();
        $this->connecter($this->tenant);
        $sienne = $this->televerser($fiche, 'Ma pièce');

        $this->connecter($this->agent);
        foreach (['', '&fields[customers]=id,agency_id'] as $fields) {
            $ligne = collect($this->getJson("/api/customers/{$fiche->id}?include=documents{$fields}")->assertOk()
                ->json('data.documents'))->firstWhere('id', $sienne);
            $this->assertNotNull($ligne, "show{$fields}");
            $this->assertFalse($ligne['abilities']['set_visibility'], "show{$fields}");
        }
    }

    public function test_r3_une_fiche_que_la_relecture_ne_trouve_pas_ne_rend_aucun_interne(): void
    {
        $fiche = Customer::factory()->create([
            'agency_id' => $this->agency->id, 'user_id' => $this->admin->id, 'added_by_id' => $this->agent->id,
        ]);
        $this->connecter($this->agent);
        $interne = $this->televerser($fiche, 'Note de solvabilité');
        $visible = $this->televerser($fiche, 'Pièce visible', ['is_internal' => '0']);

        // La fiche lue sans son sujet, puis supprimée : la relecture des traits jugés ne la trouve plus.
        $partielle = Customer::query()->select(['id', 'agency_id'])->with('documents')->findOrFail($fiche->id);
        $fiche->delete();
        $this->connecter($this->admin);
        $requete = Request::create('/api/customers');
        $requete->setUserResolver(fn () => $this->admin);

        $rendu = CustomerResource::make($partielle)->resolve($requete);
        $this->assertSame([$visible], collect($rendu['documents'])->pluck('id')->map(fn ($id) => (int) $id)->all());
        $this->assertNotContains($interne, collect($rendu['documents'])->pluck('id')->all());
        $this->assertFalse(collect($rendu['documents'])->contains(fn ($d) => $d['abilities']['set_visibility']));
    }

    public function test_r3_la_liste_juge_ses_documents_en_un_nombre_de_requetes_constant(): void
    {
        $this->connecter($this->agent);
        $creer = function (int $n): void {
            foreach (range(1, $n) as $_) {
                $fiche = Customer::factory()->create(['agency_id' => $this->agency->id, 'added_by_id' => $this->agent->id]);
                Document::factory()->create([
                    'documentable_type' => Customer::class, 'documentable_id' => $fiche->id,
                    'uploaded_by' => $this->agent->id, 'type' => DocumentType::Other, 'is_internal' => true,
                ]);
            }
        };
        $url = '/api/customers?include=documents&per_page=100&fields[customers]=id,first_name'
            .'&fields[documents]=id,name,documentable_id,documentable_type';
        $liste = fn () => $this->getJson($url)->assertOk();

        $creer(2);
        $liste();
        $avant = $this->requetes($liste);
        $creer(4);
        $this->assertSame($avant, $this->requetes($liste));
        $this->assertGreaterThanOrEqual(6, collect($liste()->json('data'))->filter(fn ($c) => count($c['documents'] ?? []) > 0)->count());
    }

    public function test_r4_l_agent_suspendu_ne_retrouve_plus_l_interne_qu_il_a_depose(): void
    {
        $fiche = Customer::query()->where('user_id', $this->tenant->id)->where('agency_id', $this->agency->id)->firstOrFail();
        $this->connecter($this->agent);
        $interne = $this->televerser($fiche, 'Note de solvabilité');
        $this->waitForMeilisearch();
        $this->assertSame([$interne], $this->trouves('solvabilit'), 'agent actif : son téléversement est trouvé');

        AgentProfile::query()->where('user_id', $this->agent->id)->update(['status' => AgentProfileStatus::Suspended->value]);
        $this->connecter($this->agent);
        $this->getJson("/api/documents/{$interne}")->assertForbidden();

        $reponse = $this->getJson('/api/search/documents?q=solvabilit')->assertOk();
        $this->assertSame([], $reponse->json('data'));
        $this->assertSame(0, $reponse->json('meta.total'));
    }

    public function test_r4_le_personnel_parti_ne_retrouve_plus_ses_televersements_visibles(): void
    {
        $fiche = Customer::query()->where('user_id', $this->tenant->id)->where('agency_id', $this->agency->id)->firstOrFail();
        $this->connecter($this->agent);
        $visible = $this->televerser($fiche, 'Attestation employeur', ['is_internal' => '0']);
        $this->waitForMeilisearch();
        $this->assertSame([$visible], $this->trouves('employeur'), 'agent actif : son téléversement est trouvé');

        AgentProfile::query()->where('user_id', $this->agent->id)->update(['status' => AgentProfileStatus::Suspended->value]);
        $this->connecter($this->agent);
        $this->getJson("/api/documents/{$visible}")->assertForbidden();
        $this->assertSame([], $this->trouves('employeur'));
    }

    public function test_r4_le_super_admin_sujet_d_une_fiche_ne_retrouve_pas_ses_internes(): void
    {
        $superAdmin = User::factory()->create();
        $this->materializeRoleProfile($superAdmin, 'super_admin');
        $autreAgence = Agency::factory()->create();
        $fiche = Customer::factory()->create([
            'agency_id' => $this->agency->id, 'user_id' => $superAdmin->id, 'added_by_id' => $this->agent->id,
        ]);
        $this->connecter($this->agent);
        $interne = $this->televerser($fiche, 'Note de solvabilité');
        $visible = $this->televerser($fiche, 'Note de solvabilité visible', ['is_internal' => '0']);
        $autreFiche = Customer::factory()->create(['agency_id' => $autreAgence->id]);
        $autreInterne = Document::factory()->create([
            'documentable_type' => Customer::class, 'documentable_id' => $autreFiche->id,
            'uploaded_by' => $this->agent->id, 'name' => 'Note de solvabilité tierce',
            'type' => DocumentType::Other, 'is_internal' => true,
        ]);
        $this->waitForMeilisearch();

        $this->connecter($superAdmin);
        $trouves = $this->trouves('solvabilit');
        sort($trouves);
        $this->assertSame([$visible, (int) $autreInterne->id], $trouves);
        $this->assertNotContains($interne, $trouves);
    }
}
