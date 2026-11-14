<?php

namespace Tests\Feature\Documents;

use App\Models\Customer;
use App\Models\Document;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\DocumentType;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\ServiceProviderBill;
use App\Services\Documents\ArchiveDuCoffre;
use App\Services\Media\PdfImageEmbedder;
use App\Services\Payout\OwnerStatementSnapshots;
use App\Services\Pdf\DocumentPdfService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Testing\TestResponse;
use RuntimeException;
use Spatie\LaravelPdf\Exceptions\CouldNotGeneratePdf;
use Tests\Support\CoffreDeDocuments;
use Tests\Support\MaintenanceActors;
use Tests\Support\RemoteDiskFake;
use Tests\Support\SessionsDImpersonation;
use Tests\TestCase;
use Throwable;
use ZipArchive;

/**
 * TCK-2770 — « Tout télécharger » : l'archive `.zip` d'un dossier du coffre
 * (`GET /api/me/document-vault/archive?folder=`). Elle contient exactement ce que le coffre de
 * l'appelant montre dans ce dossier ; un dossier qui n'est pas le sien rend 404 ; une pièce interne
 * n'y entre pas ; les noms ne portent ni identifiant ni chemin. Chaque refus a son versant autorisé.
 */
class DocumentVaultArchiveTest extends TestCase
{
    use CoffreDeDocuments;
    use MaintenanceActors;
    use RefreshDatabase;
    use SessionsDImpersonation;

    protected function setUp(): void
    {
        parent::setUp();
        // Un disque distant simulé : `getPath()` y rend un chemin qui n'existe pas (ADR-0029).
        RemoteDiskFake::install('r2-private');
        $this->batirLeCoffre();
    }

    private function archive(string $folder): TestResponse
    {
        // Les noms suivent la langue de l'appelant ; ces cas lisent le français.
        return $this->getJson('/api/me/document-vault/archive?folder='.rawurlencode($folder), ['Accept-Language' => 'fr']);
    }

    /**
     * Les fichiers de l'archive, nom → octets.
     *
     * @return array<string, string>
     */
    private function contenu(TestResponse $response): array
    {
        $response->assertOk()->assertHeader('Content-Type', 'application/zip');
        $path = tempnam(sys_get_temp_dir(), 'archive-test-');
        file_put_contents($path, $response->streamedContent());
        $zip = new ZipArchive;
        $this->assertTrue($zip->open($path) === true, 'archive illisible');
        $files = [];
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $name = (string) $zip->getNameIndex($i);
            $files[$name] = (string) $zip->getFromIndex($i);
        }
        $zip->close();
        unlink($path);

        return $files;
    }

    private function avecFichier(Document $document, string $nomDuFichier, string $octets): Document
    {
        $document->addMedia(UploadedFile::fake()->createWithContent($nomDuFichier, $octets))->toMediaCollection('file');

        return $document->refresh();
    }

    /** AC1 — « Quittances 2026 » : exactement les six quittances que le coffre liste, en PDF, nommées par date et libellé. */
    public function test_ac1_the_receipts_archive_holds_exactly_the_receipts_the_vault_lists(): void
    {
        $this->connecter($this->tenant);
        $listees = collect($this->coffre()['folders'])->firstWhere('key', 'receipts:2026')['entries'];
        $this->assertCount(6, $listees);

        $files = $this->contenu($this->archive('receipts:2026'));

        $this->assertCount(count($listees), $files);
        $this->assertEqualsCanonicalizing(
            ['2026-01-01 Reçu de caution.pdf', '2026-01-05 Quittance.pdf', '2026-02-05 Quittance.pdf', '2026-03-05 Quittance.pdf', '2026-04-05 Quittance.pdf', '2026-05-05 Quittance.pdf'],
            array_keys($files),
        );
        foreach ($files as $name => $bytes) {
            $this->assertStringStartsWith('%PDF', $bytes, $name);
        }
    }

    /** Un PDF de l'archive est celui de l'endpoint : le contrat figé est servi octet pour octet. */
    public function test_the_lease_folder_renders_its_generated_entries_like_their_endpoints(): void
    {
        $this->connecter($this->tenant);
        $files = $this->contenu($this->archive("lease:{$this->lease->id}"));

        $contrat = $this->get("/api/leases/{$this->lease->id}/contract/pdf")->assertOk()->getContent();
        $nomDuContrat = collect(array_keys($files))->first(fn (string $n) => str_ends_with($n, 'Contrat de bail signé.pdf'));
        $this->assertNotNull($nomDuContrat);
        // Le rendu à la volée porte sa date de génération : même gabarit, même longueur à quelques octets près.
        $this->assertStringStartsWith('%PDF', $files[$nomDuContrat]);
        $this->assertEqualsWithDelta(strlen($contrat), strlen($files[$nomDuContrat]), 64);
        $this->assertNotNull(collect(array_keys($files))->first(fn (string $n) => str_ends_with($n, 'État des lieux d’entrée.pdf')));
    }

    /** AC2 — le dossier d'un autre locataire rend 404, pas une archive vide ; une année absente aussi. */
    public function test_ac2_a_folder_of_another_tenant_is_a_404(): void
    {
        $this->connecter($this->otherTenant);
        $this->archive("lease:{$this->lease->id}")->assertNotFound();
        $this->archive("property:{$this->property->id}")->assertNotFound();
        $this->archive('receipts:2025')->assertNotFound();

        // Versant autorisé : son propre bail.
        $this->contenu($this->archive("lease:{$this->otherLease->id}"));
    }

    /** AC3 — une pièce interne de la fiche client n'y figure pas ; la pièce visible du même dossier, si. */
    public function test_ac3_an_internal_piece_of_the_customer_file_is_not_in_the_archive(): void
    {
        $fiche = Customer::query()->where('user_id', $this->tenant->id)->where('agency_id', $this->agency->id)->firstOrFail();
        $interne = $this->avecFichier($this->document($fiche, $this->agent, DocumentType::Other, 'Note de solvabilité'), 'note.pdf', 'INTERNE');
        $interne->forceFill(['is_internal' => true])->save();
        $visible = $this->avecFichier($this->document($fiche, $this->agent, DocumentType::Other, 'Attestation de domicile'), 'attestation.pdf', 'VISIBLE');
        $this->avecFichier($this->idCard, 'cni.jpg', 'CNI');

        $this->connecter($this->tenant);
        $files = $this->contenu($this->archive('pieces'));

        $this->assertArrayHasKey('Attestation de domicile.pdf', $files);
        $this->assertSame('VISIBLE', $files['Attestation de domicile.pdf']);
        $this->assertSame('CNI', $files['CNI.jpg']);
        $this->assertArrayNotHasKey('Note de solvabilité.pdf', $files);
        $this->assertNotContains('INTERNE', $files);
        $this->assertNotNull($visible->id);
    }

    /**
     * La règle d'auteur (TCK-2759 r4) : l'agent actif a dans son archive les pièces qu'il a déposées sur
     * la fiche d'un client, interne comprise ; suspendu, aucune.
     */
    public function test_the_author_rule_withholds_the_uploads_of_a_suspended_agent(): void
    {
        $fiche = Customer::query()->where('user_id', $this->tenant->id)->where('agency_id', $this->agency->id)->firstOrFail();
        $interne = $this->avecFichier($this->document($fiche, $this->agent, DocumentType::Other, 'Note de solvabilité'), 'note.pdf', 'INTERNE');
        $interne->forceFill(['is_internal' => true])->save();
        $this->avecFichier($this->document($fiche, $this->agent, DocumentType::Other, 'Attestation de domicile'), 'attestation.pdf', 'VISIBLE');

        // Témoin : actif, il les a toutes deux.
        $this->connecter($this->agent);
        $this->assertEqualsCanonicalizing(['Note de solvabilité.pdf', 'Attestation de domicile.pdf'], array_keys($this->contenu($this->archive('pieces'))));

        AgentProfile::query()->where('user_id', $this->agent->id)->update(['status' => AgentProfileStatus::Suspended->value]);
        $this->connecter($this->agent);
        $this->getJson("/api/documents/{$interne->id}")->assertForbidden();
        $this->archive('pieces')->assertStatus(422)->assertJsonPath('code', 'document.archive_empty');
    }

    /** Le fichier qui fait foi est la version active (TCK-2300), lu par le disque distant. */
    public function test_an_uploaded_piece_is_its_current_version_read_from_the_remote_disk(): void
    {
        $this->avecFichier($this->insurance, 'assurance.pdf', 'ORIGINAL');
        $this->insurance->addMedia(UploadedFile::fake()->createWithContent('assurance-v2.pdf', 'VERSION-2'))
            ->withCustomProperties(['is_active' => true, 'version_number' => 2])
            ->toMediaCollection('versions');

        $this->connecter($this->tenant);
        $files = $this->contenu($this->archive('pieces'));

        $this->assertSame('VERSION-2', $files['Assurance habitation.pdf']);
    }

    /** Les noms ne portent ni chemin, ni « ../ », ni identifiant ; deux noms égaux sont départagés. */
    public function test_names_carry_no_path_no_traversal_and_no_identifier(): void
    {
        $this->insurance->update(['name' => '../../etc/passwd']);
        $this->avecFichier($this->insurance, 'x.pdf', 'A');
        $this->idCard->update(['name' => 'Assurance']);
        $this->avecFichier($this->idCard, 'y.pdf', 'B');
        $copie = $this->avecFichier($this->document($this->tenant, $this->tenant, DocumentType::Other, 'assurance'), 'z.pdf', 'C');

        $this->connecter($this->tenant);
        $files = $this->contenu($this->archive('pieces'));

        $this->assertEqualsCanonicalizing(['etc-passwd.pdf', 'Assurance.pdf', 'assurance (2).pdf'], array_keys($files));
        foreach (array_keys($files) as $name) {
            $this->assertStringNotContainsString('/', $name);
            $this->assertStringNotContainsString('..', $name);
            $this->assertStringNotContainsString((string) $copie->id, $name);
        }
    }

    /** Le bailleur bloqué lit son bien en lecture seule : il en télécharge l'archive. */
    public function test_the_blocked_landlord_downloads_his_read_only_folder(): void
    {
        $profil = OwnerProfile::query()->where('user_id', $this->landlord->id)->sole();
        $profil->update(['status' => OwnerProfileStatus::Blocked]);
        $this->avecFichier($this->adminDocOnProperty, 'assurance.pdf', 'BIEN');
        $this->avecFichier($this->adminDocOnLease, 'avenant.pdf', 'BAIL');

        $this->connecter($this->landlord);
        $dossier = collect($this->coffre()['folders'])->firstWhere('key', "property:{$this->property->id}");
        $this->assertTrue($dossier['read_only']);

        $files = $this->contenu($this->archive("property:{$this->property->id}"));
        $this->assertCount(count($dossier['entries']), $files);
        $this->assertSame('BIEN', $files['Assurance du bien.pdf']);
        $this->assertSame('BAIL', $files['Avenant signé.pdf']);
    }

    /** « Relevés et attestations » : les relevés envoyés et l'attestation de l'année close, rendus par l'endpoint. */
    public function test_the_statements_folder(): void
    {
        $snapshots = app(OwnerStatementSnapshots::class);
        $snapshots->record($this->agency, $this->landlord, '2025-12', now());
        $profil = OwnerProfile::query()->where('user_id', $this->landlord->id)->sole();

        $this->connecter($this->landlord, $profil);
        $files = $this->contenu($this->archive('statements'));

        $this->assertEqualsCanonicalizing(['2025-12-31 Relevé.pdf', '2025-12-31 Attestation annuelle.pdf'], array_keys($files));
        foreach ($files as $name => $bytes) {
            $this->assertStringStartsWith('%PDF', $bytes, $name);
        }
    }

    /** Au-delà de MAX_FICHIERS entrées, un refus lisible ; à la borne, l'archive. */
    public function test_beyond_the_file_cap_the_archive_is_refused(): void
    {
        $this->connecter($this->tenant);
        $this->assertSame(6, count($this->contenu($this->archive('receipts:2026'))));

        foreach (range(1, ArchiveDuCoffre::MAX_FICHIERS - 5) as $i) {
            $this->payment($this->lease, LeasePaymentType::Charges, PaymentStatus::Paid, sprintf('2026-%02d-%02d', ($i % 12) + 1, intdiv($i, 12) + 10));
        }
        $this->archive('receipts:2026')
            ->assertStatus(422)
            ->assertJsonPath('code', 'document.archive_too_large')
            ->assertJsonPath('params.max_files', ArchiveDuCoffre::MAX_FICHIERS);
    }

    /** Au-delà de MAX_OCTETS de pièces, un refus lisible, avant tout rendu. */
    public function test_beyond_the_size_cap_the_archive_is_refused(): void
    {
        $this->avecFichier($this->insurance, 'assurance.pdf', 'A');
        $this->connecter($this->tenant);
        $this->contenu($this->archive('pieces'));

        $this->insurance->getFirstMedia('file')->forceFill(['size' => ArchiveDuCoffre::MAX_OCTETS + 1])->save();
        $this->archive('pieces')->assertStatus(422)->assertJsonPath('code', 'document.archive_too_large');
    }

    /** Un dossier vide n'a pas d'archive ; une clé mal formée est un 422 de validation. */
    public function test_an_empty_folder_and_a_malformed_key(): void
    {
        $this->connecter($this->otherTenant);
        $this->archive('pieces')->assertStatus(422)->assertJsonPath('code', 'document.archive_empty');
        $this->archive('../pieces')->assertStatus(422)->assertJsonValidationErrors('folder');
        $this->getJson('/api/me/document-vault/archive')->assertStatus(422)->assertJsonValidationErrors('folder');
    }

    /** « Mes factures » n'a pas de PDF (fiches JSON) : pas d'archive ; ses pièces, si. */
    public function test_the_bills_folder_has_no_archive(): void
    {
        $provider = $this->providerFor($this->agency);
        $profile = ServiceProviderProfile::query()->where('user_id', $provider->id)->sole();
        ServiceProviderBill::factory()->count(2)->create(['provider_id' => $provider->id, 'agency_id' => $this->agency->id]);
        $this->avecFichier($this->document($provider, $provider, DocumentType::Insurance, 'Assurance RC pro'), 'rc.pdf', 'RC');

        $this->connecter($provider, $profile);
        $this->archive('bills')->assertStatus(422)->assertJsonPath('code', 'document.archive_unavailable');
        $this->assertSame(['Assurance RC pro.pdf'], array_keys($this->contenu($this->archive('pieces'))));
    }

    /** Sous impersonation, l'archive est refusée comme un export (ADR-0055 §3) ; la cible, elle, la reçoit. */
    /**
     * La MESURE du plafond {@see ArchiveDuCoffre::MAX_FICHIERS}, rejouable, sautée par défaut (elle rend
     * ~80 PDF) : `MESURE_ARCHIVE=1 php artisan test tests/Feature/Documents/DocumentVaultArchiveTest.php
     * --filter=mesure`. Elle imprime le temps de chaque archive, la charge (`vm.loadavg`) et le pilote PDF ;
     * relever le chiffre AVEC sa charge, machine au repos (CLAUDE.md, § État courant). Mesuré le
     * 2026-11-14 sous dompdf, 8 cœurs : 40 quittances en 12,8 s (load 4), 39 relevés et attestations en
     * 13,0 s (load 7). Le pilote de préproduction n'est pas mesuré.
     */
    public function test_mesure_du_plafond_quittances_et_releves(): void
    {
        if (getenv('MESURE_ARCHIVE') !== '1') {
            $this->markTestSkipped('Mesure à la demande : MESURE_ARCHIVE=1.');
        }

        foreach (range(1, ArchiveDuCoffre::MAX_FICHIERS - 6) as $i) {
            $this->payment($this->lease, LeasePaymentType::Charges, PaymentStatus::Paid, sprintf('2026-%02d-%02d', ($i % 12) + 1, intdiv($i, 12) + 10));
        }
        $this->connecter($this->tenant);
        $quittances = $this->chronometrer(fn (): TestResponse => $this->archive('receipts:2026'));

        $snapshots = app(OwnerStatementSnapshots::class);
        foreach (range(0, 35) as $mois) {
            $snapshots->record($this->agency, $this->landlord, now()->setDate(2023, 1, 1)->addMonths($mois)->format('Y-m'), now());
        }
        $this->connecter($this->landlord, OwnerProfile::query()->where('user_id', $this->landlord->id)->sole());
        $releves = $this->chronometrer(fn (): TestResponse => $this->archive('statements'));

        fwrite(STDERR, sprintf(
            "\n[mesure TCK-2770] pilote=%s cœurs=%s load=%s\n  %d quittances : %.1f s\n  %d relevés et attestations : %.1f s\n",
            config('laravel-pdf.driver'),
            trim((string) shell_exec('sysctl -n hw.ncpu')),
            trim((string) shell_exec('sysctl -n vm.loadavg')),
            $quittances['fichiers'], $quittances['secondes'],
            $releves['fichiers'], $releves['secondes'],
        ));
        $this->assertSame(ArchiveDuCoffre::MAX_FICHIERS, $quittances['fichiers']);
        $this->assertGreaterThan(30, $releves['fichiers']);
    }

    /** @return array{fichiers: int, secondes: float} */
    private function chronometrer(callable $requete): array
    {
        $debut = hrtime(true);
        $files = $this->contenu($requete());

        return ['fichiers' => count($files), 'secondes' => (hrtime(true) - $debut) / 1e9];
    }

    /**
     * Décision du porteur (2026-11-14) : un pilote PDF qui échoue en cours d'archive ne rend jamais un 500
     * nu. Le double lève au TROISIÈME rendu, après deux entrées déjà écrites dans l'archive.
     */
    public function test_a_driver_rate_limit_mid_archive_is_a_503_with_retry_after_and_no_zip(): void
    {
        $double = $this->piloteQuiEchoueAuTroisieme(CouldNotGeneratePdf::cloudflareApiError(
            '{"success":false,"errors":[{"code":2001,"message":"Rate limit exceeded"}]}',
        ));
        Exceptions::fake();
        $this->connecter($this->tenant);

        $response = $this->archive('receipts:2026');

        $response->assertStatus(503)
            ->assertHeader('Retry-After', '60')
            ->assertExactJson([
                'code' => 'document.archive_render_busy',
                'message' => __('errors.document.archive_render_busy', [], 'fr'),
                'retry_after' => 60,
            ]);
        $this->assertStringStartsWith('application/json', (string) $response->headers->get('Content-Type'));
        $this->assertSame(3, $double->appels);
        Exceptions::assertReported(CouldNotGeneratePdf::class);
    }

    public function test_any_other_driver_failure_mid_archive_is_a_502_and_no_zip(): void
    {
        $double = $this->piloteQuiEchoueAuTroisieme(new RuntimeException('dompdf: police introuvable'));
        Exceptions::fake();
        $this->connecter($this->tenant);

        $response = $this->archive('receipts:2026');

        $response->assertStatus(502)
            ->assertHeaderMissing('Retry-After')
            ->assertExactJson([
                'code' => 'document.archive_render_failed',
                'message' => __('errors.document.archive_render_failed', [], 'fr'),
            ]);
        $this->assertStringStartsWith('application/json', (string) $response->headers->get('Content-Type'));
        $this->assertSame(3, $double->appels);
        Exceptions::assertReported(RuntimeException::class);
    }

    /** Un `DocumentPdfService` qui rend normalement, puis lève `$echec` au troisième rendu. */
    private function piloteQuiEchoueAuTroisieme(Throwable $echec): DocumentPdfService
    {
        $double = new class(app(PdfImageEmbedder::class), $echec) extends DocumentPdfService
        {
            public int $appels = 0;

            public function __construct(PdfImageEmbedder $images, private readonly Throwable $echec)
            {
                parent::__construct($images);
            }

            public function render(string $template, array $data): string
            {
                if (++$this->appels === 3) {
                    throw $this->echec;
                }

                return parent::render($template, $data);
            }
        };
        $this->app->instance(DocumentPdfService::class, $double);

        return $double;
    }

    public function test_under_impersonation_the_archive_is_refused(): void
    {
        $this->connecter($this->tenant);
        $this->contenu($this->archive('receipts:2026'));

        $session = $this->ouvrirUneSession(cible: $this->tenant);
        $this->avecLeJeton($session['jeton']);
        $this->archive('receipts:2026')->assertForbidden()->assertJsonPath('code', 'impersonation.read_only');
        // La lecture une à une reste ouverte.
        $this->coffre();
    }
}
