<?php

namespace Tests\Feature\Documents;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Document;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\DocumentType;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use App\Services\Privacy\DataExportBuilder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Testing\TestResponse;
use Tests\Support\CoffreDeDocuments;
use Tests\TestCase;

/**
 * TCK-2759 (ADR-0099, amendement du 2026-11-12) — un document INTERNE d'une fiche client : le sujet de
 * la fiche ne le lit par aucun chemin (lecture, versions, liste à cible, coffre, accueil), et le lit dès
 * qu'il redevient visible ; le personnel actif de l'agence le lit ; la liste suit la lecture.
 *
 * Fixture du ticket : l'agence A du coffre, la fiche C du locataire U (`customers.user_id = U`), l'agent
 * actif X d'A, un second agent X2 d'A, un agent Y d'une autre agence, un super-admin. X téléverse D sur
 * C sans envoyer `is_internal`.
 */
class DocumentInterneLectureTest extends TestCase
{
    use CoffreDeDocuments;
    use RefreshDatabase;

    private Customer $fiche;

    private User $agent2;

    private User $etranger;

    private User $superAdmin;

    private Document $interne;

    protected function setUp(): void
    {
        parent::setUp();
        $this->batirLeCoffre();
        $this->fiche = Customer::query()->where('user_id', $this->tenant->id)->where('agency_id', $this->agency->id)->firstOrFail();

        $this->agent2 = User::factory()->create();
        AgentProfile::query()->create(['user_id' => $this->agent2->id, 'agency_id' => $this->agency->id]);
        $this->etranger = User::factory()->create();
        AgentProfile::query()->create(['user_id' => $this->etranger->id, 'agency_id' => Agency::factory()->create()->id]);
        $this->superAdmin = User::factory()->create();
        $this->materializeRoleProfile($this->superAdmin, 'super_admin');

        $this->connecter($this->agent);
        $this->interne = Document::query()->findOrFail(
            $this->televerser($this->fiche)->assertCreated()->json('data.id')
        );
    }

    private function televerser(Customer $fiche, array $extra = []): TestResponse
    {
        return $this->post('/api/documents', [
            'documentable_type' => 'customer',
            'documentable_id' => $fiche->id,
            'name' => 'Note de solvabilité',
            'type' => DocumentType::Other->value,
            'file' => UploadedFile::fake()->create('note.pdf', 12, 'application/pdf'),
        ] + $extra, ['Accept' => 'application/json']);
    }

    /** @return list<int> */
    private function listeDeLaFiche(Customer $fiche): array
    {
        return $this->getJson("/api/documents?filter[documentable_type]=customer&filter[documentable_id]={$fiche->id}")
            ->assertOk()->json('data.*.id');
    }

    /** @return list<int> */
    private function idsDuCoffre(): array
    {
        return array_values(array_filter(array_column($this->entrees($this->coffre()), 'document_id')));
    }

    /** @return list<int> */
    private function recentsDeLAccueil(): array
    {
        return array_column($this->getJson('/api/dashboard/tenant')->assertOk()->json('data.documents.recent'), 'id');
    }

    private function basculer(Document $document, bool $interne): TestResponse
    {
        return $this->patchJson("/api/documents/{$document->id}/visibility", ['is_internal' => $interne]);
    }

    /** AC1 — sans le champ, le dépôt du personnel sur une fiche est interne ; `false` envoyé le rend visible. */
    public function test_ac1_staff_upload_on_a_customer_fiche_defaults_to_internal(): void
    {
        $this->assertTrue($this->interne->is_internal);
        $this->assertDatabaseHas('documents', ['id' => $this->interne->id, 'is_internal' => true]);

        $visible = $this->televerser($this->fiche, ['is_internal' => '0'])->assertCreated();
        $this->assertFalse($visible->json('data.is_internal'));
        $this->assertDatabaseHas('documents', ['id' => $visible->json('data.id'), 'is_internal' => false]);
    }

    /** AC2 — le sujet ne lit D par aucun des cinq chemins ; X le bascule, et les cinq le rendent. */
    public function test_ac2_the_subject_reads_it_by_no_path_until_it_turns_visible(): void
    {
        $versionId = $this->post("/api/documents/{$this->interne->id}/versions", [
            'file' => UploadedFile::fake()->create('note-v2.pdf', 12, 'application/pdf'),
        ], ['Accept' => 'application/json'])->assertCreated()->json('data.id');
        $this->assertNotNull($versionId);

        $this->connecter($this->tenant);
        $this->getJson("/api/documents/{$this->interne->id}")->assertForbidden();
        $this->getJson("/api/documents/{$this->interne->id}/versions")->assertForbidden();
        $this->get("/api/documents/{$this->interne->id}/versions/{$versionId}/download", ['Accept' => 'application/json'])->assertForbidden();
        $this->assertNotContains($this->interne->id, $this->listeDeLaFiche($this->fiche));
        $this->assertNotContains($this->interne->id, $this->idsDuCoffre());
        $this->assertNotContains($this->interne->id, $this->recentsDeLAccueil());

        $this->connecter($this->agent);
        $this->basculer($this->interne, false)->assertOk()->assertJsonPath('data.is_internal', false);

        $this->connecter($this->tenant);
        $this->getJson("/api/documents/{$this->interne->id}")->assertOk();
        $this->getJson("/api/documents/{$this->interne->id}/versions")->assertOk();
        $this->get("/api/documents/{$this->interne->id}/versions/{$versionId}/download")->assertRedirect();
        $this->assertContains($this->interne->id, $this->listeDeLaFiche($this->fiche));
        $this->assertContains($this->interne->id, $this->idsDuCoffre());
        $this->assertContains($this->interne->id, $this->recentsDeLAccueil());
    }

    /**
     * AC3 — le sujet auteur de sa propre fiche (un bailleur d'A), puis le sujet membre du personnel
     * (un agent actif d'A) : ni l'un ni l'autre ne lit le document interne de SA fiche.
     */
    public function test_ac3_the_subject_author_and_the_subject_staff_member_do_not_read_it(): void
    {
        $ficheDuBailleur = Customer::factory()->create([
            'agency_id' => $this->agency->id, 'user_id' => $this->landlord->id, 'added_by_id' => $this->landlord->id,
        ]);
        $ficheDeLAgent = Customer::factory()->create([
            'agency_id' => $this->agency->id, 'user_id' => $this->agent2->id, 'added_by_id' => $this->admin->id,
        ]);
        $this->connecter($this->agent);
        $surLeBailleur = $this->televerser($ficheDuBailleur)->assertCreated()->json('data.id');
        $surLAgent = $this->televerser($ficheDeLAgent)->assertCreated()->json('data.id');
        $this->assertDatabaseHas('documents', ['id' => $surLeBailleur, 'is_internal' => true]);
        $this->assertDatabaseHas('documents', ['id' => $surLAgent, 'is_internal' => true]);

        $this->connecter($this->landlord);
        $this->getJson("/api/documents/{$surLeBailleur}")->assertForbidden();
        $this->assertNotContains($surLeBailleur, $this->listeDeLaFiche($ficheDuBailleur));

        // TCK-2759 (t1 de la vérification de cd48b8f57) — le coffre et l'accueil de l'agent sujet : la
        // forme SQL y garde le sujet même membre du personnel. Le témoin visible prouve que ces deux
        // chemins lisent bien les documents de sa fiche.
        $this->connecter($this->agent);
        $temoin = $this->televerser($ficheDeLAgent, ['is_internal' => '0'])->assertCreated()->json('data.id');

        $this->connecter($this->agent2);
        $this->getJson("/api/documents/{$surLAgent}")->assertForbidden();
        $this->assertNotContains($surLAgent, $this->listeDeLaFiche($ficheDeLAgent));
        $this->assertContains($temoin, $this->idsDuCoffre(), 'le témoin visible est au coffre');
        $this->assertNotContains($surLAgent, $this->idsDuCoffre(), 'coffre');
        $this->assertContains($temoin, $this->recentsDeLAccueil(), 'le témoin visible est à l\'accueil');
        $this->assertNotContains($surLAgent, $this->recentsDeLAccueil(), 'accueil');
        // Le même agent lit le document interne d'une fiche dont il n'est pas le sujet.
        $this->getJson("/api/documents/{$this->interne->id}")->assertOk();
    }

    /**
     * Le septième chemin : `GET /api/customers/{id}?include=documents`, que la fiche client lit. L'admin
     * d'A, sujet d'une fiche d'A, lit la fiche (il voit tout le CRM) sans en lire le document interne ;
     * l'agent X la lit avec lui, marqué, et la bascule lui est offerte.
     */
    public function test_the_fiche_include_follows_the_same_rule(): void
    {
        $ficheDeLAdmin = Customer::factory()->create([
            'agency_id' => $this->agency->id, 'user_id' => $this->admin->id, 'added_by_id' => $this->agent->id,
        ]);
        $interne = $this->televerser($ficheDeLAdmin)->assertCreated()->json('data.id');
        $visible = $this->televerser($ficheDeLAdmin, ['is_internal' => '0'])->assertCreated()->json('data.id');

        $documents = fn (): array => collect(
            $this->getJson("/api/customers/{$ficheDeLAdmin->id}?include=documents")->assertOk()->json('data.documents')
        )->keyBy('id')->all();

        $vus = $documents();
        $this->assertEqualsCanonicalizing([$interne, $visible], array_keys($vus));
        $this->assertTrue($vus[$interne]['is_internal']);
        $this->assertFalse($vus[$visible]['is_internal']);
        $this->assertTrue($vus[$interne]['abilities']['set_visibility']);

        $this->connecter($this->admin);
        $vus = $documents();
        $this->assertSame([$visible], array_keys($vus));
        $this->assertFalse($vus[$visible]['abilities']['set_visibility']);
        $this->getJson("/api/documents/{$interne}")->assertForbidden();
    }

    /** La ligne d'un document sert `abilities.set_visibility` : au personnel, sur une fiche client seulement. */
    public function test_the_document_row_offers_the_toggle_to_the_staff_only(): void
    {
        $this->getJson("/api/documents/{$this->interne->id}")->assertOk()
            ->assertJsonPath('data.is_internal', true)
            ->assertJsonPath('data.abilities.set_visibility', true);
        // Sur un bail, la bascule ne s'offre pas, même à qui pourrait l'appeler.
        $this->getJson("/api/documents/{$this->adminDocOnLease->id}")->assertOk()
            ->assertJsonPath('data.abilities.set_visibility', false);

        $this->basculer($this->interne, false)->assertOk();
        $this->connecter($this->tenant);
        $this->getJson("/api/documents/{$this->interne->id}")->assertOk()
            ->assertJsonPath('data.is_internal', false)
            ->assertJsonPath('data.abilities.set_visibility', false);
    }

    /**
     * La bibliothèque (`GET /api/documents` sans cible : ses propres téléversements) passe par la forme
     * SQL du lecteur ; X y retrouve D, marqué, avec la bascule — avec ou sans profil actif nommé.
     * Le sujet, lui, ne supprime ni ne versionne D.
     */
    public function test_the_library_of_the_uploader_keeps_it_and_the_subject_writes_nothing(): void
    {
        foreach ([null, AgentProfile::query()->where('user_id', $this->agent->id)->firstOrFail()] as $profil) {
            $this->connecter($this->agent, $profil);
            $ligne = collect($this->getJson('/api/documents')->assertOk()->json('data'))->firstWhere('id', $this->interne->id);
            $this->assertNotNull($ligne, 'D absent de la bibliothèque de son téléverseur');
            $this->assertTrue($ligne['is_internal']);
            $this->assertTrue($ligne['abilities']['set_visibility']);
        }

        $this->connecter($this->tenant);
        $this->assertNotContains($this->interne->id, $this->getJson('/api/documents')->assertOk()->json('data.*.id'));
        $this->post("/api/documents/{$this->interne->id}/versions", [
            'file' => UploadedFile::fake()->create('autre.pdf', 12, 'application/pdf'),
        ], ['Accept' => 'application/json'])->assertForbidden();
        $this->deleteJson("/api/documents/{$this->interne->id}")->assertForbidden();
        $this->postJson("/api/documents/{$this->interne->id}/verify")->assertForbidden();
        $this->assertNotNull($this->interne->fresh());
    }

    /** AC4 — X et un autre agent d'A lisent ; Y non ; X suspendu non plus ; le super-admin lit. */
    public function test_ac4_the_active_staff_reads_it(): void
    {
        foreach ([$this->agent, $this->agent2] as $membre) {
            $this->connecter($membre);
            $this->getJson("/api/documents/{$this->interne->id}")->assertOk();
            $this->assertContains($this->interne->id, $this->listeDeLaFiche($this->fiche));
        }

        $this->connecter($this->etranger);
        $this->getJson("/api/documents/{$this->interne->id}")->assertForbidden();

        $this->connecter($this->superAdmin);
        $this->getJson("/api/documents/{$this->interne->id}")->assertOk();

        AgentProfile::query()->where('user_id', $this->agent->id)->update(['status' => AgentProfileStatus::Suspended->value]);
        $this->connecter($this->agent);
        $this->getJson("/api/documents/{$this->interne->id}")->assertForbidden();
    }

    /**
     * AC5 — la parité d'ADR-0099 § 1, étendue : sur la cible C, ce qui se liste est exactement ce dont
     * le `show` rend 200, pour U, X, Y et le super-admin ; C porte un document interne et un visible.
     */
    public function test_ac5_the_list_of_the_fiche_follows_the_read(): void
    {
        $visible = $this->televerser($this->fiche, ['is_internal' => '0'])->assertCreated()->json('data.id');
        $deU = $this->document($this->fiche, $this->tenant, DocumentType::Other, 'Bulletin de salaire');
        $tous = [$this->interne->id, $visible, $deU->id];

        $attendus = [
            [$this->tenant, [$visible, $deU->id]],
            [$this->agent, $tous],
            [$this->etranger, []],
        ];
        foreach ($attendus as [$qui, $attendu]) {
            $this->connecter($qui);
            $lisibles = array_values(array_filter(
                $tous,
                fn (int $id): bool => $this->getJson("/api/documents/{$id}")->status() === 200,
            ));
            $listes = $this->listeDeLaFiche($this->fiche);
            $this->assertEqualsCanonicalizing($lisibles, $listes, "parité liste ⇔ lecture pour l'utilisateur {$qui->id}");
            $this->assertEqualsCanonicalizing($attendu, $listes, "liste attendue pour l'utilisateur {$qui->id}");
        }

        // Le super-admin lit les trois, et n'en liste aucun par la cible : ADR-0099 § 1 (« il ouvre un
        // document par son identifiant, journalisé », TCK-820) — `listableOn` le renvoie à la règle
        // de ses propres téléversements, qui écarte même les siens sur la fiche d'une agence dont il
        // n'est pas membre (règle d'auteur). Écart à la lettre de l'AC5, antérieur au ticket : la liste
        // n'y est jamais plus LARGE que la lecture, interne compris.
        $this->connecter($this->superAdmin);
        foreach ($tous as $id) {
            $this->getJson("/api/documents/{$id}")->assertOk();
        }
        $this->assertSame([], $this->listeDeLaFiche($this->fiche));
    }

    /** AC9 — une ligne insérée sans la colonne vaut `false`, et le sujet la lit ; `down()` puis `up()` passent. */
    public function test_ac9_an_existing_document_is_visible_and_the_migration_reverses(): void
    {
        $id = DB::table('documents')->insertGetId([
            'documentable_type' => Customer::class, 'documentable_id' => $this->fiche->id,
            'uploaded_by' => $this->admin->id, 'name' => 'Ancien contrat', 'type' => DocumentType::Other->value,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        $this->assertFalse((bool) DB::table('documents')->where('id', $id)->value('is_internal'));
        $this->connecter($this->tenant);
        $this->getJson("/api/documents/{$id}")->assertOk();

        $migration = require database_path('migrations/2026_11_12_200000_add_is_internal_to_documents_table.php');
        $migration->down();
        $this->assertFalse(Schema::hasColumn('documents', 'is_internal'));
        $migration->up();
        $this->assertTrue(Schema::hasColumn('documents', 'is_internal'));
        $this->assertSame(0, DB::table('documents')->where('is_internal', true)->count());
    }

    /**
     * AC10 — l'export des données de U porte D en métadonnées (type, nom, date), sans fichier ni
     * chemin, comme toute pièce déposée par un autre sur sa fiche (ADR-0099, amendement, § 8). Décision
     * du porteur à confirmer : la retirer de l'export serait un filtre sur `is_internal` dans
     * `DataExportBuilder::documents()`, et ce test changerait de sens.
     */
    public function test_ac10_the_export_of_the_subject_carries_its_metadata_only(): void
    {
        $lignes = collect(app(DataExportBuilder::class)->payloads($this->tenant)['documents.json'])->keyBy('id');

        $this->assertTrue($lignes->has($this->interne->id));
        $this->assertSame(['id', 'type', 'name', 'created_at'], array_keys($lignes[$this->interne->id]));
    }
}
