<?php

namespace App\Services\Auth;

use App\Http\Middleware\ExposeOtpPreview;

/**
 * TCK-620 (ADR-0060) — hors production, le code envoyé par SMS revient aussi dans la réponse de la
 * requête qui l'a émis, pour qu'on puisse vérifier un numéro sans fournisseur SMS.
 *
 * SCOPED : un code par requête, que les émetteurs déposent ({@see record()}) et que
 * {@see ExposeOtpPreview} ajoute à la réponse JSON sous `otp_preview`.
 *
 * Deux verrous, qui doivent tenir ENSEMBLE : le drapeau `auth.otp_preview.enabled`
 * (`OTP_PREVIEW_ENABLED`, faux par défaut) et un `APP_ENV` de la liste d'autorisation, jugé à
 * l'exécution. Le drapeau recopié par erreur dans l'onglet de production ne rend donc aucun code.
 */
class OtpPreview
{
    /** Liste d'AUTORISATION, pas d'exclusion de `production` : un environnement mal nommé reste fermé. */
    public const ENVIRONMENTS = ['local', 'staging', 'testing'];

    private ?string $code = null;

    public static function enabled(): bool
    {
        return (bool) config('auth.otp_preview.enabled')
            && app()->environment(self::ENVIRONMENTS);
    }

    /** Retient le code émis par cette requête. Sans effet si l'aperçu est fermé. */
    public function record(string $code): void
    {
        if (self::enabled()) {
            $this->code = $code;
        }
    }

    /**
     * Rend le code retenu et l'OUBLIE : une réponse le porte au plus une fois. Sans cela, l'instance
     * qui survit d'une requête à l'autre (tests, travailleur persistant) le resservirait à la suivante.
     */
    public function pull(): ?string
    {
        $code = $this->code;
        $this->code = null;

        return self::enabled() ? $code : null;
    }
}
