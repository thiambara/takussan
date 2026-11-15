<?php

namespace Tests\Feature\Reviews;

use App\Support\ContactDetails;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-2672 — les coordonnées se détectent en PHP (une ligne rendue) ET en SQL (la file filtrée,
 * comptée, paginée) : chaque exemple passe par les deux moteurs, qui doivent rendre la même chose
 * que l'attendu. Un motif qui dirait vrai sous PCRE et faux sous PostgreSQL ferait mentir
 * `meta.risk_counts` sur la carte qu'il affiche.
 */
class ContactDetailsParityTest extends TestCase
{
    /** @return array<string, array{0: string, 1: bool}> */
    public static function exemples(): array
    {
        return [
            'mobile groupé' => ['Très bien, appelez-moi au 77 418 90 22 pour visiter', true],
            'mobile collé' => ['774189022', true],
            'mobile avec +221' => ['joignable au +221 76 123 45 67.', true],
            'mobile avec 00221 et points' => ['00221.70.123.45.67', true],
            'mobile avec tirets' => ['tel 78-555-12-34', true],
            'fixe' => ['Agence : 33 821 00 00', true],
            'e-mail' => ['écrivez à awa.diop@exemple.sn', true],
            'url' => ['voir https://exemple.com/annonce', true],
            'www' => ['www.keur-immo.sn', true],
            'domaine nu' => ['contact sur keurimmo.com merci', true],
            'prix en FCFA' => ['Loyer de 75 000 000 FCFA, trop cher', false],
            'prix de neuf chiffres en FCFA' => ['villa à 780 000 000 FCFA', false],
            'prix de neuf chiffres en F' => ['villa à 780 000 000 F', false],
            'prix en francs' => ['770000000 francs', false],
            'date' => ['visité le 12/11/2026 à 10:30', false],
            'référence' => ['réf. TK-7701234567', false],
            'huit chiffres' => ['77 418 90 2', false],
            'préfixe inconnu' => ['72 418 90 22', false],
            'texte ordinaire' => ['Appartement propre, quartier calme. Merci.', false],
            'point final collé' => ['Très bien.Je recommande', false],
            'arobase seule' => ['@awa super séjour', false],
        ];
    }

    #[DataProvider('exemples')]
    public function test_php_et_sql_disent_la_meme_chose(string $texte, bool $attendu): void
    {
        $this->assertSame($attendu, ContactDetails::found($texte), 'PHP');

        [$sql, $bindings] = ContactDetails::sql('?');
        $params = [];
        foreach ($bindings as $pattern) {
            array_push($params, $texte, $pattern);
        }
        $row = DB::selectOne("select {$sql} as trouve", $params);
        $this->assertSame($attendu, (bool) $row->trouve, 'SQL');
    }

    public function test_vide_ou_nul(): void
    {
        $this->assertFalse(ContactDetails::found(null));
        $this->assertFalse(ContactDetails::found('   '));
    }
}
