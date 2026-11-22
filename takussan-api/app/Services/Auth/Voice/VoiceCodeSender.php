<?php

namespace App\Services\Auth\Voice;

use App\Services\Auth\PhoneVerificationService;

/**
 * TCK-2940 (ADR-0126) — dicter un code à usage unique par un appel automatique.
 *
 * Le pilote ne décide rien : ni bornes, ni délai, ni stockage ({@see PhoneVerificationService::callCodeTo()}).
 * Il reçoit le numéro et le code, et rien d'autre (ADR-0126 § 5).
 */
interface VoiceCodeSender
{
    /** La voie existe-t-elle ? Faux sans pilote, ou sans l'une de ses clés : l'option « par appel » n'est pas proposée. */
    public function available(): bool;

    /** `false` si le fournisseur n'a pas accepté l'appel. Ne lève jamais pour une erreur du fournisseur. */
    public function call(string $phone, string $code, ?string $locale): bool;
}
