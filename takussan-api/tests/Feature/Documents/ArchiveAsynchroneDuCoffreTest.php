<?php

namespace Tests\Feature\Documents;

use App\Jobs\Documents\BatirLArchiveDuCoffreJob;
use App\Jobs\Documents\PurgerLesArchivesDuCoffre;
use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\Customer;
use App\Models\Document;
use App\Models\DocumentVaultArchive;
use App\Models\Enums\DocumentType;
use App\Models\Enums\DocumentVaultArchiveStatus;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PaymentStatus;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use App\Notifications\CodedNotification;
use App\Services\Documents\ArchiveDuCoffre;
use App\Services\Documents\RechercheDuCoffre;
use App\Services\Media\PdfImageEmbedder;
use App\Services\Payout\OwnerStatementSnapshots;
use App\Services\Pdf\DocumentPdfService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use RuntimeException;
use Spatie\LaravelPdf\Exceptions\CouldNotGeneratePdf;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Tests\Support\CoffreDeDocuments;
use Tests\Support\RemoteDiskFake;
use Tests\Support\SessionsDImpersonation;
use Tests\TestCase;
use Throwable;
use ZipArchive;

/**
 * TCK-2812 (ADR-0099, amendement du 2026-11-14) — « Tout télécharger » au-delà du seuil synchrone : la
 * demande rend 202, `BatirLArchiveDuCoffreJob` bâtit l'archive sur la file `media` en rejugeant le coffre à
 * la construction, et le fichier se remet par un lien signé réservé au demandeur.
 *
 * Le travail s'exécute ici À LA MAIN, hors de toute requête (requête neuve, gardes oubliés), comme dans un
 * worker : un profil actif laissé par la requête de test ferait passer le travail pour juste.
 */
class ArchiveAsynchroneDuCoffreTest extends TestCase
{
    use CoffreDeDocuments;
    use RefreshDatabase;
    use SessionsDImpersonation;

    protected function setUp(): void
    {
        parent::setUp();
        // Un disque distant simulé : `getPath()` y rend un chemin qui n'existe pas (ADR-0029).
        RemoteDiskFake::install('r2-private');
        config(['media-library.disk_name' => 'r2-private']);
        Queue::fake();
        Notification::fake();
        $this->batirLeCoffre();
    }

    private function demander(string $folder): TestResponse
    {
        return $this->postJson('/api/me/document-vault/archives', ['folder' => $folder], ['Accept-Language' => 'fr']);
    }

    /** Le travail, exécuté hors requête comme par `worker-media` ; rendu pour lire ses interactions de file. */
    private function executer(int $archiveId, int $essai = 1): BatirLArchiveDuCoffreJob
    {
        $this->app->instance('request', Request::create('/'));
        $this->app['auth']->forgetGuards();
        $travail = (new BatirLArchiveDuCoffreJob($archiveId))->withFakeQueueInteractions();
        $travail->job->attempts = $essai;
        $this->app->call([$travail, 'handle']);

        return $travail;
    }

    private function archiveDe(TestResponse $demande): DocumentVaultArchive
    {
        return DocumentVaultArchive::query()->where('uuid', $demande->assertStatus(202)->json('data.id'))->sole();
    }

    /** @return array<string, mixed> l'état de la préparation de `$folder` lu par son demandeur */
    private function etat(User $user, string $folder, ?OwnerProfile $profil = null): array
    {
        $this->connecter($user, $profil);
        $etat = collect($this->getJson('/api/me/document-vault/archives')->assertOk()->json('data'))->firstWhere('folder', $folder);
        $this->assertNotNull($etat, "aucune préparation de {$folder}");

        return $etat;
    }

    /**
     * Les fichiers de l'archive, nom → octets.
     *
     * @return array<string, string>
     */
    private function contenu(TestResponse $response): array
    {
        $response->assertOk()->assertHeader('Content-Type', 'application/zip');
        $path = tempnam(sys_get_temp_dir(), 'archive-async-test-');
        file_put_contents($path, $response->streamedContent());
        $zip = new ZipArchive;
        $this->assertTrue($zip->open($path) === true, 'archive illisible');
        $files = [];
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $files[(string) $zip->getNameIndex($i)] = (string) $zip->getFromIndex($i);
        }
        $zip->close();
        unlink($path);

        return $files;
    }

    /** Aucun octet d'archive : un corps JSON d'erreur, jamais l'en-tête d'un zip. */
    private function assertSansOctetDArchive(TestResponse $response): void
    {
        $this->assertStringStartsWith('application/json', (string) $response->headers->get('Content-Type'));
        $corps = $response->baseResponse instanceof StreamedResponse ? $response->streamedContent() : (string) $response->getContent();
        $this->assertStringStartsNotWith('PK', $corps);
    }

    private function avecFichier(Document $document, string $nomDuFichier, string $octets): Document
    {
        $document->addMedia(UploadedFile::fake()->createWithContent($nomDuFichier, $octets))->toMediaCollection('file');

        return $document->refresh();
    }

    /** @return list<string> les noms des fichiers rangés sous la racine des archives */
    private function fichiersRanges(): array
    {
        return Storage::disk('r2-private')->allFiles(DocumentVaultArchive::RACINE);
    }

    private function ajouterDesQuittances(int $nombre): void
    {
        foreach (range(1, $nombre) as $i) {
            $this->payment($this->lease, LeasePaymentType::Charges, PaymentStatus::Paid, sprintf('2026-%02d-%02d', ($i % 12) + 1, intdiv($i, 12) + 10));
        }
    }

    /**
     * Les noms que l'archive doit porter pour les entrées du coffre : la date, puis le libellé français de
     * la catégorie, départagés par « (2) » — la règle de `ArchiveDuCoffre`, recalculée entrée par entrée.
     *
     * @param  list<array<string, mixed>>  $entrees
     * @return list<string>
     */
    private function nomsAttendus(array $entrees): array
    {
        $noms = [];
        $pris = [];
        foreach ($entrees as $entree) {
            $libelle = RechercheDuCoffre::vocabulaire()['categories'][$entree['category']]['fr'];
            $base = ArchiveDuCoffre::nomSur($entree['date'].' '.mb_strtoupper(mb_substr($libelle, 0, 1)).mb_substr($libelle, 1));
            $nom = "{$base}.pdf";
            for ($n = 2; isset($pris[mb_strtolower($nom)]); $n++) {
                $nom = "{$base} ({$n}).pdf";
            }
            $pris[mb_strtolower($nom)] = true;
            $noms[] = $nom;
        }

        return $noms;
    }

    /**
     * AC1 — 41 quittances : la demande rend 202 (le téléchargement direct, 422) ; le travail exécuté, le
     * `.zip` porte exactement les 41 entrées que le coffre liste dans ce dossier, noms comparés un à un.
     */
    public function test_ac1_beyond_the_sync_cap_the_request_is_a_202_and_the_zip_holds_exactly_the_listed_entries(): void
    {
        $this->ajouterDesQuittances(ArchiveDuCoffre::MAX_FICHIERS - 5);
        $this->connecter($this->tenant);
        $listees = collect($this->coffre()['folders'])->firstWhere('key', 'receipts:2026')['entries'];
        $this->assertCount(41, $listees);
        $this->getJson('/api/me/document-vault/archive?folder=receipts:2026')->assertStatus(422)->assertJsonPath('code', 'document.archive_too_large');

        $demande = $this->demander('receipts:2026');
        $demande->assertStatus(202)
            ->assertJsonPath('data.status', 'pending')
            ->assertJsonPath('data.folder', 'receipts:2026')
            ->assertJsonPath('data.download_path', null);
        $archive = $this->archiveDe($demande);
        Queue::assertPushedOn('media', BatirLArchiveDuCoffreJob::class, fn (BatirLArchiveDuCoffreJob $j) => $j->archiveId === $archive->id);

        $this->executer($archive->id);

        $etat = $this->etat($this->tenant, 'receipts:2026');
        $this->assertSame('ready', $etat['status']);
        $this->assertSame(41, $etat['entries_count']);
        $this->assertStringNotContainsString('archives-du-coffre', $etat['download_path']);
        $files = $this->contenu($this->get($etat['download_path']));

        $this->assertCount(41, $files);
        $this->assertSame($this->nomsAttendus($listees), array_keys($files));
        foreach ($files as $name => $bytes) {
            $this->assertStringStartsWith('%PDF', $bytes, $name);
        }
        Notification::assertSentTo($this->tenant, CodedNotification::class);
        $avis = AppNotification::query()->where('user_id', $this->tenant->id)->where('code', 'document.archive_ready')->sole();
        $this->assertEquals(['kind' => 'document_archive', 'id' => null, 'path' => '/app/documents'], $avis->target);
        // Le lien signé n'est rangé nulle part dans l'avis.
        $this->assertStringNotContainsString('signature', json_encode($avis->toArray()));
    }

    /**
     * AC2 — le lien ouvert par un autre compte rend 403 ; après expiration, 403 ou 410 ; sans signature,
     * 403. Aucun ne rend d'octet de l'archive. Versant autorisé : le demandeur, dans le délai.
     */
    public function test_ac2_the_link_opens_only_to_its_requester_and_only_before_expiry(): void
    {
        $this->connecter($this->tenant);
        $archive = $this->archiveDe($this->demander('receipts:2026'));
        $this->executer($archive->id);
        $lien = $this->etat($this->tenant, 'receipts:2026')['download_path'];

        // Un autre compte, avec le lien entier.
        $this->connecter($this->otherTenant);
        $autre = $this->get($lien);
        $autre->assertForbidden()->assertJsonPath('code', 'document.archive_link_invalid');
        $this->assertSansOctetDArchive($autre);

        // Le demandeur, sans la signature, ou avec une signature altérée.
        $this->connecter($this->tenant);
        $sansSignature = $this->get(strtok($lien, '?'));
        $sansSignature->assertForbidden();
        $this->assertSansOctetDArchive($sansSignature);
        $this->get(preg_replace('/signature=[0-9a-f]/', 'signature=z', $lien))->assertForbidden();

        // Versant autorisé.
        $this->assertCount(6, $this->contenu($this->get($lien)));

        // Après l'expiration.
        $this->travel(DocumentVaultArchive::DUREE_EN_HEURES + 1)->hours();
        $expire = $this->get($lien);
        $this->assertContains($expire->status(), [403, 410]);
        $this->assertSansOctetDArchive($expire);
    }

    /**
     * AC3 — une pièce interne ajoutée APRÈS la demande et AVANT l'exécution n'est pas dans l'archive ; une
     * pièce rendue illisible à l'appelant entre-temps non plus. La pièce restée visible y est.
     */
    public function test_ac3_the_vault_is_judged_when_the_archive_is_built_not_when_it_is_requested(): void
    {
        $fiche = Customer::query()->where('user_id', $this->tenant->id)->where('agency_id', $this->agency->id)->firstOrFail();
        $this->avecFichier($this->document($fiche, $this->agent, DocumentType::Other, 'Attestation de domicile'), 'attestation.pdf', 'VISIBLE');
        $devenueInterne = $this->avecFichier($this->document($fiche, $this->agent, DocumentType::Other, 'Bulletin de salaire'), 'bulletin.pdf', 'BULLETIN');
        $this->avecFichier($this->idCard, 'cni.jpg', 'CNI');

        $this->connecter($this->tenant);
        $archive = $this->archiveDe($this->demander('pieces'));

        // Entre la demande et l'exécution.
        $interne = $this->avecFichier($this->document($fiche, $this->agent, DocumentType::Other, 'Note de solvabilité'), 'note.pdf', 'INTERNE');
        $interne->forceFill(['is_internal' => true])->save();
        $devenueInterne->forceFill(['is_internal' => true])->save();

        $this->executer($archive->id);

        $files = $this->contenu($this->get($this->etat($this->tenant, 'pieces')['download_path']));
        $this->assertSame('VISIBLE', $files['Attestation de domicile.pdf']);
        $this->assertSame('CNI', $files['CNI.jpg']);
        $this->assertArrayNotHasKey('Note de solvabilité.pdf', $files);
        $this->assertArrayNotHasKey('Bulletin de salaire.pdf', $files);
        $this->assertNotContains('INTERNE', $files);
        $this->assertNotContains('BULLETIN', $files);
    }

    /** AC4 — sous impersonation, la demande rend 403 `impersonation.read_only` et rien n'est mis en file ; l'état et le lien aussi. */
    public function test_ac4_under_impersonation_nothing_is_queued_and_nothing_is_read(): void
    {
        // Une archive prête de la cible, pour éprouver aussi l'état et le lien.
        $this->connecter($this->tenant);
        $archive = $this->archiveDe($this->demander('receipts:2026'));
        $this->executer($archive->id);
        $lien = $this->etat($this->tenant, 'receipts:2026')['download_path'];
        $archive->delete();
        Queue::fake();

        $session = $this->ouvrirUneSession(cible: $this->tenant);
        $this->avecLeJeton($session['jeton']);
        $this->demander('receipts:2026')->assertForbidden()->assertJsonPath('code', 'impersonation.read_only');
        Queue::assertNothingPushed();
        $this->assertSame(0, DocumentVaultArchive::query()->count());

        $this->getJson('/api/me/document-vault/archives')->assertForbidden()->assertJsonPath('code', 'impersonation.read_only');
        $refus = $this->get($lien);
        $refus->assertForbidden()->assertJsonPath('code', 'impersonation.read_only');
        $this->assertSansOctetDArchive($refus);
    }

    /** Le lien sous impersonation est refusé AVANT que l'archive ne soit lue, même prête et à jour. */
    public function test_under_impersonation_a_ready_archive_link_is_refused(): void
    {
        $this->connecter($this->tenant);
        $archive = $this->archiveDe($this->demander('receipts:2026'));
        $this->executer($archive->id);
        $lien = $this->etat($this->tenant, 'receipts:2026')['download_path'];

        $session = $this->ouvrirUneSession(cible: $this->tenant);
        $this->avecLeJeton($session['jeton']);
        $refus = $this->get($lien);
        $refus->assertForbidden()->assertJsonPath('code', 'impersonation.read_only');
        $this->assertSansOctetDArchive($refus);
    }

    /**
     * AC5 — un pilote qui rend la limite de débit au troisième rendu puis réussit : le travail se relance
     * (60 s), aucun fichier entre-temps, et l'archive finale est complète.
     */
    public function test_ac5_a_rate_limit_releases_the_job_and_the_retry_completes_the_archive(): void
    {
        $double = $this->piloteQuiEchoue(CouldNotGeneratePdf::cloudflareApiError('{"success":false,"errors":[{"code":2001,"message":"Rate limit exceeded"}]}'), seulementAuTroisieme: true);
        Exceptions::fake();
        $this->connecter($this->tenant);
        $archive = $this->archiveDe($this->demander('receipts:2026'));

        $premier = $this->executer($archive->id);
        $premier->assertReleased(60);
        $this->assertSame(DocumentVaultArchiveStatus::Pending, $archive->refresh()->status);
        $this->assertSame([], $this->fichiersRanges());

        $this->executer($archive->id, essai: 2)->assertNotReleased();
        $this->assertGreaterThan(6, $double->appels);
        $this->assertCount(6, $this->contenu($this->get($this->etat($this->tenant, 'receipts:2026')['download_path'])));
    }

    /** AC5 — le même pilote qui échoue toujours : au dernier essai, l'archive échoue, l'appelant est notifié, aucun fichier. */
    public function test_ac5_a_rate_limit_on_every_attempt_fails_the_archive_notifies_and_leaves_no_file(): void
    {
        $this->piloteQuiEchoue(CouldNotGeneratePdf::cloudflareApiError('{"success":false,"errors":[{"code":2001,"message":"Rate limit exceeded"}]}'), seulementAuTroisieme: false);
        Exceptions::fake();
        $this->connecter($this->tenant);
        $archive = $this->archiveDe($this->demander('receipts:2026'));
        $travail = new BatirLArchiveDuCoffreJob($archive->id);

        foreach (range(1, $travail->tries - 1) as $essai) {
            $this->executer($archive->id, $essai)->assertReleased(60);
        }
        $this->executer($archive->id, $travail->tries)->assertNotReleased();

        $etat = $this->etat($this->tenant, 'receipts:2026');
        $this->assertSame('failed', $etat['status']);
        $this->assertSame('document.archive_render_busy', $etat['error_code']);
        $this->assertNull($etat['download_path']);
        $this->assertSame([], $this->fichiersRanges());
        $this->assertSame(1, AppNotification::query()->where('user_id', $this->tenant->id)->where('code', 'document.archive_failed')->count());
    }

    /** Un autre échec du pilote ne se relance pas : l'archive échoue tout de suite, notifiée une fois, sans fichier. */
    public function test_any_other_driver_failure_fails_the_archive_at_once(): void
    {
        $this->piloteQuiEchoue(new RuntimeException('dompdf: police introuvable'), seulementAuTroisieme: true);
        Exceptions::fake();
        $this->connecter($this->tenant);
        $archive = $this->archiveDe($this->demander('receipts:2026'));

        $this->executer($archive->id)->assertNotReleased();
        // Rejoué (une relivraison), il ne notifie pas une seconde fois.
        $this->executer($archive->id);

        $this->assertSame(DocumentVaultArchiveStatus::Failed, $archive->refresh()->status);
        $this->assertSame('document.archive_render_failed', $archive->error_code);
        $this->assertSame([], $this->fichiersRanges());
        $this->assertSame(1, AppNotification::query()->where('user_id', $this->tenant->id)->where('code', 'document.archive_failed')->count());
    }

    /** Le travail perdu (délai dépassé, essais épuisés) : `failed()` termine la préparation, sans fichier. */
    public function test_a_lost_job_fails_the_archive_through_failed(): void
    {
        $this->connecter($this->tenant);
        $archive = $this->archiveDe($this->demander('receipts:2026'));
        Storage::disk('r2-private')->put(DocumentVaultArchive::cheminPour($this->tenant->id, $archive->uuid), 'PARTIEL');

        (new BatirLArchiveDuCoffreJob($archive->id))->failed(new RuntimeException('timeout'));

        $this->assertSame(DocumentVaultArchiveStatus::Failed, $archive->refresh()->status);
        $this->assertSame([], $this->fichiersRanges());
        $this->assertSame(1, AppNotification::query()->where('code', 'document.archive_failed')->count());
    }

    /** AC6 — deux demandes du même dossier par le même compte, la seconde pendant la préparation : un seul travail. */
    public function test_ac6_a_second_identical_request_during_preparation_queues_nothing_more(): void
    {
        $this->connecter($this->tenant);
        $premiere = $this->demander('receipts:2026')->assertStatus(202)->json('data.id');
        $seconde = $this->demander('receipts:2026')->assertStatus(202)->json('data.id');

        $this->assertSame($premiere, $seconde);
        Queue::assertPushed(BatirLArchiveDuCoffreJob::class, 1);
        $this->assertSame(1, DocumentVaultArchive::query()->count());

        // Un autre dossier du même compte est une autre demande.
        $this->demander('pieces')->assertStatus(202);
        Queue::assertPushed(BatirLArchiveDuCoffreJob::class, 2);
    }

    /**
     * Le courriel ne porte pas le lien de l'archive : son bouton ouvre le coffre du front, qui exige la
     * session du demandeur, et aucun de ses textes ne contient l'adresse signée ni le chemin du fichier.
     * Le lien signé lui-même, ouvert sans session, rend 401 et aucun octet.
     */
    public function test_the_email_carries_no_archive_link_and_the_signed_link_needs_the_session(): void
    {
        config(['app.frontend_url' => 'https://front.exemple.test']);
        $this->connecter($this->tenant);
        $archive = $this->archiveDe($this->demander('receipts:2026'));
        $this->executer($archive->id);
        $lien = $this->etat($this->tenant, 'receipts:2026')['download_path'];
        $archive->refresh();

        $courriels = 0;
        Notification::assertSentTo($this->tenant, CodedNotification::class, function (CodedNotification $avis, array $canaux) use (&$courriels, $archive): bool {
            if ($avis->code->value !== 'document.archive_ready') {
                return false;
            }
            $this->assertContains('mail', $canaux);
            $courriel = $avis->toMail($this->tenant);
            $this->assertSame('https://front.exemple.test/app/documents', $courriel->actionUrl);
            $texte = json_encode($courriel->toArray(), JSON_UNESCAPED_SLASHES);
            foreach (['signature', 'expires=', '/download', 'document-vault', DocumentVaultArchive::RACINE, $archive->uuid] as $interdit) {
                $this->assertStringNotContainsString($interdit, $texte);
            }
            $courriels++;

            return true;
        });
        $this->assertSame(1, $courriels);

        // Le lien entier, sans session.
        $this->flushHeaders();
        $this->app['auth']->forgetGuards();
        $sansSession = $this->getJson($lien);
        $sansSession->assertUnauthorized();
        $this->assertSansOctetDArchive($sansSession);
    }

    /**
     * Une préparation terminée PENDANT la construction (ici, passée en échec) ne redevient pas prête : le
     * fichier écrit est effacé, puisque aucune ligne ne le référencerait et qu'aucune purge ne le retrouverait.
     */
    public function test_a_preparation_ended_during_the_build_keeps_no_file_and_sends_no_ready_notice(): void
    {
        $this->connecter($this->tenant);
        $archive = $this->archiveDe($this->demander('receipts:2026'));

        $this->app->instance(DocumentPdfService::class, new class(app(PdfImageEmbedder::class), $archive->id) extends DocumentPdfService
        {
            public function __construct(PdfImageEmbedder $images, private readonly int $archiveId)
            {
                parent::__construct($images);
            }

            public function render(string $template, array $data): string
            {
                DB::table('document_vault_archives')->where('id', $this->archiveId)->update(['status' => 'failed']);

                return parent::render($template, $data);
            }
        });

        $this->executer($archive->id);

        $this->assertSame(DocumentVaultArchiveStatus::Failed, $archive->refresh()->status);
        $this->assertNull($archive->path);
        $this->assertSame([], $this->fichiersRanges());
        $this->assertFalse(AppNotification::query()->where('user_id', $this->tenant->id)->where('code', 'document.archive_ready')->exists());
    }

    /** La base arbitre deux demandes simultanées : l'index unique partiel refuse un second `pending` de la même clé. */
    public function test_the_partial_unique_index_holds_one_pending_per_key(): void
    {
        $ligne = fn (string $statut) => [
            'uuid' => (string) Str::uuid(), 'user_id' => $this->tenant->id, 'folder' => 'receipts:2026',
            'locale' => 'fr', 'status' => $statut, 'created_at' => now(), 'updated_at' => now(),
        ];
        $this->assertSame(1, DB::table('document_vault_archives')->insertOrIgnore($ligne('pending')));
        // Sans profil (NULL) : NULLS NOT DISTINCT fait que la seconde se heurte quand même.
        $this->assertSame(0, DB::table('document_vault_archives')->insertOrIgnore($ligne('pending')));
        // Versant permis : une préparation terminée ne bloque rien.
        $this->assertSame(1, DB::table('document_vault_archives')->insertOrIgnore($ligne('failed')));
    }

    /** Après un échec, « Réessayer » relance une préparation, qui remplace l'ancienne. */
    public function test_a_retry_after_a_failure_replaces_the_failed_preparation(): void
    {
        $this->connecter($this->tenant);
        $archive = $this->archiveDe($this->demander('receipts:2026'));
        (new BatirLArchiveDuCoffreJob($archive->id))->failed(new RuntimeException('perdu'));

        $this->connecter($this->tenant);
        $nouvelle = $this->archiveDe($this->demander('receipts:2026'));

        $this->assertNotSame($archive->uuid, $nouvelle->uuid);
        $this->assertNull(DocumentVaultArchive::query()->find($archive->id));
        Queue::assertPushed(BatirLArchiveDuCoffreJob::class, 2);
    }

    /**
     * Le travail juge sous le PROFIL ACTIF DE LA DEMANDE, qu'il réinstalle hors requête, puis retire :
     * « Relevés et attestations » n'existe que sous le profil propriétaire du bailleur.
     */
    public function test_the_job_judges_under_the_profile_of_the_request_and_restores_the_worker_state(): void
    {
        app(OwnerStatementSnapshots::class)->record($this->agency, $this->landlord, '2025-12', now());
        $profil = OwnerProfile::query()->where('user_id', $this->landlord->id)->sole();
        $this->connecter($this->landlord, $profil);
        $archive = $this->archiveDe($this->demander('statements'));

        $this->executer($archive->id);

        $this->assertFalse(request()->attributes->has('active_profile'), 'le profil de la demande est resté posé sur la requête du worker');
        $etat = $this->etat($this->landlord, 'statements', $profil);
        $this->assertSame('ready', $etat['status']);
        $this->assertEqualsCanonicalizing(
            ['2025-12-31 Relevé.pdf', '2025-12-31 Attestation annuelle.pdf'],
            array_keys($this->contenu($this->get($etat['download_path']))),
        );
    }

    /**
     * L'agent de DEUX agences : hors requête, son agence ne se déduit plus (`User::getAgencyIdAttribute()`
     * rend null), et la pièce interne qu'il a déposée sur la fiche d'un client ne se lit que sous son
     * profil ACTIF de l'agence de la fiche. Le travail le réinstalle : elle est dans l'archive.
     */
    public function test_a_two_agency_agent_keeps_the_internal_piece_of_the_agency_of_the_request(): void
    {
        $fiche = Customer::query()->where('user_id', $this->tenant->id)->where('agency_id', $this->agency->id)->firstOrFail();
        $interne = $this->avecFichier($this->document($fiche, $this->agent, DocumentType::Other, 'Note de solvabilité'), 'note.pdf', 'INTERNE');
        $interne->forceFill(['is_internal' => true])->save();
        AgentProfile::query()->create(['user_id' => $this->agent->id, 'agency_id' => Agency::factory()->create()->id]);
        $profil = AgentProfile::query()->where('user_id', $this->agent->id)->where('agency_id', $this->agency->id)->sole();

        $this->connecter($this->agent, $profil);
        // Témoin : sous ce profil, le coffre la liste.
        $this->assertContains('Note de solvabilité', array_column(collect($this->coffre()['folders'])->firstWhere('key', 'pieces')['entries'], 'title'));
        $archive = $this->archiveDe($this->demander('pieces'));

        $this->executer($archive->id);

        $this->connecter($this->agent, $profil);
        $etat = collect($this->getJson('/api/me/document-vault/archives')->assertOk()->json('data'))->firstWhere('folder', 'pieces');
        $this->assertSame('ready', $etat['status']);
        $this->assertSame('INTERNE', $this->contenu($this->get($etat['download_path']))['Note de solvabilité.pdf'] ?? null);
    }

    /** La demande refuse ce que la construction refuserait : un dossier hors du coffre, « Mes factures », au-delà du plafond préparé. */
    public function test_the_request_refuses_a_foreign_folder_and_beyond_the_prepared_cap(): void
    {
        $this->connecter($this->otherTenant);
        $this->demander("lease:{$this->lease->id}")->assertNotFound();
        $this->demander('../pieces')->assertStatus(422)->assertJsonValidationErrors('folder');

        $this->ajouterDesQuittances(ArchiveDuCoffre::MAX_FICHIERS_PREPAREE - 5);
        $this->connecter($this->tenant);
        $this->demander('receipts:2026')
            ->assertStatus(422)
            ->assertJsonPath('code', 'document.archive_too_large')
            ->assertJsonPath('params.max_files', ArchiveDuCoffre::MAX_FICHIERS_PREPAREE);
        Queue::assertNothingPushed();
    }

    /** L'état ne montre que les préparations de l'appelant. */
    public function test_the_state_lists_only_the_callers_preparations(): void
    {
        $this->connecter($this->tenant);
        $this->demander('receipts:2026')->assertStatus(202);

        $this->connecter($this->otherTenant);
        $this->assertSame([], $this->getJson('/api/me/document-vault/archives')->assertOk()->json('data'));
    }

    /** La purge efface l'archive expirée et son fichier ; l'archive encore valable reste. */
    public function test_the_purge_erases_expired_archives_and_their_files(): void
    {
        $this->connecter($this->tenant);
        $expiree = $this->archiveDe($this->demander('receipts:2026'));
        $this->executer($expiree->id);
        $this->avecFichier($this->idCard, 'cni.jpg', 'CNI');
        $this->connecter($this->tenant);
        $valable = $this->archiveDe($this->demander('pieces'));
        $this->executer($valable->id);
        $this->assertCount(2, $this->fichiersRanges());

        $expiree->refresh()->forceFill(['expires_at' => now()->subMinute()])->save();
        (new PurgerLesArchivesDuCoffre)->handle();

        $this->assertNull(DocumentVaultArchive::query()->find($expiree->id));
        $this->assertNotNull(DocumentVaultArchive::query()->find($valable->id));
        $this->assertSame([DocumentVaultArchive::cheminPour($this->tenant->id, $valable->uuid)], $this->fichiersRanges());
    }

    /** Un `DocumentPdfService` qui lève `$echec` au troisième rendu seulement, ou à chaque rendu à partir du troisième. */
    private function piloteQuiEchoue(Throwable $echec, bool $seulementAuTroisieme): DocumentPdfService
    {
        $double = new class(app(PdfImageEmbedder::class), $echec, $seulementAuTroisieme) extends DocumentPdfService
        {
            public int $appels = 0;

            public function __construct(PdfImageEmbedder $images, private readonly Throwable $echec, private readonly bool $uneFois)
            {
                parent::__construct($images);
            }

            public function render(string $template, array $data): string
            {
                $this->appels++;
                if ($this->uneFois ? $this->appels === 3 : $this->appels >= 3) {
                    throw $this->echec;
                }

                return parent::render($template, $data);
            }
        };
        $this->app->instance(DocumentPdfService::class, $double);

        return $double;
    }
}
