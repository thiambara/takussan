<?php

namespace Tests\Feature\Api\Accounting;

use App\Models\Agency;
use App\Models\BankStatement;
use App\Models\Enums\BankStatementStatus;
use App\Models\Enums\Currency;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Testing\TestResponse;
use Tests\ApiTestCase;
use Tests\Support\RemoteDiskFake;

/**
 * P157.05 (TCK-1445) — l'OFX 2 (XML) s'importe comme l'OFX 1 : `finfo` lit `text/xml` dans son
 * contenu, et la règle `mimes:csv,txt,ofx` le refusait en 422, alors que le pilote le lit (son
 * docblock l'annonce) et que le front propose `ofx` pour tout `.ofx`. `xml` est admis pour le seul
 * format `ofx`. Les fichiers sont RÉELS : `UploadedFile::fake()` déduit le type du nom, et ne
 * mesure donc pas cette règle.
 */
class OfxDeuxAImportTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        RemoteDiskFake::install('r2-private');
        $this->agency = Agency::factory()->create(['currency' => Currency::XOF]);
        $this->admin = User::factory()->create(['agency_id' => $this->agency->id]);
        $this->agency->update(['primary_admin_id' => $this->admin->id]);
    }

    private const TRANSACTIONS = '<BANKTRANLIST>'
        .'<STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20261001</DTPOSTED><TRNAMT>150000</TRNAMT><FITID>B1</FITID><NAME>LOYER SEPTEMBRE</NAME></STMTTRN>'
        .'<STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20261002</DTPOSTED><TRNAMT>75000</TRNAMT><FITID>B2</FITID><NAME>LOYER OCTOBRE</NAME></STMTTRN>'
        .'</BANKTRANLIST>';

    private function ofx2(): string
    {
        return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
            ."<?OFX OFXHEADER=\"200\" VERSION=\"211\" SECURITY=\"NONE\" OLDFILEUID=\"NONE\" NEWFILEUID=\"NONE\"?>\n"
            .'<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>XOF</CURDEF>'.self::TRANSACTIONS
            ."</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>\n";
    }

    private function ofx1(): string
    {
        return "OFXHEADER:100\r\nDATA:OFXSGML\r\nVERSION:102\r\nSECURITY:NONE\r\nENCODING:USASCII\r\nCHARSET:1252\r\n"
            ."COMPRESSION:NONE\r\nOLDFILEUID:NONE\r\nNEWFILEUID:NONE\r\n\r\n"
            .'<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>XOF'.self::TRANSACTIONS
            ."</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>\r\n";
    }

    private function deposer(string $contenu, string $nom, string $format): TestResponse
    {
        $chemin = tempnam(sys_get_temp_dir(), 'ofx');
        file_put_contents($chemin, $contenu);
        $this->beforeApplicationDestroyed(fn () => @unlink($chemin));

        return $this->actingAs($this->admin)
            ->postJson("/api/agencies/{$this->agency->id}/bank-statements", [
                'file' => new UploadedFile($chemin, $nom, null, null, true),
                'source_format' => $format,
            ]);
    }

    public function test_un_ofx_2_xml_s_importe_et_se_lit(): void
    {
        $id = $this->deposer($this->ofx2(), 'releve.ofx', 'ofx')->assertStatus(202)->json('data.id');

        $releve = BankStatement::findOrFail($id);
        $this->assertSame(BankStatementStatus::ReadyForReview, $releve->status);
        $this->assertSame(['LOYER SEPTEMBRE', 'LOYER OCTOBRE'], $releve->lines()->orderBy('id')->pluck('label')->all());
    }

    public function test_un_ofx_1_sgml_s_importe_toujours(): void
    {
        $this->deposer($this->ofx1(), 'releve.ofx', 'ofx')->assertStatus(202);
    }

    public function test_un_xml_annonce_en_csv_reste_refuse(): void
    {
        $this->deposer($this->ofx2(), 'releve.csv', 'csv')
            ->assertStatus(422)
            ->assertJsonValidationErrors('file');
    }
}
