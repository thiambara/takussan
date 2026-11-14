<?php

namespace Tests\Feature\Documents;

use App\Models\Customer;
use App\Models\Document;
use App\Models\DocumentShareLink;
use App\Models\Enums\DocumentType;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Testing\TestResponse;
use Tests\Support\CoffreDeDocuments;
use Tests\TestCase;

/**
 * TCK-2773 (ADR-0099, amendement du 2026-11-13) — le nom des auteurs d'un document (téléverseur,
 * vérificateur, auteur d'une version, créateur d'un lien), selon le lecteur : le nom au personnel actif de
 * l'agence, au super-admin et à soi ; `platform` pour un opérateur, hors de la console ; un rôle à tout
 * autre lecteur (`agency`, `landlord`, `tenant`, `customer`), jamais un nom.
 *
 * Chaque refus se lit sur le CORPS BRUT de la réponse (le nom n'y figure nulle part, même sous
 * `include=uploader,verifier,versions`), et s'apparie au lecteur du personnel qui, lui, lit le nom : une
 * règle qui refuserait tout le monde ne passe pas.
 *
 * Fixture : le coffre (agence A, son admin, son agent, le bailleur du bien, le locataire du bail) ; un
 * opérateur de la plateforme ; des noms distincts pour chacun.
 */
class NomsDesAuteursParActeurTest extends TestCase
{
    use CoffreDeDocuments;
    use RefreshDatabase;

    private const INCLUDES = '?include=uploader,verifier,versions';

    private User $operateur;

    private Document $surLeBail;

    protected function setUp(): void
    {
        parent::setUp();
        $this->batirLeCoffre();

        $this->nommer($this->agent, 'Ousmane', 'Niang');
        $this->nommer($this->admin, 'Mariama', 'Ba');
        $this->nommer($this->landlord, 'Cheikh', 'Fall');
        $this->nommer($this->tenant, 'Fatou', 'Sarr');
        $this->operateur = User::factory()->create(['first_name' => 'Awa', 'last_name' => 'Diop']);
        $this->materializeRoleProfile($this->operateur, 'super_admin');

        // Le document du bail : déposé par l'agent, une version de l'agent puis une de l'opérateur, et
        // vérifié par l'opérateur (après : une version neuve remet la vérification à zéro, TCK-2300).
        $this->connecter($this->agent);
        $this->surLeBail = Document::query()->findOrFail($this->televerser('lease', $this->lease->id)->json('data.id'));
        $this->versionner($this->surLeBail);
        $this->connecter($this->operateur);
        $this->versionner($this->surLeBail);
        $this->postJson("/api/documents/{$this->surLeBail->id}/verify")->assertOk();
    }

    private function nommer(User $user, string $prenom, string $nom): void
    {
        $user->forceFill(['first_name' => $prenom, 'last_name' => $nom])->save();
    }

    private function televerser(string $type, int $id, array $extra = []): TestResponse
    {
        return $this->post('/api/documents', [
            'documentable_type' => $type,
            'documentable_id' => $id,
            'name' => 'Pièce',
            'type' => DocumentType::Other->value,
            'file' => UploadedFile::fake()->create('piece.pdf', 12, 'application/pdf'),
        ] + $extra, ['Accept' => 'application/json'])->assertCreated();
    }

    private function versionner(Document $document): void
    {
        $this->post("/api/documents/{$document->id}/versions", [
            'file' => UploadedFile::fake()->create('piece-v.pdf', 12, 'application/pdf'),
        ], ['Accept' => 'application/json'])->assertCreated();
    }

    private function partager(Document $document): void
    {
        $this->postJson("/api/documents/{$document->id}/share", [])->assertCreated();
    }

    private function fiche(User $lecteur, Document $document): TestResponse
    {
        $this->connecter($lecteur);

        return $this->getJson("/api/documents/{$document->id}".self::INCLUDES)->assertOk();
    }

    private function versions(User $lecteur, Document $document): TestResponse
    {
        $this->connecter($lecteur);

        return $this->getJson("/api/documents/{$document->id}/versions")->assertOk();
    }

    private function liens(User $lecteur, Document $document): TestResponse
    {
        $this->connecter($lecteur);

        return $this->getJson("/api/documents/{$document->id}/share-links")->assertOk();
    }

    private static function nom(string $nom): array
    {
        return ['name' => $nom, 'role' => null];
    }

    private static function role(string $role): array
    {
        return ['name' => null, 'role' => $role];
    }

    /** @param  list<string>  $noms */
    private function assertAucunNom(TestResponse $reponse, array $noms): void
    {
        foreach ($noms as $nom) {
            $this->assertStringNotContainsString($nom, (string) $reponse->getContent(), "« {$nom} » figure dans la réponse.");
        }
    }

    /** AC1 — le personnel lit « Ajouté par <nom> » ; la vérification et la version de l'opérateur restent `platform`. */
    public function test_le_personnel_lit_le_nom_de_qui_a_ajoute_et_platform_pour_l_operateur(): void
    {
        $fiche = $this->fiche($this->admin, $this->surLeBail);
        $fiche->assertJsonPath('data.uploaded_by_person', self::nom('Ousmane Niang'))
            ->assertJsonPath('data.verified_by_person', self::role('platform'));
        $this->assertSame(
            [self::role('platform'), self::nom('Ousmane Niang')],
            array_column($fiche->json('data.versions'), 'uploaded_by_person'),
        );
        $this->assertAucunNom($fiche, ['Awa', 'Diop']);

        $versions = $this->versions($this->agent, $this->surLeBail);
        $this->assertSame([self::role('platform'), self::nom('Ousmane Niang')], array_column($versions->json('data'), 'uploaded_by_person'));
        $this->assertAucunNom($versions, ['Awa', 'Diop']);
    }

    /** La console : le super-admin lit tous les noms, l'opérateur compris. */
    public function test_le_super_admin_lit_tous_les_noms(): void
    {
        $this->fiche($this->operateur, $this->surLeBail)
            ->assertJsonPath('data.uploaded_by_person', self::nom('Ousmane Niang'))
            ->assertJsonPath('data.verified_by_person', self::nom('Awa Diop'));
    }

    /** AC1 — le locataire lit `agency` et `platform`, jamais un nom ; le personnel, apparié, lit le nom. */
    public function test_le_locataire_lit_l_agence_et_la_plateforme_sans_aucun_nom(): void
    {
        $fiche = $this->fiche($this->tenant, $this->surLeBail);
        $fiche->assertJsonPath('data.uploaded_by_person', self::role('agency'))
            ->assertJsonPath('data.verified_by_person', self::role('platform'));
        $this->assertSame([self::role('platform'), self::role('agency')], array_column($fiche->json('data.versions'), 'uploaded_by_person'));
        $this->assertAucunNom($fiche, ['Ousmane', 'Niang', 'Awa', 'Diop']);

        $versions = $this->versions($this->tenant, $this->surLeBail);
        $this->assertSame([self::role('platform'), self::role('agency')], array_column($versions->json('data'), 'uploaded_by_person'));
        $this->assertAucunNom($versions, ['Ousmane', 'Niang', 'Awa', 'Diop']);

        // Le bailleur dépose sur le bail : le locataire lit `landlord`, le personnel lit son nom.
        $this->connecter($this->landlord);
        $duBailleur = Document::query()->findOrFail($this->televerser('lease', $this->lease->id)->json('data.id'));
        $deLui = $this->fiche($this->tenant, $duBailleur)->assertJsonPath('data.uploaded_by_person', self::role('landlord'));
        $this->assertAucunNom($deLui, ['Cheikh', 'Fall']);
        $this->fiche($this->admin, $duBailleur)->assertJsonPath('data.uploaded_by_person', self::nom('Cheikh Fall'));
    }

    /** AC1 — le bailleur lit `agency`, `platform` et `tenant` ; AC2 — le créateur d'un lien, jugé de même. */
    public function test_le_bailleur_lit_des_roles_et_le_personnel_les_noms(): void
    {
        $fiche = $this->fiche($this->landlord, $this->surLeBail)
            ->assertJsonPath('data.uploaded_by_person', self::role('agency'))
            ->assertJsonPath('data.verified_by_person', self::role('platform'));
        $this->assertAucunNom($fiche, ['Ousmane', 'Niang', 'Awa', 'Diop']);

        // Le locataire dépose sur son bail (décision 3a : le rôle seul entre bailleur et locataire).
        $this->connecter($this->tenant);
        $duLocataire = Document::query()->findOrFail($this->televerser('lease', $this->lease->id)->json('data.id'));
        $lu = $this->fiche($this->landlord, $duLocataire)->assertJsonPath('data.uploaded_by_person', self::role('tenant'));
        $this->assertAucunNom($lu, ['Fatou', 'Sarr']);
        $this->fiche($this->agent, $duLocataire)->assertJsonPath('data.uploaded_by_person', self::nom('Fatou Sarr'));

        // AC2 — un lien créé par l'agent sur un document du bien : le bailleur liste les liens (`share`
        // lui est ouvert), il lit `agency` ; le personnel lit le nom.
        $this->connecter($this->agent);
        $surLeBien = Document::query()->findOrFail($this->televerser('property', $this->property->id)->json('data.id'));
        $this->partager($surLeBien);
        $this->assertSame([self::nom('Ousmane Niang')], array_column($this->liens($this->admin, $surLeBien)->json('data'), 'created_by_person'));
        $liens = $this->liens($this->landlord, $surLeBien);
        $this->assertSame([self::role('agency')], array_column($liens->json('data'), 'created_by_person'));
        $this->assertAucunNom($liens, ['Ousmane', 'Niang']);
    }

    /** AC2 — la création d'un lien rend son créateur au personnel. */
    public function test_le_lien_cree_porte_son_createur(): void
    {
        $this->connecter($this->agent);
        $this->postJson("/api/documents/{$this->surLeBail->id}/share", [])->assertCreated()
            ->assertJsonPath('data.created_by_person', self::nom('Ousmane Niang'));
        $this->assertDatabaseHas('document_share_links', ['document_id' => $this->surLeBail->id, 'created_by_id' => $this->agent->id]);
    }

    /** AC3 — le sujet d'une fiche client lit `agency`, sur la fiche du document comme sur ses liens. */
    public function test_le_sujet_d_une_fiche_client_ne_lit_aucun_nom_du_personnel(): void
    {
        $fiche = Customer::query()->where('user_id', $this->tenant->id)->where('agency_id', $this->agency->id)->firstOrFail();
        $this->connecter($this->agent);
        $visible = Document::query()->findOrFail($this->televerser('customer', $fiche->id, ['is_internal' => '0'])->json('data.id'));
        $this->partager($visible);

        $lu = $this->fiche($this->tenant, $visible)->assertJsonPath('data.uploaded_by_person', self::role('agency'));
        $this->assertAucunNom($lu, ['Ousmane', 'Niang']);
        $liens = $this->liens($this->tenant, $visible);
        $this->assertSame([self::role('agency')], array_column($liens->json('data'), 'created_by_person'));
        $this->assertAucunNom($liens, ['Ousmane', 'Niang']);

        // Apparié : le personnel lit le nom, sur la fiche et sur les liens.
        $this->fiche($this->admin, $visible)->assertJsonPath('data.uploaded_by_person', self::nom('Ousmane Niang'));
        $this->assertSame([self::nom('Ousmane Niang')], array_column($this->liens($this->admin, $visible)->json('data'), 'created_by_person'));
    }

    /** AC3 — un membre du personnel SUJET de sa fiche lit comme le sujet (la règle de `readsInternalOf`). */
    public function test_le_personnel_sujet_de_sa_fiche_lit_comme_le_sujet(): void
    {
        $collegue = User::factory()->create(['first_name' => 'Sokhna', 'last_name' => 'Sene']);
        AgentProfile::query()->create(['user_id' => $collegue->id, 'agency_id' => $this->agency->id]);
        $saFiche = Customer::factory()->create(['user_id' => $collegue->id, 'agency_id' => $this->agency->id]);

        $this->connecter($this->agent);
        $visible = Document::query()->findOrFail($this->televerser('customer', $saFiche->id, ['is_internal' => '0'])->json('data.id'));

        $lu = $this->fiche($collegue, $visible)->assertJsonPath('data.uploaded_by_person', self::role('agency'));
        $this->assertAucunNom($lu, ['Ousmane', 'Niang']);
        $this->fiche($this->admin, $visible)->assertJsonPath('data.uploaded_by_person', self::nom('Ousmane Niang'));
    }

    /** AC1 — le prestataire lit son propre nom, et `platform` pour la vérification de sa pièce. */
    public function test_le_prestataire_lit_platform_pour_la_verification_de_sa_piece(): void
    {
        $prestataire = User::factory()->create(['first_name' => 'Ibrahima', 'last_name' => 'Kane']);
        $profil = ServiceProviderProfile::query()->create(['user_id' => $prestataire->id]);
        $piece = $this->document($profil, $prestataire, DocumentType::IdCard, 'CNI du prestataire');
        $this->connecter($this->operateur);
        $this->postJson("/api/documents/{$piece->id}/verify")->assertOk();

        $lu = $this->fiche($prestataire, $piece)
            ->assertJsonPath('data.uploaded_by_person', self::nom('Ibrahima Kane'))
            ->assertJsonPath('data.verified_by_person', self::role('platform'));
        $this->assertAucunNom($lu, ['Awa', 'Diop']);
    }

    /** Le personnel parti reste « l'agence » pour le locataire : un rôle, jamais un nom. */
    public function test_un_auteur_parti_de_l_agence_reste_l_agence(): void
    {
        AgentProfile::query()->where('user_id', $this->agent->id)->where('agency_id', $this->agency->id)->firstOrFail()->delete();

        $lu = $this->fiche($this->tenant, $this->surLeBail)->assertJsonPath('data.uploaded_by_person', self::role('agency'));
        $this->assertAucunNom($lu, ['Ousmane', 'Niang']);
    }

    /** § 5 — une liste ne porte pas les auteurs ; le lien public ne porte aucun auteur. */
    public function test_ni_la_liste_ni_le_lien_public_ne_portent_d_auteur(): void
    {
        $this->connecter($this->tenant);
        $liste = $this->getJson("/api/documents?filter[documentable_type]=lease&filter[documentable_id]={$this->lease->id}&include=uploader,verifier")->assertOk();
        $this->assertContains($this->surLeBail->id, $liste->json('data.*.id'));
        $this->assertStringNotContainsString('uploaded_by_person', (string) $liste->getContent());
        $this->assertAucunNom($liste, ['Ousmane', 'Niang', 'Awa', 'Diop']);

        $this->connecter($this->agent);
        $jeton = $this->postJson("/api/documents/{$this->surLeBail->id}/share", [])->assertCreated()->json('data.token');
        $this->assertNotNull(DocumentShareLink::query()->where('document_id', $this->surLeBail->id)->value('created_by_id'));

        $this->flushHeaders();
        $this->app['auth']->forgetGuards();
        $public = $this->getJson("/api/share/{$jeton}")->assertOk();
        $this->assertStringNotContainsString('created_by', (string) $public->getContent());
        $this->assertAucunNom($public, ['Ousmane', 'Niang']);
    }
}
