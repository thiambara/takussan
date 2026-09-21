<?php

namespace Tests\Feature\Media;

use App\Models\Agency;
use App\Models\AgencyUpgradeRequest;
use App\Models\Document;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use App\Notifications\LeaseDepositRefundNotification;
use App\Services\Document\DocumentVersionService;
use App\Services\Lease\DepositRefundService;
use App\Services\Media\PrivateMediaAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use RuntimeException;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Tests\ApiTestCase;
use Tests\Support\RemoteDiskFake;

/**
 * TCK-539 — un fichier privé ne sort que par l'API, après autorisation, quel que soit son disque.
 *
 * Tout se joue sur `r2-private` simulé par {@see RemoteDiskFake} : `path()` y est relatif comme
 * sur S3, donc `$media->getPath()` y désigne un fichier qui n'existe pas. Un test sur
 * `Storage::fake()` ne prouverait rien — ce faux-là est un disque local où `getPath()` marche.
 *
 * Trois propriétés, chacune avec son témoin :
 *   1. `media.private.show` n'ouvre qu'à une URL signée, et rend une présignature de 5 minutes ;
 *   2. aucune ressource n'expose l'URL directe du fichier — elles émettent la route signée ;
 *   3. la copie temporaire des lecteurs à chemin ne survit pas à la lecture, même en erreur.
 */
class PrivateMediaAccessTest extends ApiTestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('public');
        RemoteDiskFake::install('r2-private');
    }

    // ─── 1. La route signée ──────────────────────────────────────

    public function test_a_signed_url_redirects_to_a_five_minute_presigned_url_on_the_media_disk(): void
    {
        $this->freezeTime();
        $media = $this->documentFile();

        $response = $this->get(app(PrivateMediaAccess::class)->signedUrl($media));

        $response->assertRedirect();
        $location = (string) $response->headers->get('Location');

        // La présignature du DISQUE du média, sur son chemin relatif — pas une URL locale.
        $this->assertStringStartsWith(
            RemoteDiskFake::PRESIGNED_HOST.'/r2-private/'.$media->getPathRelativeToRoot().'?',
            $location,
        );

        parse_str((string) parse_url($location, PHP_URL_QUERY), $query);
        $this->assertSame(now()->addMinutes(5)->getTimestamp(), (int) $query['expires']);
        $this->assertSame($media->mime_type, $query['ResponseContentType']);
        // `inline` : le front l'affiche dans un `<object>` (PdfViewer), il ne le télécharge pas.
        $this->assertStringStartsWith('inline;', $query['ResponseContentDisposition']);
    }

    public function test_an_unsigned_url_is_refused(): void
    {
        $media = $this->documentFile();

        $this->get("/api/media/{$media->id}/file")->assertForbidden();
    }

    public function test_a_signature_for_another_media_is_refused(): void
    {
        // La signature lie l'IDENTIFIANT : elle ne fait pas de la route un lecteur universel.
        $signed = $this->documentFile();
        $other = $this->documentFile();

        $url = str_replace("/media/{$signed->id}/", "/media/{$other->id}/", app(PrivateMediaAccess::class)->signedUrl($signed));

        $this->get($url)->assertForbidden();
    }

    public function test_an_expired_signature_is_refused(): void
    {
        $media = $this->documentFile();

        $this->get(app(PrivateMediaAccess::class)->signedUrl($media, now()->subMinute()))
            ->assertForbidden();
    }

    public function test_a_disk_that_cannot_presign_streams_the_file_instead(): void
    {
        RemoteDiskFake::install('r2-private', presigns: false);
        $media = $this->documentFile();

        $response = $this->get(app(PrivateMediaAccess::class)->signedUrl($media));

        $response->assertOk();
        $this->assertSame('contenu-du-document', $response->streamedContent());
    }

    // ─── 2. Aucune ressource n'expose l'URL du fichier ───────────

    public function test_the_document_resource_exposes_a_signed_api_url_for_its_file(): void
    {
        $user = User::factory()->create();
        $media = $this->documentFile($user);

        $url = $this->actingAs($user, 'sanctum')
            ->getJson("/api/documents/{$media->model_id}")
            ->assertOk()
            ->json('data.file_url');

        $this->assertIsSignedPrivateMediaUrl($url, $media);
    }

    public function test_the_document_version_resource_exposes_a_signed_api_url(): void
    {
        $user = User::factory()->create();
        $document = $this->document($user);
        $version = app(DocumentVersionService::class)->uploadVersion(
            $document,
            UploadedFile::fake()->createWithContent('v1.pdf', 'version-1'),
            $user,
            null,
        );

        $this->assertSame('r2-private', $version->disk);

        $url = $this->actingAs($user, 'sanctum')
            ->getJson("/api/documents/{$document->id}/versions")
            ->assertOk()
            ->json('data.0.url');

        $this->assertIsSignedPrivateMediaUrl($url, $version);
    }

    public function test_a_version_download_redirects_to_a_presigned_attachment(): void
    {
        $this->freezeTime();
        $user = User::factory()->create();
        $document = $this->document($user);
        $version = app(DocumentVersionService::class)->uploadVersion(
            $document,
            UploadedFile::fake()->createWithContent('v1.pdf', 'version-1'),
            $user,
            null,
        );

        $response = $this->actingAs($user, 'sanctum')
            ->get("/api/documents/{$document->id}/versions/{$version->id}/download");

        $response->assertRedirect();
        $location = (string) $response->headers->get('Location');
        $this->assertStringStartsWith(
            RemoteDiskFake::PRESIGNED_HOST.'/r2-private/'.$version->getPathRelativeToRoot().'?',
            $location,
        );

        parse_str((string) parse_url($location, PHP_URL_QUERY), $query);
        $this->assertSame(now()->addMinutes(5)->getTimestamp(), (int) $query['expires']);
        $this->assertStringStartsWith('attachment;', $query['ResponseContentDisposition']);
    }

    public function test_the_upgrade_request_detail_exposes_signed_api_urls(): void
    {
        $this->actingAsRole('super_admin');

        $agency = Agency::factory()->create(['kind' => AgencyKind::Individual]);
        $upgradeRequest = AgencyUpgradeRequest::factory()->pending()->create([
            'agency_id' => $agency->id,
            'submitted_by' => User::factory()->create()->id,
        ]);
        $document = Document::factory()->create([
            'documentable_id' => $upgradeRequest->id,
            'documentable_type' => AgencyUpgradeRequest::class,
        ]);
        $media = $document->addMedia(UploadedFile::fake()->createWithContent('ninea.pdf', 'ninea'))
            ->toMediaCollection('file');

        $url = $this->getJson("/api/admin/agency-upgrade-requests/{$upgradeRequest->id}")
            ->assertOk()
            ->json('data.documents.0.media_url');

        $this->assertIsSignedPrivateMediaUrl($url, $media);
    }

    public function test_the_deposit_refund_state_and_notification_expose_signed_api_urls(): void
    {
        $lease = Lease::factory()->create([
            'status' => LeaseStatus::Terminated,
            'deposit_amount' => 500000,
        ]);
        $media = $lease->addMedia(UploadedFile::fake()->createWithContent('facture.pdf', 'facture'))
            ->toMediaCollection('lease_deposit_refund');

        $this->assertSame('r2-private', $media->disk);

        $state = app(DepositRefundService::class)->state($lease);
        $this->assertIsSignedPrivateMediaUrl($state['attachments'][0]['url'], $media);

        $notification = new LeaseDepositRefundNotification($lease, 300000, 200000, 'Réparations');
        $payload = $notification->toArray((object) []);
        $this->assertIsSignedPrivateMediaUrl($payload['attachments'][0]['url'], $media);

        // Le lien d'un courriel se lit plus tard qu'une page — mais il expire.
        parse_str((string) parse_url($payload['attachments'][0]['url'], PHP_URL_QUERY), $query);
        $this->assertEqualsWithDelta(
            now()->addDays(LeaseDepositRefundNotification::ATTACHMENT_LINK_TTL_DAYS)->getTimestamp(),
            (int) $query['expires'],
            5,
        );
    }

    // ─── 3. La copie temporaire ──────────────────────────────────

    public function test_the_local_copy_holds_the_file_and_is_removed_after_reading(): void
    {
        $media = $this->documentFile();
        $seen = null;

        $content = app(PrivateMediaAccess::class)->withLocalCopy($media, function (string $path) use (&$seen) {
            $seen = $path;

            return file_get_contents($path);
        });

        $this->assertSame('contenu-du-document', $content);
        $this->assertFileDoesNotExist($seen);
    }

    public function test_the_local_copy_is_removed_even_when_the_reader_fails(): void
    {
        $media = $this->documentFile();
        $seen = null;

        try {
            app(PrivateMediaAccess::class)->withLocalCopy($media, function (string $path) use (&$seen): void {
                $seen = $path;

                throw new RuntimeException('lecteur en échec');
            });
            $this->fail('L’exception du lecteur devait remonter.');
        } catch (RuntimeException $e) {
            $this->assertSame('lecteur en échec', $e->getMessage());
        }

        $this->assertNotNull($seen);
        $this->assertFileDoesNotExist($seen);
    }

    // ─── Helpers ─────────────────────────────────────────────────

    private function assertIsSignedPrivateMediaUrl(mixed $url, Media $media): void
    {
        $this->assertIsString($url);
        $this->assertStringStartsWith(url("/api/media/{$media->id}/file?"), $url);
        $this->assertStringContainsString('signature=', $url);
        $this->assertTrue(URL::hasValidSignature(request()->create($url)), "URL non signée : {$url}");
    }

    private function document(?User $user = null): Document
    {
        $user ??= User::factory()->create();
        $property = Property::factory()->create(['user_id' => $user->id]);

        return Document::factory()->create([
            'documentable_id' => $property->id,
            'documentable_type' => Property::class,
            'uploaded_by' => $user->id,
        ]);
    }

    private function documentFile(?User $user = null): Media
    {
        $media = $this->document($user)
            ->addMedia(UploadedFile::fake()->createWithContent('bail.pdf', 'contenu-du-document'))
            ->toMediaCollection('file');

        $this->assertSame('r2-private', $media->disk);

        return $media;
    }
}
