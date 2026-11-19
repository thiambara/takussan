<?php

namespace App\Services\Owners;

use App\Domain\Notifications\NotificationCode;
use App\Models\Agency;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\MessageRelay;
use App\Models\NotificationPreference;
use App\Models\OwnerWeeklyDigest;
use App\Models\User;
use App\Notifications\OwnerWeeklyDigestNotification;
use App\Services\Notifications\NotificationRenderer;
use App\Services\Notifications\PreferenceResolver;
use App\Services\Pont\EtatDAccord;
use App\Services\Pont\RegistreDesCanaux;
use App\Services\Pont\RoutageEntrant;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2985 (ADR-0132 § 6) — le résumé du lundi du bailleur.
 *
 * - **Destinataires** : un couple (bailleur, agence) par bien d'agence non supprimé dont le compte est le bailleur
 *   au sens de `BailleurDuBien::est` (désigné par `properties.user_id` ET un profil propriétaire dans l'agence),
 *   profil ACTIF ; et seulement si le compte a allumé l'événement ({@see PreferenceResolver::active()}, jamais la
 *   case `inapp`). Un résumé par couple : un bailleur de deux agences en reçoit deux, chacun sans l'autre.
 * - **La semaine** : la semaine ISO écoulée, lundi 00:00 → lundi suivant 00:00 exclu, heure de Dakar.
 * - **Le contenu** : des nombres et des totaux sur les SEULS biens du couple, rien de nominatif d'un locataire.
 * - **Idempotence** : `owner_weekly_digests` (unique par bailleur, agence, semaine), réservé AVANT l'envoi.
 * - **Canal** : le gabarit par le pilote du pont ({@see self::parLePont()}), sinon l'e-mail
 *   ({@see OwnerWeeklyDigestNotification}, canal `mail` seul) ; jamais de SMS, jamais la cloche.
 */
final class ResumeDuLundi
{
    public const TIMEZONE = 'Africa/Dakar';

    public function __construct(
        private readonly PreferenceResolver $preferences,
        private readonly RegistreDesCanaux $registre,
        private readonly NotificationRenderer $renderer,
    ) {}

    /** Le lundi 00:00 (heure de Dakar) de la semaine écoulée, à l'instant donné. */
    public static function debutDeLaSemaineEcoulee(?CarbonImmutable $maintenant = null): CarbonImmutable
    {
        return ($maintenant ?? CarbonImmutable::now())->setTimezone(self::TIMEZONE)->startOfWeek(CarbonImmutable::MONDAY)->subWeek();
    }

    /** @return int combien de résumés sont partis */
    public function envoyer(?CarbonImmutable $maintenant = null): int
    {
        $debut = self::debutDeLaSemaineEcoulee($maintenant);
        $fin = $debut->addWeek();
        $semaine = $debut->format('o-\WW');

        $envoyes = 0;
        foreach ($this->destinataires() as [$userId, $agencyId, $biens]) {
            $user = User::query()->find($userId);
            $agence = Agency::query()->find($agencyId);
            if ($user === null || $agence === null) {
                continue;
            }

            // La réservation de la semaine : une seconde exécution n'envoie rien de plus. `insertOrIgnore`, jamais un
            // `try/catch` : sous PostgreSQL, une violation abandonne la transaction entière.
            $reserve = DB::table('owner_weekly_digests')->insertOrIgnore([
                'user_id' => $userId, 'agency_id' => $agencyId, 'week' => $semaine, 'created_at' => now(), 'updated_at' => now(),
            ]);
            if ($reserve === 0) {
                continue;
            }
            $trace = OwnerWeeklyDigest::query()->where(['user_id' => $userId, 'agency_id' => $agencyId, 'week' => $semaine])->firstOrFail();

            $params = $this->contenu($biens, $debut, $fin) + ['agency' => (string) $agence->name];
            $canal = $this->parLePont($user, $agence, $params) ?? $this->parEmail($user, $params);
            $trace->forceFill(['channel' => $canal, 'sent_at' => $canal === null ? null : now()])->save();
            $envoyes += $canal === null ? 0 : 1;
        }

        return $envoyes;
    }

    /**
     * Les couples (bailleur, agence, biens) qui reçoivent le résumé, en requêtes groupées.
     *
     * @return list<array{0: int, 1: int, 2: list<int>}>
     */
    public function destinataires(): array
    {
        $lignes = DB::table('properties')
            ->join('owner_profiles', fn ($j) => $j
                ->on('owner_profiles.user_id', '=', 'properties.user_id')
                ->on('owner_profiles.agency_id', '=', 'properties.agency_id'))
            ->whereNull('properties.deleted_at')
            ->whereNotNull('properties.agency_id')
            ->where('owner_profiles.status', OwnerProfileStatus::Active->value)
            ->orderBy('properties.user_id')->orderBy('properties.agency_id')->orderBy('properties.id')
            ->get(['properties.id', 'properties.user_id', 'properties.agency_id']);
        if ($lignes->isEmpty()) {
            return [];
        }

        // L'activation, en une requête : une case e-mail ou WhatsApp allumée (le défaut est éteint).
        $allumes = NotificationPreference::query()
            ->whereIn('user_id', $lignes->pluck('user_id')->unique()->values())
            ->where('event_type', PreferenceResolver::OWNER_WEEKLY_DIGEST)
            ->whereIn('channel', PreferenceResolver::OPT_IN_CHANNELS)
            ->where('enabled', true)
            ->distinct()
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->flip();

        $couples = [];
        foreach ($lignes as $ligne) {
            if (! $allumes->has((int) $ligne->user_id)) {
                continue;
            }
            $cle = $ligne->user_id.':'.$ligne->agency_id;
            $couples[$cle] ??= [(int) $ligne->user_id, (int) $ligne->agency_id, []];
            $couples[$cle][2][] = (int) $ligne->id;
        }

        return array_values($couples);
    }

    /**
     * Le contenu d'un résumé : les biens donnés, la semaine donnée. Paramètres BRUTS du code `owner.weekly_digest`.
     *
     * @param  list<int>  $biens
     * @return array<string, mixed>
     */
    public function contenu(array $biens, CarbonImmutable $debut, CarbonImmutable $fin): array
    {
        $paiements = fn () => DB::table('lease_payments')
            ->join('leases', 'leases.id', '=', 'lease_payments.lease_id')
            ->whereIn('leases.property_id', $biens)
            ->whereNull('lease_payments.deleted_at')
            ->whereNull('leases.deleted_at');

        $encaisses = $paiements()
            ->where('lease_payments.status', PaymentStatus::Paid->value)
            ->where('lease_payments.paid_at', '>=', $debut->utc())
            ->where('lease_payments.paid_at', '<', $fin->utc())
            ->selectRaw('count(*) as n, coalesce(sum(lease_payments.amount), 0) as total, max(lease_payments.currency) as devise')
            ->first();

        // En retard au dimanche soir : une échéance non soldée dont la date est passée.
        $enRetard = $paiements()
            ->whereIn('lease_payments.status', [PaymentStatus::Late->value, PaymentStatus::Pending->value, PaymentStatus::PartiallyPaid->value])
            ->where('lease_payments.due_date', '<', $fin->toDateString())
            ->selectRaw('count(*) as n, coalesce(sum(lease_payments.amount), 0) as total, max(lease_payments.currency) as devise')
            ->first();

        $interventions = fn () => DB::table('maintenance_requests')->whereIn('property_id', $biens)->whereNull('deleted_at');
        $ouvertes = $interventions()->where('created_at', '>=', $debut->utc())->where('created_at', '<', $fin->utc())->count();
        $closes = $interventions()
            ->whereIn('status', [MaintenanceStatus::Completed->value, MaintenanceStatus::Closed->value])
            ->where('completed_at', '>=', $debut->utc())->where('completed_at', '<', $fin->utc())
            ->count();

        $visites = DB::table('property_visits')
            ->whereIn('property_id', $biens)
            ->whereNotNull('confirmed_at')
            ->where('confirmed_at', '>=', $debut->utc())->where('confirmed_at', '<', $fin->utc())
            ->count();

        $devise = $encaisses->devise ?? $enRetard->devise ?? 'XOF';

        return [
            'paid_count' => (int) $encaisses->n,
            'paid_total' => NotificationRenderer::money($encaisses->total, $encaisses->devise ?? $devise),
            'late_count' => (int) $enRetard->n,
            'late_total' => NotificationRenderer::money($enRetard->total, $enRetard->devise ?? $devise),
            'maintenance_opened' => $ouvertes,
            'maintenance_closed' => $closes,
            'visits' => $visites,
        ];
    }

    /**
     * La voie du pont : le gabarit du code (`resume_hebdo_bailleur` au registre) par le PILOTE dont le nom est une case
     * mobile de l'événement allumée ({@see PreferenceResolver::channelsFor()} : `whatsapp`, jamais `sms`) ; jamais
     * un texte libre. Envoyé : un relais `purpose = digest` (agence du résumé, bailleur, identifiant du fournisseur),
     * cible de la réponse ({@see RoutageEntrant::agenceDuResume()}). Indisponible ou échec sûr :
     * `null`, l'e-mail suit. Ambigu : le canal, et pas d'e-mail (règle de TCK-766).
     *
     * @param  array<string, mixed>  $params
     * @return string|null le canal effectif, ou `null` : à l'e-mail
     */
    private function parLePont(User $user, Agency $agence, array $params): ?string
    {
        $code = NotificationCode::OwnerWeeklyDigest;
        $event = (string) $code->preferenceEvent();
        $locale = $user->preferredLocale() ?? (string) config('app.locale');

        foreach ($this->preferences->channelsFor($event) as $nom) {
            if (! in_array($nom, RegistreDesCanaux::noms(), true)
                || ! (bool) config('messagerie.canaux.'.$nom.'.actif', false)
                || ! $this->preferences->shouldSend($user, $event, $nom)
                || blank($user->phone)) {
                continue;
            }
            $canal = $this->registre->canal($nom);
            if (! $canal->capacites()->gabarits
                || $canal->accord((string) $user->phone) === EtatDAccord::Oppose) {
                continue;
            }

            $formatted = $this->renderer->format($code, $params, $locale, $user->timezone ?: NotificationRenderer::DEFAULT_TIMEZONE);
            $variables = array_map(fn (string $nomParam): string => (string) ($formatted[$nomParam] ?? '—'), array_keys($code->params()));
            $resultat = $canal->envoyerGabarit((string) $user->phone, $code->value, $locale, $variables, ['agency_id' => null]);

            if ($resultat->envoye() || $resultat->ambigu) {
                MessageRelay::query()->create([
                    'purpose' => MessageRelay::PURPOSE_DIGEST,
                    'direction' => MessageRelay::DIRECTION_OUT,
                    'agency_id' => $agence->id,
                    'user_id' => $user->id,
                    'channel' => $canal->nom(),
                    'form' => $resultat->forme,
                    'template' => $resultat->gabarit,
                    'phone' => (string) $user->phone,
                    'business_number_id' => $resultat->numeroDEntreprise,
                    'provider_message_id' => $resultat->identifiantExterne,
                    'status' => $resultat->envoye() ? 'envoye' : 'echec',
                    'sent_at' => now(),
                ]);

                return $canal->nom();
            }
        }

        return null;
    }

    /** @param  array<string, mixed>  $params */
    private function parEmail(User $user, array $params): ?string
    {
        if (blank($user->email)) {
            return null;
        }
        $user->notify(new OwnerWeeklyDigestNotification($params));

        return 'mail';
    }
}
