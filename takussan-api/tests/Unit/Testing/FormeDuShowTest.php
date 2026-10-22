<?php

namespace Tests\Unit\Testing;

use PHPUnit\Framework\AssertionFailedError;
use PHPUnit\Framework\TestCase;
use Tests\Support\FormeDuShow;

/**
 * ADR-0071 (TCK-1509) — l'assertion partagée compare la forme, type JSON compris, et échoue sur
 * un écart admis qui n'en est plus un.
 */
class FormeDuShowTest extends TestCase
{
    use FormeDuShow;

    public function test_meme_forme_avec_d_autres_valeurs_passe(): void
    {
        $this->assertEcritureALaFormeDuShow(
            ['id' => 1, 'status' => 'pending', 'items' => [['a' => 1]]],
            ['id' => 2, 'status' => 'confirmed', 'items' => [['a' => 5], ['a' => 6]]],
        );
    }

    public function test_null_contre_une_chaine_est_un_ecart(): void
    {
        $this->assertSame(['masked'], self::ecartsDeForme(
            self::forme(['masked' => null]),
            self::forme(['masked' => '•••• 1111']),
        ));
    }

    public function test_un_chemin_qui_diverge_masque_ses_descendants(): void
    {
        $this->assertSame(['property', 'refund_status'], self::ecartsDeForme(
            self::forme(['id' => 1]),
            self::forme(['id' => 1, 'refund_status' => null, 'property' => ['id' => 3, 'location' => ['city' => 'Dakar']]]),
        ));
    }

    public function test_un_ecart_non_admis_echoue(): void
    {
        $this->expectException(AssertionFailedError::class);

        $this->assertEcritureALaFormeDuShow(['id' => 1], ['id' => 1, 'can_refund' => true]);
    }

    public function test_un_ecart_admis_qui_ne_diverge_plus_echoue(): void
    {
        $this->expectException(AssertionFailedError::class);
        $this->expectExceptionMessage('retirer l\'entrée');

        $this->assertEcritureALaFormeDuShow(['id' => 1, 'can_refund' => true], ['id' => 1, 'can_refund' => false], ['can_refund']);
    }

    public function test_un_ecart_admis_qui_diverge_passe(): void
    {
        $this->assertEcritureALaFormeDuShow(['id' => 1], ['id' => 1, 'can_refund' => true], ['can_refund']);
    }
}
