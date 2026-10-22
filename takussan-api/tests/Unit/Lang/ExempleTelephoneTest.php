<?php

namespace Tests\Unit\Lang;

use App\Rules\TelephoneJoignable;
use App\Services\Notifications\Sms\PhoneNumber;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * TCK-1449 (P159.03) — l'exemple que cite `validation.rules.phone_e164` passe les règles qui
 * affichent ce message. Il citait `+221 77 123 45 67`, que chacune refuse : l'utilisateur qui
 * recopiait l'exemple recevait le même message.
 *
 * Le `wo` n'est pas lu : le wolof est en pause (2026-10-16), son texte ne se réécrit pas.
 */
class ExempleTelephoneTest extends TestCase
{
    /** Les regex des cinq requêtes qui rendent ce message sur leur échec `regex`. */
    private const REGLES = [
        'UpdateProfileRequest, UpdateMeRequest' => '/^(?:\+[1-9]\d{6,14})?$/',
        'SecondaryPhoneRequest, ReplacePropertyContactsRequest' => '/^\+[1-9]\d{6,14}$/',
        'ResendPhoneVerificationRequest' => PhoneNumber::E164_REGEX,
    ];

    /** @return array<string, array{string}> */
    public static function langues(): array
    {
        return ['fr' => ['fr'], 'en' => ['en']];
    }

    #[DataProvider('langues')]
    public function test_l_exemple_du_message_passe_les_regles_qui_l_affichent(string $langue): void
    {
        $messages = require dirname(__DIR__, 3)."/lang/{$langue}/validation.php";
        $message = $messages['rules']['phone_e164'];

        $this->assertSame(1, preg_match('/\+[\d ]*\d/', $message, $trouve), "aucun exemple dans « {$message} »");
        $exemple = $trouve[0];

        foreach (self::REGLES as $requetes => $regex) {
            $this->assertSame(1, preg_match($regex, $exemple), "« {$exemple} » échoue à la regex de {$requetes}");
        }
        $this->assertNull(TelephoneJoignable::defaut($exemple), "« {$exemple} » n'est pas joignable");
    }
}
