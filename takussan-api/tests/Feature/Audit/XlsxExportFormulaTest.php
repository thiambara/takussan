<?php

namespace Tests\Feature\Audit;

use App\Jobs\Audit\ExportActivityLogJob;
use App\Models\Agency;
use App\Models\Property;
use App\Services\Audit\ActivityLogExporter;
use App\Services\Export\ExportWriter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use PhpOffice\PhpSpreadsheet\Cell\DataType;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;
use Tests\ApiTestCase;

/**
 * TCK-601 (verif-601 n2) — les deux écrivains XLSX neutralisent une formule comme les CSV : la
 * cellule `=…` sort en type chaîne (`s`, jamais `f`), un nombre reste un nombre.
 */
class XlsxExportFormulaTest extends ApiTestCase
{
    use RefreshDatabase;

    private const FORMULE = '=HYPERLINK("http://n2.invalid","x")';

    private function sheet(string $path): Worksheet
    {
        return IOFactory::load($path)->getActiveSheet();
    }

    public function test_l_export_xlsx_ne_rend_pas_de_formule(): void
    {
        $response = app(ExportWriter::class)->xlsx([
            'filename' => 'temoin',
            'columns' => ['nom', 'montant', 'montant_texte'],
            'rows' => [['nom' => self::FORMULE, 'montant' => -1500, 'montant_texte' => '-1500']],
        ]);

        $sheet = $this->sheet($response->getFile()->getPathname());

        $this->assertSame(DataType::TYPE_STRING, $sheet->getCell('A2')->getDataType());
        $this->assertSame("'".self::FORMULE, $sheet->getCell('A2')->getValue());
        $this->assertSame(DataType::TYPE_NUMERIC, $sheet->getCell('B2')->getDataType());
        $this->assertSame(DataType::TYPE_NUMERIC, $sheet->getCell('C2')->getDataType());
        $this->assertEquals(-1500, $sheet->getCell('C2')->getValue());
    }

    public function test_le_job_d_export_xlsx_ne_rend_pas_de_formule(): void
    {
        $agency = Agency::factory()->create();
        activity()->performedOn(Property::factory()->create(['agency_id' => $agency->id]))->event('updated')->log(self::FORMULE);
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        Storage::fake();
        Notification::fake();
        (new ExportActivityLogJob($admin, ['format' => 'xlsx'], $agency->id))->handle(app(ActivityLogExporter::class));

        $sheet = $this->sheet(Storage::path(Storage::files('exports/audit')[0]));
        $cells = [];
        foreach ($sheet->getRowIterator(2) as $row) {
            foreach ($row->getCellIterator() as $cell) {
                if (str_contains((string) $cell->getValue(), 'HYPERLINK')) {
                    $cells[] = $cell;
                }
            }
        }

        $this->assertNotEmpty($cells, 'la formule témoin est absente de l\'export');
        foreach ($cells as $cell) {
            $this->assertSame(DataType::TYPE_STRING, $cell->getDataType(), $cell->getCoordinate().' est une formule');
        }
    }
}
