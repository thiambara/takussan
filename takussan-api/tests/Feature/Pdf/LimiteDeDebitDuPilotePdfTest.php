<?php

namespace Tests\Feature\Pdf;

use App\Jobs\GenerateLeasePaymentSchedule;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Customer;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\PayeeRole;
use App\Models\Enums\PayoutStatus;
use App\Models\Invoice;
use App\Models\Lease;
use App\Models\Payout;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\ServiceProviderBill;
use App\Models\User;
use App\Services\Payments\LeasePaymentLinkService;
use Closure;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as RequeteHttp;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use Spatie\LaravelPdf\Drivers\CloudflareDriver;
use Spatie\LaravelPdf\Drivers\PdfDriver;
use Spatie\LaravelPdf\Exceptions\CouldNotGeneratePdf;
use Tests\Support\CoffreDeDocuments;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-2811 — un échec du pilote PDF ne rend jamais un 500 nu, sur AUCUNE route qui rend un PDF : 503
 * `pdf.render_busy` + `Retry-After` pour la limite de débit de Cloudflare (code 2001, HTTP 429), 502
 * `pdf.render_failed` pour toute autre erreur du pilote.
 *
 * **Le double remplace le PILOTE, pas `DocumentPdfService`** : c'est le vrai `CloudflareDriver` de
 * spatie/laravel-pdf, posé comme `PdfDriver` du conteneur, dont seul le transport HTTP est simulé
 * (`Http::fake`, aucune requête réelle ne part). Le corps de Cloudflare traverse donc exactement le chemin
 * de production : `CouldNotGeneratePdf::cloudflareApiError($body)` levée par le pilote, puis le rendu
 * d'exception de `bootstrap/app.php`.
 *
 * La garde d'AC4 ({@see self::test_ac4_tout_appelant_de_rendu_pdf_est_couvert_ou_excuse()}) lit les
 * `appelants` de chaque ligne de {@see self::routes()} : un fichier de `app/` qui rend un PDF et n'y figure
 * pas (ni dans {@see self::EXCUSES}) la fait rougir, et une entrée qui ne rend plus rien aussi.
 */
class LimiteDeDebitDuPilotePdfTest extends TestCase
{
    use CoffreDeDocuments;
    use MaintenanceActors;
    use RefreshDatabase;

    /** Le corps que Cloudflare rend sur une limite de débit (relevé d'archive-2770, 2026-11-14). */
    private const LIMITE_DE_DEBIT = '{"success":false,"errors":[{"code":2001,"message":"Rate limit exceeded"}],"messages":[],"result":null}';

    /** Une autre erreur de l'API Cloudflare : ni limite de débit, ni 429. */
    private const AUTRE_ERREUR = '{"success":false,"errors":[{"code":10000,"message":"Authentication error"}],"messages":[],"result":null}';

    /**
     * Ce qui ressemble à un rendu PDF dans `app/` : tout appel statique `Pdf::` (façade ou alias global),
     * toute mention du paquet (`Spatie\LaravelPdf\…` : façade importée, `PdfBuilder`, la fonction `pdf()`),
     * le service commun et ses intermédiaires, les rendus extraits pour l'archive (`->renderPdf(`).
     */
    private const MOTIF_DE_RENDU = '/\bPdf::|Spatie\\\\LaravelPdf\\\\|\bDocumentPdfService\b|\bPaymentReceiptPdf\b|\bExportWriter\b|streamRentReceipt\(|renderLeaseContract\(|freezeRenewal\(|->renderPdf\(/';

    /**
     * Les fichiers de `app/` qui citent un rendu PDF sans être une route couverte par {@see self::routes()}.
     *
     * @var array<string, string> chemin → raison
     */
    private const EXCUSES = [
        'app/Services/Pdf/DocumentPdfService.php' => 'le service commun lui-même : ses appelants sont les lignes du fournisseur',
        'app/Models/Agency.php' => 'lit la constante LOGO_MAX_WIDTH, ne rend rien',
        'app/Services/Pdf/DomPdfPageTotalDriver.php' => 'le pilote dompdf lui-même, appelé par les rendus des lignes du fournisseur',
        'app/Services/Pdf/EchecDuPilotePdf.php' => 'le traitement de l’échec, ne rend rien',
        'app/Services/Documents/ArchiveDuCoffre.php' => 'garde ses propres codes document.archive_render_* : test_ac5_l_archive_garde_ses_codes_sous_le_vrai_pilote',
        'app/Http/Controllers/Api/Admin/ReportingController.php' => 'ExportWriter sous ReportExportRequest : format csv|xlsx seulement',
        'app/Http/Controllers/Api/ActivityLogExportController.php' => 'ExportWriter sous ExportActivityLogRequest : format csv|xlsx seulement',
        'app/Http/Controllers/Api/Admin/PrivacyRequestController.php' => 'ExportWriter::csv() seulement',
        'app/Jobs/Audit/ExportActivityLogJob.php' => 'cite ExportWriter dans un commentaire ; produit un csv|xlsx',
        'app/Support/Export/CsvCell.php' => 'cite ExportWriter::xlsx dans un commentaire, ne rend rien',
        'app/Models/BookingPayment.php' => 'cite PaymentReceiptPdf dans un commentaire, ne rend rien',
        // TCK-2906 — ajouté par TCK-2866 sans entrée (la garde d'AC4 rougissait).
        'app/Http/Controllers/Api/Me/MeExportsController.php' => 'ExportWriter::serve() d’octets déjà gardés : ne rend rien',
    ];

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        Bus::fake([GenerateLeasePaymentSchedule::class]);
        $this->batirLeCoffre();
    }

    /**
     * Une ligne par route qui rend un PDF. `appelants` : les fichiers de `app/` que la ligne couvre (le
     * contrôleur, et l'intermédiaire qui rend pour lui).
     *
     * @return array<string, array{0: string, 1: list<string>}>
     */
    public static function routes(): array
    {
        return [
            'quittance de loyer — GET leases/{lease}/receipts/{payment}/pdf' => ['quittance', ['app/Http/Controllers/Api/DocumentPdfController.php']],
            'facture — GET invoices/{invoice}/pdf' => ['facture', ['app/Http/Controllers/Api/DocumentPdfController.php']],
            'contrat de bail — GET leases/{lease}/contract/pdf' => ['contrat', ['app/Http/Controllers/Api/DocumentPdfController.php']],
            // TCK-2906 — l'aperçu du contrat d'un bail neuf, rendu depuis le formulaire.
            'aperçu du contrat — POST leases/contract-preview' => ['apercuDuContrat', ['app/Http/Controllers/Api/DocumentPdfController.php']],
            // TCK-2906 — deux rendus ajoutés par TCK-2866 et TCK-2909 sans leur ligne (la garde d'AC4 rougissait).
            'balance âgée — GET agencies/{agency}/finance/aging.pdf' => ['balanceAgee', ['app/Http/Controllers/Api/Agency/AgingBalanceController.php']],
            'avis de versement — GET payouts/{payout}/notice/pdf' => ['avisDeVersement', ['app/Http/Controllers/Api/PayoutNoticePdfController.php']],
            'reçu par lien public — GET pay/{token}/receipt' => ['recuParLienPublic', ['app/Http/Controllers/Api/PublicPaymentLinkController.php']],
            'relevé mensuel — GET owner-statements/pdf?period=YYYY-MM' => ['releveMensuel', ['app/Http/Controllers/Api/OwnerStatementController.php']],
            'attestation annuelle — GET owner-statements/pdf?period=YYYY' => ['attestationAnnuelle', ['app/Http/Controllers/Api/OwnerStatementController.php']],
            'devis d’intervention — GET maintenance-requests/{id}/quote/pdf' => ['devis', ['app/Http/Controllers/Api/MaintenanceQuoteController.php']],
            // TCK-2911 (ADR-0120 § 2) — le relevé des factures du prestataire.
            'relevé des factures du prestataire — GET service-provider-bills/statement/pdf' => ['releveDesFactures', ['app/Http/Controllers/Api/ServiceProviderBillStatementController.php']],
            // TCK-2897 (ADR-0099, amendement du 2026-11-15) — le PDF d'une facture et le rapport de fin d'intervention.
            'facture du prestataire — GET service-provider-bills/{bill}/pdf' => ['factureDuPrestataire', ['app/Http/Controllers/Api/ServiceProviderBillPdfController.php']],
            'rapport de fin d’intervention — GET maintenance-requests/{id}/completion-report/pdf' => ['rapportDeFinDIntervention', ['app/Http/Controllers/Api/MaintenanceCompletionReportController.php']],
            'état des lieux — GET inventories/{inventory}/pdf' => ['etatDesLieux', ['app/Http/Controllers/Api/InventoryController.php']],
            'reçu de réservation — GET booking-payments/{payment}/receipt' => ['recuDeReservation', ['app/Http/Controllers/Api/BookingPaymentController.php', 'app/Services/Payments/PaymentReceiptPdf.php']],
            'export en PDF — GET export/{entity}?format=pdf' => ['exportPdf', ['app/Http/Controllers/Api/ExportController.php', 'app/Services/Export/ExportWriter.php']],
            'demande de signature — POST leases/{lease}/signature-request' => ['demandeDeSignature', ['app/Services/Lease/LeaseSignatureService.php']],
            'renouvellement figé — POST leases/{lease}/renew' => ['renouvellement', ['app/Services/Lease/LeaseRenewalService.php']],
        ];
    }

    /**
     * AC1, AC2, AC7 — la limite de débit rend 503 `pdf.render_busy` avec `Retry-After` ; une autre erreur du
     * pilote, 502 `pdf.render_failed`. Les deux sont rapportées. Sans le traitement : 500 sur chaque ligne.
     *
     * @param  list<string>  $appelants
     */
    #[DataProvider('routes')]
    public function test_ac1_ac2_un_echec_du_pilote_rend_503_ou_502_jamais_500(string $methode, array $appelants): void
    {
        /** @var Closure(): TestResponse $requete */
        $requete = $this->{$methode}();
        Exceptions::fake();
        $pilote = $this->piloteCloudflare(self::LIMITE_DE_DEBIT, 429);

        $occupe = $requete();

        $occupe->assertStatus(503)
            ->assertJsonPath('code', 'pdf.render_busy')
            ->assertJsonPath('message', __('errors.pdf.render_busy', [], 'fr'))
            ->assertJsonPath('retry_after', 60);
        $this->assertSame('60', $occupe->headers->get('Retry-After'));
        $this->assertStringStartsWith('application/json', (string) $occupe->headers->get('Content-Type'));
        $this->assertGreaterThan(0, $pilote->appels, 'le pilote Cloudflare a bien été appelé');
        Exceptions::assertReported(fn (CouldNotGeneratePdf $e) => str_contains($e->getMessage(), 'Rate limit exceeded'));

        $pilote->corps = self::AUTRE_ERREUR;
        $pilote->statut = 403;
        $echec = $requete();

        $echec->assertStatus(502)
            ->assertHeaderMissing('Retry-After')
            ->assertExactJson([
                'code' => 'pdf.render_failed',
                'message' => __('errors.pdf.render_failed', [], 'fr'),
            ]);
        Exceptions::assertReported(fn (CouldNotGeneratePdf $e) => str_contains($e->getMessage(), 'Authentication error'));
    }

    /**
     * AC3 — la demande de signature sous la limite de débit : 503, et rien n'est figé — ni empreinte, ni
     * contrat rangé, ni changement de statut. Puis, le pilote rétabli, la même demande aboutit.
     */
    public function test_ac3_la_demande_de_signature_sous_la_limite_ne_fige_rien_et_reste_rejouable(): void
    {
        $requete = $this->demandeDeSignature();
        $this->piloteCloudflare(self::LIMITE_DE_DEBIT, 429);

        $requete()->assertStatus(503)->assertJsonPath('code', 'pdf.render_busy');

        $bail = $this->draftLease->fresh();
        $this->assertNull($bail->contract_sha256);
        $this->assertNull($bail->signature_requested_at);
        $this->assertSame(LeaseStatus::Draft, $bail->status);
        $this->assertSame(0, $bail->getMedia('signed_contract')->count());

        // Versant autorisé : le pilote rétabli, la demande se rejoue et fige le contrat.
        $this->app->instance(PdfDriver::class, app('laravel-pdf.driver.dompdf'));
        $requete()->assertOk();
        $bail = $this->draftLease->fresh();
        $this->assertNotNull($bail->contract_sha256);
        $this->assertSame(1, $bail->getMedia('signed_contract')->count());
    }

    /** Le renouvellement figé sous la limite : 503, et aucun bail enfant n'est créé. */
    public function test_le_renouvellement_sous_la_limite_ne_cree_aucun_bail(): void
    {
        $requete = $this->renouvellement();
        $avant = Lease::query()->count();
        $this->piloteCloudflare(self::LIMITE_DE_DEBIT, 429);

        $requete()->assertStatus(503)->assertJsonPath('code', 'pdf.render_busy');

        $this->assertSame($avant, Lease::query()->count());
    }

    /**
     * AC5 — l'archive du coffre, sous le MÊME pilote réel, garde ses propres codes : le traitement global ne
     * les écrase pas (elle attrape l'échec avant lui), et elle lit le même détecteur.
     */
    public function test_ac5_l_archive_garde_ses_codes_sous_le_vrai_pilote(): void
    {
        $this->connecter($this->tenant);
        $archive = fn (): TestResponse => $this->getJson('/api/me/document-vault/archive?folder=receipts:2026', ['Accept-Language' => 'fr']);
        $pilote = $this->piloteCloudflare(self::LIMITE_DE_DEBIT, 429);

        $archive()->assertStatus(503)->assertHeader('Retry-After', '60')
            ->assertJsonPath('code', 'document.archive_render_busy')->assertJsonPath('retry_after', 60);

        $pilote->corps = self::AUTRE_ERREUR;
        $pilote->statut = 403;
        $archive()->assertStatus(502)->assertHeaderMissing('Retry-After')
            ->assertJsonPath('code', 'document.archive_render_failed');
    }

    /**
     * AC4 — tout fichier de `app/` qui rend un PDF est couvert par une ligne de {@see self::routes()} ou
     * excusé avec sa raison ; une entrée qui ne rend plus rien rougit aussi (garde bilatérale).
     */
    public function test_ac4_tout_appelant_de_rendu_pdf_est_couvert_ou_excuse(): void
    {
        $trouves = $this->appelantsDeRendu();

        // Auto-épreuve : le motif voit encore le service commun et la façade, sinon il a cessé de matcher.
        $this->assertContains('app/Services/Pdf/DocumentPdfService.php', $trouves);
        $this->assertContains('app/Services/Export/ExportWriter.php', $trouves);

        $couverts = array_values(array_unique(array_merge(...array_column(self::routes(), 1))));
        $declares = array_merge($couverts, array_keys(self::EXCUSES));

        $this->assertSame([], array_values(array_diff($trouves, $declares)), 'appelant de rendu PDF absent du fournisseur d’AC1 et des excuses');
        $this->assertSame([], array_values(array_diff($declares, $trouves)), 'entrée du fournisseur ou excuse qui ne rend plus de PDF');
        $this->assertSame([], array_values(array_intersect($couverts, array_keys(self::EXCUSES))), 'un fichier à la fois couvert et excusé');
    }

    // ─── Le double du pilote ─────────────────────────────────────────────────────────────────────

    /**
     * Le vrai `CloudflareDriver`, dont le transport est simulé. Le corps et le statut se changent en cours
     * de test.
     */
    private function piloteCloudflare(string $corps, int $statut): object
    {
        $etat = new class($corps, $statut)
        {
            public int $appels = 0;

            public function __construct(public string $corps, public int $statut) {}
        };

        Http::preventStrayRequests();
        Http::fake(['api.cloudflare.com/*' => function (RequeteHttp $requete) use ($etat) {
            $etat->appels++;

            return Http::response($etat->corps, $etat->statut, ['Content-Type' => 'application/json']);
        }]);
        $this->app->instance(PdfDriver::class, new CloudflareDriver(['api_token' => 'jeton-factice', 'account_id' => 'compte-factice']));
        // Les messages se lisent en français, quelle que soit la route (publique ou authentifiée).
        $this->withHeader('Accept-Language', 'fr');

        return $etat;
    }

    // ─── Une requête par route ───────────────────────────────────────────────────────────────────

    private function quittance(): Closure
    {
        $this->connecter($this->tenant);

        return fn (): TestResponse => $this->get("/api/leases/{$this->lease->id}/receipts/{$this->paid[1]->id}/pdf");
    }

    private function facture(): Closure
    {
        $facture = Invoice::factory()->create(['customer_id' => $this->lease->tenant_id]);
        $this->connecter($this->tenant);

        return fn (): TestResponse => $this->get("/api/invoices/{$facture->id}/pdf");
    }

    private function contrat(): Closure
    {
        $this->assertNull($this->lease->contract_sha256, 'un contrat figé se sert sans rendu');
        $this->connecter($this->tenant);

        return fn (): TestResponse => $this->get("/api/leases/{$this->lease->id}/contract/pdf");
    }

    /** TCK-2906 — l'agent de l'agence prévisualise le contrat d'un bail neuf sur un bien de l'agence. */
    private function apercuDuContrat(): Closure
    {
        $this->connecter($this->agent, AgentProfile::query()->where('user_id', $this->agent->id)->sole());

        return fn (): TestResponse => $this->postJson('/api/leases/contract-preview', [
            'property_id' => $this->property->id,
            'tenant_id' => $this->lease->tenant_id,
            'type' => 'residential_rent',
            'start_date' => '2026-07-01',
            'monthly_rent' => 350000,
        ]);
    }

    /** TCK-2906 — la balance âgée en PDF (TCK-2866), lue par l'admin de l'agence. */
    private function balanceAgee(): Closure
    {
        $this->connecter($this->admin, AgencyAdminProfile::query()->where('user_id', $this->admin->id)->sole());

        return fn (): TestResponse => $this->get("/api/agencies/{$this->agency->id}/finance/aging.pdf");
    }

    /** TCK-2906 — l'avis d'un reversement terminé au bailleur (TCK-2909), lu par le bailleur. */
    private function avisDeVersement(): Closure
    {
        $versement = Payout::factory()->create([
            'agency_id' => $this->agency->id,
            'landlord_id' => $this->landlord->id,
            'payee_role' => PayeeRole::Landlord,
            'status' => PayoutStatus::Completed,
            'processed_at' => '2026-02-10 09:00:00',
        ]);
        $this->connecter($this->landlord, OwnerProfile::query()->where('user_id', $this->landlord->id)->sole());

        return fn (): TestResponse => $this->get("/api/payouts/{$versement->id}/notice/pdf");
    }

    private function recuParLienPublic(): Closure
    {
        // Un lien d'échéance payée reste lisible 30 jours après le règlement (TCK-2778) : on s'y place.
        $this->travelTo($this->paid[1]->paid_at->copy()->addDays(3));
        $jeton = Str::after(app(LeasePaymentLinkService::class)->urlFor($this->paid[1]), '/pay/');

        return fn (): TestResponse => $this->get("/api/pay/{$jeton}/receipt");
    }

    private function releveMensuel(): Closure
    {
        $this->connecter($this->landlord, OwnerProfile::query()->where('user_id', $this->landlord->id)->sole());

        return fn (): TestResponse => $this->get('/api/owner-statements/pdf?period=2026-01');
    }

    private function attestationAnnuelle(): Closure
    {
        $this->connecter($this->landlord, OwnerProfile::query()->where('user_id', $this->landlord->id)->sole());

        return fn (): TestResponse => $this->get('/api/owner-statements/pdf?period=2026');
    }

    private function devis(): Closure
    {
        ['mr' => $mr, 'provider' => $prestataire] = $this->maintenanceScenario(MaintenanceStatus::QuoteSubmitted, [
            'quote_amount' => 27000,
            'quote_currency' => 'XOF',
            'quote_submitted_at' => now(),
            'quote_lines' => [['label' => 'Pose', 'kind' => 'labour', 'quantity' => '1.00', 'unit_price' => '27000.00', 'total' => '27000.00']],
        ]);
        $this->connecter($prestataire);

        return fn (): TestResponse => $this->get("/api/maintenance-requests/{$mr->id}/quote/pdf");
    }

    /** TCK-2911 (ADR-0120 § 2) — le prestataire et une facture envoyée du mois. */
    private function releveDesFactures(): Closure
    {
        ['provider' => $prestataire] = $this->maintenanceScenario(MaintenanceStatus::Completed);
        ServiceProviderBill::factory()->create(['provider_id' => $prestataire->id, 'agency_id' => $this->agency->id]);
        $this->connecter($prestataire);

        return fn (): TestResponse => $this->get('/api/service-provider-bills/statement/pdf');
    }

    /** TCK-2897 — le prestataire et sa facture envoyée. */
    private function factureDuPrestataire(): Closure
    {
        ['provider' => $prestataire, 'mr' => $mr, 'agency' => $agence, 'property' => $bien] = $this->maintenanceScenario(MaintenanceStatus::Completed);
        $facture = ServiceProviderBill::factory()->create(['provider_id' => $prestataire->id, 'agency_id' => $agence->id, 'property_id' => $bien->id, 'maintenance_request_id' => $mr->id]);
        $this->connecter($prestataire);

        return fn (): TestResponse => $this->get("/api/service-provider-bills/{$facture->id}/pdf");
    }

    /** TCK-2897 — le prestataire assigné et son intervention close. */
    private function rapportDeFinDIntervention(): Closure
    {
        ['mr' => $mr, 'provider' => $prestataire] = $this->maintenanceScenario(MaintenanceStatus::Closed, ['resolution_notes' => 'Joint remplacé.', 'completed_at' => now()]);
        $this->connecter($prestataire);

        return fn (): TestResponse => $this->get("/api/maintenance-requests/{$mr->id}/completion-report/pdf");
    }

    private function etatDesLieux(): Closure
    {
        $this->connecter($this->tenant);

        return fn (): TestResponse => $this->get("/api/inventories/{$this->signedInventory->id}/pdf");
    }

    private function recuDeReservation(): Closure
    {
        $reservation = Booking::factory()->create(['customer_id' => $this->lease->tenant_id]);
        $paiement = BookingPayment::factory()->paid()->create(['booking_id' => $reservation->id, 'amount' => 125000]);
        $this->connecter($this->tenant);

        return fn (): TestResponse => $this->get("/api/booking-payments/{$paiement->id}/receipt");
    }

    private function exportPdf(): Closure
    {
        $this->agency->update(['primary_admin_id' => $this->admin->id]);
        $this->connecter($this->admin);

        return fn (): TestResponse => $this->get('/api/export/leases?format=pdf');
    }

    private function demandeDeSignature(): Closure
    {
        $this->connecter($this->landlord, OwnerProfile::query()->where('user_id', $this->landlord->id)->sole());

        return fn (): TestResponse => $this->postJson("/api/leases/{$this->draftLease->id}/signature-request");
    }

    /** Un parent figé (signé) dont le renouvellement naît actif et fige son contrat (TCK-1788). */
    private function renouvellement(): Closure
    {
        $bailleur = User::factory()->create();
        $bien = Property::factory()->create(['user_id' => $bailleur->id]);
        $parent = Lease::factory()->active()->create([
            'landlord_id' => $bailleur->id,
            'property_id' => $bien->id,
            'tenant_id' => Customer::factory()->create()->id,
            'start_date' => now()->subYear(),
            'end_date' => now(),
            'monthly_rent' => 400_000,
            'deposit_amount' => 800_000,
            'early_termination_penalty_months' => 2,
            'rent_review_max_pct' => 10,
        ]);
        $this->connecter($bailleur);

        return fn (): TestResponse => $this->postJson("/api/leases/{$parent->id}/renew", [
            'start_date' => $parent->end_date->copy()->addDay()->toDateString(),
            'end_date' => $parent->end_date->copy()->addYear()->toDateString(),
        ]);
    }

    /** @return list<string> les fichiers de `app/` qui citent un rendu PDF, relatifs à la racine de l'API */
    private function appelantsDeRendu(): array
    {
        $racine = base_path();
        $trouves = [];
        foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($racine.'/app')) as $fichier) {
            if ($fichier->isFile() && $fichier->getExtension() === 'php'
                && preg_match(self::MOTIF_DE_RENDU, (string) file_get_contents($fichier->getPathname())) === 1) {
                $trouves[] = Str::after($fichier->getPathname(), $racine.'/');
            }
        }
        sort($trouves);

        return $trouves;
    }
}
