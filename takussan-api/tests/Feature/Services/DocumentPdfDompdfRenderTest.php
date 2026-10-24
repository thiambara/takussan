<?php

namespace Tests\Feature\Services;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Inventory;
use App\Models\Invoice;
use App\Models\Property;
use App\Models\User;
use App\Services\Inventory\InventorySignatureService;
use App\Services\Pdf\DocumentPdfService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\View;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Angle 109 des pistes — ce que dompdf IMPRIME, et non ce que la vue contient.
 *
 * `DocumentPdfServiceTest` lit le HTML des gabarits : il reste vert quel que soit le moteur.
 * Ces tests rendent un vrai PDF sous `laravel-pdf.driver=dompdf` (le pilote de `phpunit.xml`,
 * du développement et du plan de préproduction) et lisent le fichier produit.
 */
class DocumentPdfDompdfRenderTest extends TestCase
{
    use RefreshDatabase;

    /**
     * TCK-1233 (P109.01) — le logo est une URL `http(s)` du disque public, que dompdf refuse
     * (`is_remote_enabled` à `false`) : il imprimait le texte `alt` à la place, sans erreur.
     */
    public function test_the_agency_logo_is_embedded_as_a_data_uri_and_printed_as_an_image(): void
    {
        $agency = Agency::factory()->create(['name' => 'Dakar Immo']);
        $agency->addMedia(UploadedFile::fake()->image('logo.png', 800, 200))->toMediaCollection('logo');

        $captured = null;
        View::composer('pdf.invoices.default', function ($view) use (&$captured) {
            $captured = $view->getData()['agency_logo_url'] ?? null;
        });

        $bytes = $this->renderInvoice($agency);

        $this->assertIsString($captured);
        $this->assertStringStartsWith('data:image/png;base64,', $captured);
        // Réduit pour le PDF : jamais l'original à 800 px.
        $logo = base64_decode(substr($captured, strlen('data:image/png;base64,')), true);
        $this->assertLessThanOrEqual(DocumentPdfService::LOGO_MAX_WIDTH, getimagesizefromstring($logo)[0]);

        // Le PNG réduit garde son canal alpha : dompdf écrit l'image et son masque (`/SMask`).
        $this->assertGreaterThanOrEqual(1, preg_match_all('#/Subtype\s*/Image#', $bytes), 'Le PDF doit porter le logo comme image.');
    }

    public function test_an_agency_without_logo_prints_its_name_and_no_image(): void
    {
        $agency = Agency::factory()->create(['name' => 'Dakar Immo']);

        $bytes = $this->renderInvoice($agency);

        $this->assertSame(0, preg_match_all('#/Subtype\s*/Image#', $bytes));
    }

    /**
     * TCK-1235 (P109.02) — `counter(pages)` vaut 0 sous dompdf : le pied imprimait « Page 1 sur 0 ».
     */
    public function test_the_footer_prints_the_page_total_of_a_two_page_document(): void
    {
        $bytes = $this->renderInvoice(null, notes: str_repeat('Lorem ipsum dolor sit amet, consectetur adipiscing elit. ', 45));

        $this->assertSame(2, $this->pageCount($bytes));

        $footer = array_values(array_filter(
            $this->textRuns($bytes),
            fn (array $run): bool => in_array(trim($run['text']), ['Page', 'sur', '1', '2', '0'], true)
                && $run['y'] < 60,
        ));
        $this->assertSame(
            ['Page', '1', 'sur', '2', 'Page', '2', 'sur', '2'],
            array_map(fn (array $run): string => trim($run['text']), $footer),
        );
    }

    /**
     * TCK-1237 (P109.03) — l'en-tête et le pied étaient en `display: flex`, que dompdf ramène à
     * `block` : le badge passait sous le nom, à gauche, et la pagination suivait la note.
     */
    public function test_the_header_badge_and_the_pagination_sit_on_the_right_of_their_row(): void
    {
        $agency = Agency::factory()->create(['name' => 'Dakar Immo']);

        $runs = $this->textRuns($this->renderInvoice($agency, label: 'Badge'));
        $find = function (string $text) use ($runs): array {
            foreach ($runs as $run) {
                if (trim($run['text']) === $text) {
                    return $run;
                }
            }
            $this->fail("« {$text} » introuvable dans le PDF.");
        };

        $name = $find('Dakar Immo');
        $badge = $find('BADGE');
        $note = $runs[array_key_first(array_filter($runs, fn (array $r): bool => str_starts_with($r['text'], 'Document généré le')))];
        $page = $find('Page');

        // A4 : 595 pt de large, marges de 18 mm (51 pt) ; la colonne de droite commence au milieu.
        $this->assertGreaterThan(297, $badge['x'], 'Le badge doit être à droite de la page.');
        $this->assertLessThan(12, abs($badge['y'] - $name['y']), 'Le badge doit être sur la ligne du nom.');

        $this->assertGreaterThan(400, $page['x'], 'La pagination doit être à droite du pied.');
        $this->assertLessThan(3, abs($page['y'] - $note['y']), 'La pagination doit être sur la ligne de la note.');
    }

    /**
     * TCK-1239 (P109.04) — la fabrique signait d'un `base64_encode('tenant-sig')`, qui n'est pas
     * une image : dompdf imprimait le texte `alt` (« Image type unknown »), sans rougir.
     */
    public function test_a_signed_inventory_from_the_factory_prints_both_signatures(): void
    {
        [$owner, $inventory] = $this->signedInventory(null);

        Sanctum::actingAs($owner);
        $pdf = $this->get("/api/inventories/{$inventory->id}/pdf")->assertOk()->getContent();

        $this->assertSame(2, preg_match_all('#/Subtype\s*/Image#', $pdf), 'Les deux signatures doivent s\'imprimer.');
    }

    /**
     * TCK-1239 (P109.04) — décision : le logo d'un état des lieux signé n'est pas figé. Le PDF se
     * recompose au téléchargement avec le logo courant (TCK-596), et l'empreinte n'en dépend pas.
     */
    public function test_a_signed_inventory_takes_the_current_logo_outside_of_its_fingerprint(): void
    {
        $agency = Agency::factory()->create();
        $agency->addMedia(UploadedFile::fake()->image('ancien.png', 120, 40))->toMediaCollection('logo');
        [$owner, $inventory] = $this->signedInventory($agency);
        $signatures = app(InventorySignatureService::class);

        $logos = [];
        View::composer('pdf.inventories.report', function ($view) use (&$logos) {
            $logos[] = $view->getData()['agency_logo_url'] ?? null;
        });

        Sanctum::actingAs($owner);
        $this->get("/api/inventories/{$inventory->id}/pdf")->assertOk();
        $before = $signatures->frozenTraceabilityHash($inventory->refresh());

        $agency->addMedia(UploadedFile::fake()->image('nouveau.png', 200, 60))->toMediaCollection('logo');
        $this->get("/api/inventories/{$inventory->id}/pdf")->assertOk();

        $this->assertCount(2, $logos);
        $this->assertStringStartsWith('data:image/png;base64,', (string) $logos[1]);
        $this->assertNotSame($logos[0], $logos[1], 'Le second téléchargement prend le logo courant.');
        $this->assertSame($before, $signatures->frozenTraceabilityHash($inventory->refresh()));
    }

    /** @return array{0: User, 1: Inventory} */
    private function signedInventory(?Agency $agency): array
    {
        // P218.04 (TCK-2198) — le conducteur d'un bien d'agence n'y lit que s'il en est membre : le
        // propriétaire du bien est ici le bailleur de l'agence (`OwnerProfile`), comme en vrai.
        $owner = User::factory()->create(['agency_id' => $agency?->id]);
        $property = Property::factory()->create(['user_id' => $owner->id, 'agency_id' => $agency?->id]);
        $tenant = Customer::factory()->create(['user_id' => User::factory()->create()->id]);

        $inventory = Inventory::factory()->signed()->create([
            'property_id' => $property->id,
            'tenant_id' => $tenant->id,
            'conducted_by' => $owner->id,
        ]);

        return [$owner, $inventory];
    }

    private function renderInvoice(?Agency $agency, ?string $notes = null, string $label = 'Facture'): string
    {
        $customer = Customer::factory()->create();
        $invoice = Invoice::factory()->create([
            'customer_id' => $customer->id,
            'subtotal' => 250_000,
            'total_amount' => 250_000,
            'notes' => $notes,
        ]);

        return app(DocumentPdfService::class)->render('pdf.invoices.default', [
            'invoice' => $invoice,
            'customer' => $customer,
            'agency' => $agency,
            'title' => 'Facture',
            'document_label' => $label,
        ]);
    }

    private function pageCount(string $pdf): int
    {
        return preg_match_all('#/Type\s*/Page\b(?!s)#', $pdf);
    }

    /**
     * Les morceaux de texte du PDF, dans l'ordre du flux : `BT x y Td [s Tc] /Fn t Tf [(…)] TJ ET`,
     * ce qu'écrit l'adaptateur CPDF de dompdf (`Tc` : l'espacement des lettres). Une police Unicode (DejaVu) écrit l'UTF-16BE, une
     * police de base le Windows-1252.
     *
     * Chaque flux se coupe à son `/Length`, jamais à `endstream` : un flux compressé qui finit par
     * l'octet `\r` le perdait dans la fin de ligne, `gzuncompress` échouait et la page entière
     * disparaissait — selon la minute imprimée au pied, environ un rendu sur vingt.
     *
     * @return list<array{x: float, y: float, text: string}>
     */
    private function textRuns(string $pdf): array
    {
        preg_match_all('#/Length (\d+)\s*>>\s*stream\r?\n#', $pdf, $heads, PREG_SET_ORDER | PREG_OFFSET_CAPTURE);

        $runs = [];
        foreach ($heads as [$head, $length]) {
            $content = @gzuncompress(substr($pdf, $head[1] + strlen($head[0]), (int) $length[0]));
            if (! is_string($content)) {
                continue;
            }

            preg_match_all('#BT ([\d.]+) ([\d.]+) Td (?:-?[\d.]+ Tc )?/F\d+ [\d.]+ Tf\s+\[\((.*?)\)\] TJ(?: -?[\d.]+ Tc)? ET#s', $content, $matches, PREG_SET_ORDER);
            foreach ($matches as [, $x, $y, $raw]) {
                $bytes = preg_replace_callback(
                    '#\\\\([0-7]{1,3}|.)#s',
                    fn (array $e): string => ctype_digit($e[1][0])
                        ? chr(octdec($e[1]))
                        : (['n' => "\n", 'r' => "\r", 't' => "\t", 'b' => "\x08", 'f' => "\f"][$e[1]] ?? $e[1]),
                    $raw,
                );
                // Une police de base n'écrit jamais d'octet nul : un texte qui en ouvre un est en UTF-16BE.
                $unicode = strlen($bytes) % 2 === 0 && str_starts_with($bytes, "\x00");
                $runs[] = [
                    'x' => (float) $x,
                    'y' => (float) $y,
                    'text' => mb_convert_encoding($bytes, 'UTF-8', $unicode ? 'UTF-16BE' : 'Windows-1252'),
                ];
            }
        }

        return $runs;
    }
}
