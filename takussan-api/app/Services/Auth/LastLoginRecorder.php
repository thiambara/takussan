<?php

namespace App\Services\Auth;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * TCK-2926 (ADR-0124 § 3) — la SEULE écriture de la dernière connexion, appelée par chaque voie qui ouvre une
 * session sur une preuve : mot de passe (`AuthController::login`), code SMS (`PhoneLoginService`), OAuth
 * (`OAuthSessionOpener`). Écrase la précédente : aucun historique.
 *
 * Ni l'IP ni la chaîne `User-Agent` ne sont écrites : la famille d'appareil ({@see FamilleDAppareil}) et la
 * ville seule ({@see LoginCityResolver}), lue en mémoire depuis l'IP.
 */
final class LastLoginRecorder
{
    private const LONGUEUR_VILLE = 120;

    public function __construct(private readonly LoginCityResolver $cities) {}

    public function record(User $user, ?Request $request = null): void
    {
        $request ??= request();
        $ip = $request->ip();
        $city = $ip === null ? null : $this->cities->cityFor($ip);
        $city = $city === null || trim($city) === '' ? null : Str::limit(trim($city), self::LONGUEUR_VILLE, '');

        $user->forceFill([
            'last_login_at' => now(),
            'last_login_device' => FamilleDAppareil::lire($request->userAgent()),
            'last_login_city' => $city,
        ])->save();
    }
}
