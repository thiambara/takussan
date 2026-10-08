<?php

namespace Tests\Support;

use App\Models\User;
use App\Services\Auth\PhoneVerificationService;
use App\Services\Notifications\Sms\SmsRouterDriver;
use PHPUnit\Framework\Assert;

/**
 * TCK-589 — émet un code de vérification du téléphone et le relit dans le SMS
 * reçu par {@see FakeSmsRouter}. `sendOtp()` ne rend plus le code, et aucun code
 * fixe n'est accepté : c'est la seule façon pour un test d'obtenir un code valide.
 */
trait ReadsPhoneCodes
{
    protected function fakeSms(): FakeSmsRouter
    {
        $bound = app(SmsRouterDriver::class);

        return $bound instanceof FakeSmsRouter ? $bound : FakeSmsRouter::install();
    }

    protected function issuePhoneCode(User $user): string
    {
        $sms = $this->fakeSms();
        Assert::assertTrue(app(PhoneVerificationService::class)->sendOtp($user), 'Le code n\'a pas été émis (délai de renvoi ?).');

        return $sms->lastCodeFor((string) $user->phone);
    }
}
