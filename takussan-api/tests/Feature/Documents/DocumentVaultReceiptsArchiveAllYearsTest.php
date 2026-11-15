<?php

namespace Tests\Feature\Documents;

use App\Jobs\Documents\BatirLArchiveDuCoffreJob;
use App\Models\DocumentVaultArchive;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PaymentStatus;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use Illuminate\Testing\TestResponse;
use Tests\Support\CoffreDeDocuments;
use Tests\Support\RemoteDiskFake;
use Tests\TestCase;
use ZipArchive;

/**
 * TCK-2915 (ADR-0099, amendement du 2026-11-15) — « Tout télécharger » de l'historique : toutes les
 * quittances en une archive, quelle que soit leur année. Deux dossiers VIRTUELS, `receipts:all` et
 * `receipts:lease:{id}`, réunissent les dossiers `receipts:{année}` déjà jugés par le coffre, sans
 * jamais se lister dans le coffre.
 */
class DocumentVaultReceiptsArchiveAllYearsTest extends TestCase
{
    use CoffreDeDocuments;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        RemoteDiskFake::install('r2-private');
        $this->batirLeCoffre();
        // Le décor porte six quittances en 2026 (caution comprise) ; huit loyers payés en 2025 en font 14.
        foreach (range(5, 12) as $month) {
            $this->payment($this->lease, LeasePaymentType::Rent, PaymentStatus::Paid, sprintf('2025-%02d-05', $month));
        }
    }

    private function archive(string $folder): TestResponse
    {
        return $this->getJson('/api/me/document-vault/archive?folder='.rawurlencode($folder), ['Accept-Language' => 'fr']);
    }

    /** @return list<string> les noms des fichiers de l'archive */
    private function noms(TestResponse $response): array
    {
        $response->assertOk()->assertHeader('Content-Type', 'application/zip');
        $path = tempnam(sys_get_temp_dir(), 'archive-test-');
        file_put_contents($path, $response->streamedContent());
        $zip = new ZipArchive;
        $this->assertTrue($zip->open($path) === true, 'archive illisible');
        $names = [];
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $names[] = (string) $zip->getNameIndex($i);
            $this->assertStringStartsWith('%PDF', (string) $zip->getFromIndex($i));
        }
        $zip->close();
        unlink($path);

        return $names;
    }

    /** AC3 — 14 échéances payées sur 2025 et 2026 : 14 PDF, ceux des deux dossiers d'année réunis. */
    public function test_ac3_toutes_les_quittances_de_toutes_les_annees(): void
    {
        $this->connecter($this->tenant);
        $folders = collect($this->coffre()['folders']);
        $parAnnee = $folders->where('kind', 'receipts')->sum(fn (array $f) => count($f['entries']));
        $this->assertSame(14, $parAnnee);
        $this->assertNull($folders->firstWhere('key', 'receipts:all'), 'le dossier virtuel ne se liste pas');

        $noms = $this->noms($this->archive('receipts:all'));

        $this->assertCount(14, $noms);
        $this->assertCount(8, array_filter($noms, fn (string $n) => str_starts_with($n, '2025-')));
        $this->assertCount(6, array_filter($noms, fn (string $n) => str_starts_with($n, '2026-')));
    }

    /** Les quittances d'UN bail ; le bail d'un autre ne se distingue pas d'un bail sans quittance. */
    public function test_les_quittances_d_un_bail_et_rien_de_celui_d_un_autre(): void
    {
        $this->connecter($this->tenant);
        $this->assertCount(14, $this->noms($this->archive("receipts:lease:{$this->lease->id}")));

        $this->archive("receipts:lease:{$this->otherLease->id}")->assertUnprocessable()->assertJsonPath('code', 'document.archive_empty');

        // L'autre locataire n'a que sa quittance : jamais celles du premier.
        $this->connecter($this->otherTenant);
        $this->assertCount(1, $this->noms($this->archive('receipts:all')));
        $this->archive("receipts:lease:{$this->lease->id}")->assertUnprocessable();
    }

    /** Sans quittance : 422 `document.archive_empty`, comme un dossier vide ; une clé mal formée : 422 de validation. */
    public function test_sans_quittance_et_cle_mal_formee(): void
    {
        $this->connecter($this->landlord);
        $this->archive('receipts:all')->assertUnprocessable()->assertJsonPath('code', 'document.archive_empty');
        $this->archive('receipts:everything')->assertUnprocessable()->assertJsonValidationErrors('folder');
    }

    /** L'archive préparée accepte la même clé, et la construit : 14 PDF au téléchargement. */
    public function test_l_archive_preparee_construit_receipts_all(): void
    {
        config(['media-library.disk_name' => 'r2-private']);
        Queue::fake();
        Notification::fake();
        $this->connecter($this->tenant);

        $demande = $this->postJson('/api/me/document-vault/archives', ['folder' => 'receipts:all'], ['Accept-Language' => 'fr'])
            ->assertStatus(202)
            ->assertJsonPath('data.folder', 'receipts:all');
        $archive = DocumentVaultArchive::query()->where('uuid', $demande->json('data.id'))->sole();
        Queue::assertPushed(BatirLArchiveDuCoffreJob::class);

        $this->app->instance('request', Request::create('/'));
        $this->app['auth']->forgetGuards();
        $travail = (new BatirLArchiveDuCoffreJob($archive->id))->withFakeQueueInteractions();
        $this->app->call([$travail, 'handle']);

        $this->connecter($this->tenant);
        $etat = collect($this->getJson('/api/me/document-vault/archives')->assertOk()->json('data'))->firstWhere('folder', 'receipts:all');
        $this->assertSame(['ready', 14], [$etat['status'], $etat['entries_count']]);
        $this->assertCount(14, $this->noms($this->get($etat['download_path'])));
    }
}
