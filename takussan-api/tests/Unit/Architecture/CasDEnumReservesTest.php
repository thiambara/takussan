<?php

namespace Tests\Unit\Architecture;

use App\Models\BankStatement;
use App\Models\Enums\BankStatementStatus;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\PayoutStatus;
use App\Models\Enums\RelationshipStatus;
use App\Models\Enums\ServiceProviderBillStatus;
use PHPUnit\Framework\TestCase;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use ReflectionEnumBackedCase;
use UnitEnum;

/**
 * TCK-1307 (P115.07, décision du porteur) — des cas d'enum qu'aucun chemin de `app/` ne pose sont
 * gardés, mais DÉCLARÉS réservés dans leur docblock : sans cette marque, un écran ou une garde qui
 * les lit laisse croire qu'ils arrivent. Le jour où un chemin les écrit, la réserve se lève, et ce
 * test le rappelle.
 */
class CasDEnumReservesTest extends TestCase
{
    /** @return list<UnitEnum> */
    private static function reserves(): array
    {
        return [
            ConversationStatus::Archived,
            ConversationStatus::Closed,
            BankStatementStatus::Archived,
            PayoutStatus::Processing,
            ServiceProviderBillStatus::Cancelled,
            RelationshipStatus::Ended,
            RelationshipStatus::Suspended,
        ];
    }

    public function test_chaque_cas_reserve_le_dit_dans_son_docblock(): void
    {
        $muets = [];
        foreach (self::reserves() as $cas) {
            $doc = (string) (new ReflectionEnumBackedCase($cas::class, $cas->name))->getDocComment();
            if (! str_contains($doc, 'Réservé')) {
                $muets[] = $this->nom($cas);
            }
        }

        $this->assertSame([], $muets, 'Cas sans écrivain non déclarés réservés.');
    }

    public function test_aucun_chemin_de_app_n_ecrit_un_cas_reserve(): void
    {
        $racine = dirname(__DIR__, 3).'/app';
        $ecrits = [];

        $fichiers = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($racine, RecursiveDirectoryIterator::SKIP_DOTS));
        foreach ($fichiers as $fichier) {
            if ($fichier->getExtension() !== 'php' || str_contains($fichier->getPathname(), '/Models/Enums/')) {
                continue;
            }
            $source = (string) file_get_contents($fichier->getPathname());
            foreach (self::reserves() as $cas) {
                // Une écriture : `'status' => X::Cas` ou `->status = X::Cas`. Une lecture (`in_array`,
                // `where`, une liste) ne lève pas la réserve.
                $motif = '/(=>|[^=!<>]=)\s*'.preg_quote($this->nom($cas), '/').'\b/';
                if (preg_match($motif, $source) === 1) {
                    $ecrits[] = $this->nom($cas).' dans '.substr($fichier->getPathname(), strlen($racine) + 1);
                }
            }
        }

        $this->assertSame([], $ecrits, 'Un cas réservé a désormais un écrivain : levez sa réserve (docblock et liste de ce test).');
    }

    public function test_le_scope_open_de_bank_statement_est_retire(): void
    {
        // Sans appelant, et en désaccord avec `BankStatementStatus::isClosed()` : il rangeait
        // `failed` parmi les relevés ouverts.
        $this->assertFalse(method_exists(BankStatement::class, 'scopeOpen'));
    }

    private function nom(UnitEnum $cas): string
    {
        return (new \ReflectionClass($cas))->getShortName().'::'.$cas->name;
    }
}
