<?php

namespace Tests\Unit\Support\Audit;

use App\Support\Audit\PropertyRedactor;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * TCK-601 (ADR-0044 §2, verif-601 n1) — les clés en camelCase et une charge JSON en chaîne sont
 * expurgées ; la casse différente, l'imbrication et les listes le restent.
 */
class PropertyRedactorTest extends TestCase
{
    private const R = PropertyRedactor::REDACTED;

    /** @return array<string, array{string}> */
    public static function clesSensibles(): array
    {
        return [
            'ownerRib' => ['ownerRib'],
            'ribPro' => ['ribPro'],
            'taxId' => ['taxId'],
            'bankIban' => ['bankIban'],
            'idDocumentNumber' => ['idDocumentNumber'],
            'twoFactorSecret' => ['twoFactorSecret'],
            'RIB' => ['RIB'],
            'Tax_ID' => ['Tax_ID'],
            'owner_rib' => ['owner_rib'],
        ];
    }

    #[DataProvider('clesSensibles')]
    public function test_une_cle_sensible_est_expurgee(string $key): void
    {
        $this->assertSame([$key => self::R], PropertyRedactor::redact([$key => 'TEMOIN']));
    }

    public function test_un_segment_dans_un_mot_n_est_pas_une_cle_sensible(): void
    {
        $properties = ['attributes' => ['title' => 'x'], 'distribution' => 'y', 'tribuneId' => 'z'];

        $this->assertSame($properties, PropertyRedactor::redact($properties));
    }

    public function test_l_imbrication_et_les_listes_sont_parcourues(): void
    {
        $redacted = PropertyRedactor::redact([
            'nested' => ['deep' => ['iban' => 'TEMOIN']],
            'list' => [['rib' => 'TEMOIN'], ['ownerRib' => 'TEMOIN']],
            'rib' => ['old' => 'TEMOIN', 'new' => 'TEMOIN'],
        ]);

        $this->assertSame([
            'nested' => ['deep' => ['iban' => self::R]],
            'list' => [['rib' => self::R], ['ownerRib' => self::R]],
            'rib' => self::R,
        ], $redacted);
    }

    public function test_une_charge_json_en_chaine_est_expurgee_et_reencodee(): void
    {
        $redacted = PropertyRedactor::redact([
            'payload' => '{"rib":"SNJSON","ninea":"NINEAJSON","nom":"Awa Diop","items":[{"taxId":"TAXJSON"}]}',
            'list' => '[{"bankIban":"IBANJSON"}]',
        ]);

        $this->assertStringNotContainsString('JSON', json_encode($redacted));
        $this->assertSame(
            ['rib' => self::R, 'ninea' => self::R, 'nom' => 'Awa Diop', 'items' => [['taxId' => self::R]]],
            json_decode($redacted['payload'], true),
        );
        $this->assertSame([['bankIban' => self::R]], json_decode($redacted['list'], true));
    }

    public function test_une_chaine_qui_n_est_pas_du_json_reste_telle_quelle(): void
    {
        $properties = ['note' => '[brouillon] rib à vérifier', 'objet' => '{pas du json', 'vide' => ''];

        $this->assertSame($properties, PropertyRedactor::redact($properties));
    }
}
