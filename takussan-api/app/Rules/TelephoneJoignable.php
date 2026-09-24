<?php

namespace App\Rules;

use App\Services\Notifications\Sms\PhoneNumber;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Un numéro qu'un SMS peut joindre — ce que le profil ENREGISTRE, et ce que `send-otp` relit.
 *
 * TCK-574 : `+330612345678` a la forme E.164, et aucun réseau ne l'achemine — le `0` de préfixe
 * national n'a rien à faire derrière l'indicatif. `send-otp` le refusait, mais le profil
 * (`UpdateProfileRequest`, `UpdateMeRequest`) l'enregistrait : on émettait ensuite un code vers
 * un numéro injoignable. Les trois requêtes jugent désormais par les mêmes règles.
 *
 * La chaîne vide passe : les deux requêtes de profil la lisent comme « effacer le numéro ».
 */
class TelephoneJoignable implements ValidationRule
{
    /**
     * La clé du message qui dit pourquoi aucun SMS ne peut joindre ce numéro, ou `null` s'il est
     * joignable. Un numéro sénégalais compte exactement 9 chiffres après `+221`.
     */
    public static function defaut(string $numero): ?string
    {
        if (preg_match(PhoneNumber::E164_REGEX, $numero) !== 1 || preg_match('/^\+221(?!\d{9}$)/', $numero) === 1) {
            return 'validation.rules.phone_e164';
        }

        return PhoneNumber::hasNationalTrunkPrefix($numero) ? 'validation.rules.phone_trunk_prefix' : null;
    }

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value) || $value === '') {
            return;
        }

        $cle = self::defaut($value);
        if ($cle !== null) {
            $fail(__($cle));
        }
    }
}
