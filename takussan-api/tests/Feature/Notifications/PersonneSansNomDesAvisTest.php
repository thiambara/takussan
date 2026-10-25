<?php

namespace Tests\Feature\Notifications;

use App\Domain\Notifications\NotificationCode;
use App\Services\Notifications\NotificationRenderer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * P235.03 (TCK-2369) — le locataire d'un avis au bailleur et le bénéficiaire d'un avis au délégant
 * sont des paramètres de PERSONNE (`PARAM_PERSON`) : sans nom (compte ou fiche créés par
 * téléphone), ils se rendent par un libellé traduit, jamais par « — » ni par le numéro masqué.
 */
class PersonneSansNomDesAvisTest extends TestCase
{
    use RefreshDatabase;

    private const MONTANT = ['amount' => '150000.00', 'currency' => 'XOF'];

    /** @return array<string, array{NotificationCode, array<string, mixed>, string, string, string}> */
    public static function cas(): array
    {
        return [
            'loyer reçu fr' => [NotificationCode::LeasePaymentReceivedLandlord, ['amount' => self::MONTANT, 'property' => 'Villa Almadies', 'tenant' => ''], 'fr', 'body',
                '(sans nom) a payé '],
            'loyer reçu en' => [NotificationCode::LeasePaymentReceivedLandlord, ['amount' => self::MONTANT, 'property' => 'Villa Almadies', 'tenant' => ' '], 'en', 'body',
                '(unnamed) paid'],
            'loyer en retard fr' => [NotificationCode::LeasePaymentOverdueLandlord, ['amount' => self::MONTANT, 'days' => 3, 'property' => 'Villa', 'tenant' => null], 'fr', 'sms',
                'de (sans nom) (Villa)'],
            'loyer remboursé fr' => [NotificationCode::LeasePaymentRefundedLandlord, ['amount' => self::MONTANT, 'property' => 'Villa', 'tenant' => ''], 'fr', 'body',
                'payé par (sans nom) pour Villa'],
            'délégation active fr' => [NotificationCode::RoleDelegationActivatedDelegator, ['role' => 'agent', 'beneficiary' => ''], 'fr', 'body',
                'La délégation à (sans nom) pour le rôle'],
            'délégation expirée fr' => [NotificationCode::RoleDelegationExpiredDelegator, ['role' => 'agent', 'beneficiary' => ''], 'fr', 'sms',
                'à (sans nom) expirée.'],
            'délégation révoquée en' => [NotificationCode::RoleDelegationRevokedDelegator, ['role' => 'agent', 'beneficiary' => ''], 'en', 'sms',
                'of (unnamed) revoked.'],
        ];
    }

    /** @param  array<string, mixed>  $params */
    #[DataProvider('cas')]
    public function test_une_personne_sans_nom_se_rend_par_le_libelle_traduit(NotificationCode $code, array $params, string $locale, string $surface, string $attendu): void
    {
        $rendu = app(NotificationRenderer::class)->render($code, $params, $locale, null, $surface);

        $this->assertStringContainsString($attendu, $rendu);
        $this->assertStringNotContainsString('—', $rendu);
    }

    public function test_un_nom_present_reste_tel_quel(): void
    {
        $rendu = app(NotificationRenderer::class)->render(
            NotificationCode::LeasePaymentReceivedLandlord,
            ['amount' => self::MONTANT, 'property' => 'Villa Almadies', 'tenant' => 'Awa Diop'],
            'fr',
        );

        $this->assertStringStartsWith('Awa Diop a payé ', $rendu);
        $this->assertStringEndsWith(' pour Villa Almadies.', $rendu);
    }

    public function test_les_parametres_de_personne_sont_declares_tels(): void
    {
        foreach ([
            NotificationCode::LeasePaymentOverdueLandlord, NotificationCode::LeasePaymentReceivedLandlord,
            NotificationCode::LeasePaymentRefundedLandlord,
        ] as $code) {
            $this->assertSame(NotificationCode::PARAM_PERSON, $code->params()['tenant'], $code->value);
        }
        foreach ([
            NotificationCode::RoleDelegationActivatedDelegator, NotificationCode::RoleDelegationExpiredDelegator,
            NotificationCode::RoleDelegationRevokedDelegator,
        ] as $code) {
            $this->assertSame(NotificationCode::PARAM_PERSON, $code->params()['beneficiary'], $code->value);
        }
    }
}
