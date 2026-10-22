<?php

namespace Tests\Feature\Api\Accounting;

use App\Models\Agency;
use App\Models\BankStatement;
use App\Models\Enums\BankStatementStatus;
use App\Models\Enums\Currency;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\ApiTestCase;
use Tests\Support\RemoteDiskFake;

/**
 * P157.04 (TCK-1443) — un OFX qui n'est pas de l'UTF-8 se convertit selon le jeu de caractères qu'il
 * déclare (`CHARSET` en OFX 1.x, `encoding` de la déclaration XML en OFX 2), Windows-1252 à défaut.
 * Avant, un `NAME` accentué en Windows-1252 faisait échouer l'insertion (SQLSTATE 22021) : relevé
 * `failed`, et toutes ses transactions perdues. La validation dispense l'OFX du contrôle UTF-8
 * parce qu'il déclare son jeu de caractères (TCK-593, R6) : le pilote le lit désormais.
 */
class OfxJeuDeCaracteresTest extends ApiTestCase
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

    private function ofx1(string $charset, string $nom): string
    {
        return "OFXHEADER:100\r\nDATA:OFXSGML\r\nVERSION:102\r\nSECURITY:NONE\r\nENCODING:USASCII\r\nCHARSET:{$charset}\r\n"
            ."COMPRESSION:NONE\r\nOLDFILEUID:NONE\r\nNEWFILEUID:NONE\r\n\r\n"
            ."<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>XOF<BANKTRANLIST>\r\n"
            ."<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261001<TRNAMT>150000<FITID>A1<NAME>{$nom}</STMTTRN>\r\n"
            ."<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261002<TRNAMT>75000<FITID>A2<NAME>LOYER OCTOBRE</STMTTRN>\r\n"
            ."</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>\r\n";
    }

    private function deposer(string $contenu): BankStatement
    {
        // Un fichier RÉEL : la règle `mimes` juge le type que `finfo` lit dans le contenu, ce que
        // `UploadedFile::fake()` ne mesure pas (il le déduit du nom).
        $chemin = tempnam(sys_get_temp_dir(), 'ofx');
        file_put_contents($chemin, $contenu);
        $this->beforeApplicationDestroyed(fn () => @unlink($chemin));
        $reponse = $this->actingAs($this->admin)
            ->postJson("/api/agencies/{$this->agency->id}/bank-statements", [
                'file' => new UploadedFile($chemin, 'releve.ofx', null, null, true),
                'source_format' => 'ofx',
            ])
            ->assertStatus(202);

        return BankStatement::findOrFail($reponse->json('data.id'));
    }

    /** @return list<string> */
    private function libelles(BankStatement $releve): array
    {
        return $releve->lines()->orderBy('id')->pluck('label')->all();
    }

    public function test_un_ofx_en_charset_1252_est_lu_avec_ses_accents_et_toutes_ses_transactions(): void
    {
        $releve = $this->deposer($this->ofx1('1252', mb_convert_encoding('SOCIÉTÉ DIOP', 'Windows-1252', 'UTF-8')));

        $this->assertSame(BankStatementStatus::ReadyForReview, $releve->status);
        $this->assertSame(['SOCIÉTÉ DIOP', 'LOYER OCTOBRE'], $this->libelles($releve));
    }

    public function test_un_ofx_sans_charset_utilisable_et_non_utf8_est_lu_en_windows_1252(): void
    {
        // « œ » n'existe pas en ISO-8859-1 : seul Windows-1252 le rend juste (0x9C).
        $releve = $this->deposer($this->ofx1('NONE', mb_convert_encoding('CŒUR DE VILLE', 'Windows-1252', 'UTF-8')));

        $this->assertSame(['CŒUR DE VILLE', 'LOYER OCTOBRE'], $this->libelles($releve));
    }

    public function test_un_ofx_deja_en_utf8_n_est_pas_converti(): void
    {
        $releve = $this->deposer($this->ofx1('1252', 'SOCIÉTÉ DIOP'));

        $this->assertSame(['SOCIÉTÉ DIOP', 'LOYER OCTOBRE'], $this->libelles($releve));
    }
}
