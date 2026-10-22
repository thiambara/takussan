<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Base\Controller;
use App\Models\Enums\EmailFrequency;
use App\Models\User;
use App\Support\LienFront;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\URL;

/**
 * TCK-103 — se désabonner du résumé par courriel, sans session.
 *
 * P97.06 (TCK-1243) — aligné sur les alertes de recherche (ADR-0050) : le lien du courriel mène à
 * une page du front à UN bouton, qui rejoue en `POST` l'URL signée de l'API ; le client de
 * messagerie désabonne en un clic par ce même `POST` (`List-Unsubscribe`, RFC 8058). **Un `GET`
 * n'écrit jamais** : les analyseurs de liens des messageries ouvrent les URL d'un courriel avant
 * leur destinataire, et le résumé était coupé sans geste de lui.
 *
 * L'URL signée est RELATIVE (TCK-1059) et vaut {@see self::JOURS_DE_VALIDITE} jours, comme celle
 * des alertes. Les liens déjà envoyés, signés sans échéance sur la route `GET`, restent valides :
 * ils mènent à la page de confirmation, sans écrire.
 */
class NotificationUnsubscribeController extends Controller
{
    /** ADR-0050 — la durée du lien de désabonnement d'une alerte de compte, reprise ici. */
    public const JOURS_DE_VALIDITE = 60;

    /**
     * @return array{page: string, one_click: string} la page du front (lien visible) et l'URL de
     *                                                l'API (désabonnement en un clic)
     */
    public static function liens(User $user): array
    {
        $signee = URL::temporarySignedRoute(
            'notifications.digest.unsubscribe',
            now()->addDays(self::JOURS_DE_VALIDITE),
            ['user' => $user->getKey()],
            absolute: false,
        );
        $requete = (string) parse_url($signee, PHP_URL_QUERY);
        $front = LienFront::base();
        $langue = in_array($user->preferred_language, ['fr', 'en', 'wo'], true) ? $user->preferred_language : 'fr';

        return [
            'page' => $front.'/'.$langue.'/notifications/unsubscribe?user='.$user->getKey().'&'.$requete,
            'one_click' => URL::to($signee),
        ];
    }

    /**
     * Le lien d'un résumé déjà envoyé (`GET`, signé sans échéance) : mène à la page qui confirme,
     * sans rien écrire.
     */
    public function __invoke(User $user): RedirectResponse
    {
        return redirect(self::liens($user)['page']);
    }

    /** `POST` signé : la page du front, ou le client de messagerie (RFC 8058). Idempotent. */
    public function unsubscribe(User $user): JsonResponse
    {
        $user->update(['email_frequency' => EmailFrequency::Off]);

        return $this->json(['data' => ['email_frequency' => EmailFrequency::Off->value]]);
    }
}
