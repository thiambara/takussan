<?php

namespace Tests\Feature\Http\Signatures;

use App\Http\Controllers\NotificationUnsubscribeController;
use App\Models\Document;
use App\Models\Enums\EmailFrequency;
use App\Models\Property;
use App\Models\User;
use App\Services\Media\PrivateMediaAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\Support\UrlSigneeDerriereTraefik;
use Tests\TestCase;

/**
 * TCK-1059 (P73.02) — les liens signés qui restent sur le domaine de l'API sont signés en RELATIF :
 * leur validité ne dépend plus du schéma que l'API voit, donc plus de la présence de Traefik dans
 * `TRUSTED_PROXIES`. L'hôte reste fixé à l'émission par `APP_URL` (TCK-1058).
 *
 * Les autres liens du lot ont leur test dans la classe de leur route : la pièce KYC
 * (`KycDocumentAccessTest`), l'accusé LAfricaMobile (`LAfricaMobileSmsWebhookTest`) et l'export
 * de rapport (`ReportExportDownloadTest`).
 */
class SignatureRelativeTest extends TestCase
{
    use RefreshDatabase;
    use UrlSigneeDerriereTraefik;

    protected function setUp(): void
    {
        parent::setUp();
        $this->signerCommeEnProduction();
    }

    public function test_le_fichier_prive_signe_hors_requete_reste_servi_hors_des_mandataires(): void
    {
        $document = Document::factory()->create([
            'documentable_type' => Property::class,
            'documentable_id' => Property::factory()->create()->id,
        ]);
        $media = $document->addMedia(UploadedFile::fake()->create('bail.pdf', 20, 'application/pdf'))
            ->toMediaCollection('file');

        $url = app(PrivateMediaAccess::class)->signedUrl($media);

        // Servi : une redirection vers l'URL présignée du disque. Un refus de signature rend 403.
        $this->presenterHorsDesMandataires($url)->assertRedirect();
    }

    public function test_le_desabonnement_du_resume_reste_valide_hors_des_mandataires(): void
    {
        $user = User::factory()->create(['email_frequency' => EmailFrequency::Daily]);

        $this->presenterHorsDesMandataires(NotificationUnsubscribeController::signedUrl($user))->assertRedirect();

        $this->assertSame(EmailFrequency::Off, $user->fresh()->email_frequency);
    }
}
