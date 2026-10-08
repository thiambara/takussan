<?php

namespace App\Services\Privacy;

use App\Models\User;
use App\Support\ImpersonationContext;
use Illuminate\Database\Eloquent\Model;
use Spatie\Activitylog\Models\Activity;

/**
 * TCK-601 (ADR-0044 §4) — la trace d'une CONSULTATION de données personnelles.
 *
 * Une lecture n'écrit rien d'elle-même : sans cet appel, ouvrir le détail d'un utilisateur, un
 * dossier KYC ou le RIB complet d'un bailleur ne laissait aucune trace. Chaque surface qui rend une
 * donnée personnelle à un tiers appelle {@see self::record()} APRÈS ses gardes — un refus n'est pas
 * une consultation.
 *
 * Au plus une entrée par (lecteur, sujet, surface) par fenêtre de {@see self::WINDOW_MINUTES}
 * minutes : un rafraîchissement n'est pas une seconde consultation, et un journal noyé ne se lit
 * plus. TCK-600 (verif-600 G) — l'opérateur d'une impersonation est un lecteur DISTINCT de sa
 * cible : le `causer` est la cible (le jeton est le sien), et `impersonator_id` seul les sépare.
 * Sans lui dans la clé, une consultation de la cible avalait celle de l'opérateur, et l'inverse. Journal `PersonalDataAccess`, conservé cinq ans (TCK-537 doit l'exempter de la purge).
 */
class PersonalDataAccessLogger
{
    public const LOG_NAME = 'PersonalDataAccess';

    public const EVENT = 'personal_data_viewed';

    public const WINDOW_MINUTES = 15;

    public const SURFACE_USER_DETAIL = 'user_detail';

    public const SURFACE_USER_SESSIONS = 'user_sessions';

    public const SURFACE_USER_ACTIVITY = 'user_activity';

    public const SURFACE_KYC_DOSSIER = 'kyc_dossier';

    public const SURFACE_KYC_DOCUMENT = 'kyc_document';

    public const SURFACE_OWNER_SENSITIVE = 'owner_sensitive';

    public const SURFACE_AGENCY_UPGRADE_REQUEST = 'agency_upgrade_request';

    /** Réservée à TCK-600 : la recherche globale de la console trace ce qu'elle rend. */
    public const SURFACE_GLOBAL_SEARCH = 'global_search';

    public function record(User $viewer, Model $subject, string $surface): void
    {
        $operateur = app(ImpersonationContext::class)->impersonatorId();

        $alreadyLogged = Activity::query()
            ->where('log_name', self::LOG_NAME)
            ->where('event', self::EVENT)
            ->where('causer_type', $viewer->getMorphClass())
            ->where('causer_id', $viewer->getKey())
            ->where('subject_type', $subject->getMorphClass())
            ->where('subject_id', $subject->getKey())
            ->where('properties->surface', $surface)
            ->when(
                $operateur === null,
                fn ($q) => $q->whereNull('impersonator_id'),
                fn ($q) => $q->where('impersonator_id', $operateur),
            )
            ->where('created_at', '>=', now()->subMinutes(self::WINDOW_MINUTES))
            ->exists();

        if ($alreadyLogged) {
            return;
        }

        activity(self::LOG_NAME)
            ->causedBy($viewer)
            ->performedOn($subject)
            ->withProperties(['surface' => $surface])
            ->event(self::EVENT)
            ->log(self::EVENT);
    }
}
