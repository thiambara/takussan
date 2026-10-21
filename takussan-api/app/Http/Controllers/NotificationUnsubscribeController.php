<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Base\Controller;
use App\Models\Enums\EmailFrequency;
use App\Models\User;
use App\Support\RelativeSignedUrl;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;

/**
 * TCK-103 — le désabonnement du résumé par courriel, sans session.
 *
 * P97.06 (TCK-1183) — sur le modèle des alertes de recherche (ADR-0050) : le lien visible du
 * courriel ouvre une page du front à un bouton, qui appelle {@see confirm()} en `POST` ; le client
 * de messagerie appelle la même URL seul, annoncée par `List-Unsubscribe` et
 * `List-Unsubscribe-Post` (RFC 8058). **Un GET ne désinscrit jamais** : un analyseur de liens qui
 * ouvre l'URL avant le destinataire coupait le résumé sans geste de sa part.
 *
 * L'URL est signée en RELATIF (TCK-1059) et expire après {@see LINK_DAYS} jours, la durée
 * qu'ADR-0050 retient pour l'alerte d'un compte.
 */
class NotificationUnsubscribeController extends Controller
{
    /** Durée de validité du lien, celle du désabonnement d'une alerte de compte (ADR-0050). */
    public const LINK_DAYS = 60;

    /** Langues des pages publiques du front (ADR-0026). */
    private const PUBLIC_LOCALES = ['fr', 'en', 'wo'];

    /**
     * Les deux liens d'un résumé : la page du front (lien visible) et le `POST` de l'API (en-tête
     * `List-Unsubscribe`).
     *
     * @return array{page: string, one_click: string}
     */
    public static function links(User $user): array
    {
        $oneClick = RelativeSignedUrl::temporary(
            'notifications.digest.unsubscribe',
            now()->addDays(self::LINK_DAYS),
            ['user' => $user->id],
        );
        $query = (string) parse_url($oneClick, PHP_URL_QUERY);
        $locale = in_array($user->preferredLocale(), self::PUBLIC_LOCALES, true)
            ? $user->preferredLocale()
            : self::PUBLIC_LOCALES[0];
        $front = rtrim((string) (config('app.frontend_url') ?: config('app.url')), '/');

        return [
            'page' => $front.'/'.$locale.'/notifications/unsubscribe?user='.$user->id.'&'.$query,
            'one_click' => $oneClick,
        ];
    }

    /**
     * Les liens envoyés avant TCK-1183 (`GET`, signés sans échéance) : ils n'écrivent plus rien et
     * mènent à la page de confirmation, munis d'un lien neuf. La signature d'origine reste exigée
     * par la route, sans quoi n'importe qui obtiendrait le lien de n'importe quel compte.
     */
    public function __invoke(User $user): RedirectResponse
    {
        return redirect(self::links($user)['page']);
    }

    public function confirm(User $user): JsonResponse
    {
        $user->update(['email_frequency' => EmailFrequency::Off]);

        return $this->json(['data' => ['email_frequency' => EmailFrequency::Off->value]]);
    }
}
