<?php

namespace Tests\Feature\Maintenance;

use App\Models\Enums\MaintenanceStatus;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-592 — AC24 : les pièces d'un devis sont des PDF ou des images, rien d'autre.
 *
 * `attachments.*` n'avait que `file` et `max:5120` ; la sortie privée sert un média avec son type et
 * en `inline`. Un `.html` ou un `.svg` déposé par un prestataire se serait ouvert, tel quel, dans le
 * navigateur de l'agence dès que la fiche expose `media.quotes` (E).
 */
class MaintenanceQuoteAttachmentTypeTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake(config('media-library.disk_name'));
    }

    /** @return array<string, array{UploadedFile}> */
    public static function refused(): array
    {
        return [
            'html' => [UploadedFile::fake()->createWithContent('devis.html', '<script>alert(1)</script>')],
            'svg' => [UploadedFile::fake()->createWithContent('devis.svg', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')],
            'texte' => [UploadedFile::fake()->createWithContent('devis.txt', 'Total : 25 000')],
        ];
    }

    #[DataProvider('refused')]
    public function test_non_pdf_non_image_attachment_is_refused(UploadedFile $file): void
    {
        ['mr' => $mr, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::QuoteRequested);

        Sanctum::actingAs($provider);
        $this->post("/api/maintenance-requests/{$mr->id}/quote/submit", $this->quote([$file]), ['Accept' => 'application/json'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('attachments.0');

        $this->assertSame(MaintenanceStatus::QuoteRequested, $mr->refresh()->status);
        $this->assertCount(0, $mr->getMedia('quotes'));
    }

    /** Témoin : un PDF et une image passent. */
    public function test_pdf_and_image_are_accepted(): void
    {
        ['mr' => $mr, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::QuoteRequested);

        Sanctum::actingAs($provider);
        $this->post("/api/maintenance-requests/{$mr->id}/quote/submit", $this->quote([
            UploadedFile::fake()->create('devis.pdf', 100, 'application/pdf'),
            UploadedFile::fake()->image('photo.jpg'),
        ]), ['Accept' => 'application/json'])->assertOk();

        $this->assertCount(2, $mr->refresh()->getMedia('quotes'));
    }

    /** @param  list<UploadedFile>  $files */
    protected function quote(array $files): array
    {
        return $this->quoteBody(25000, ['attachments' => $files]);
    }
}
