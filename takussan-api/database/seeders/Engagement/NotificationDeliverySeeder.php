<?php

namespace Database\Seeders\Engagement;

use App\Domain\Notifications\NotificationCode;
use App\Models\AppNotification;
use App\Models\Lease;
use App\Services\Notifications\Sms\PhoneNumber;
use App\Services\Notifications\Sms\SmsRouterDriver;
use Carbon\CarbonImmutable;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\Timeline;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Config;

/**
 * TCK-2381 — les tentatives d'envoi par SMS (`notification_delivery_attempts`, TCK-110) des relances de
 * loyer en retard que `AppNotificationSeeder` a écrites : le texte de la notification, envoyé par
 * `SmsRouterDriver` au numéro du destinataire, dans le contexte que `SmsChannel` lui donne (agence de
 * l'envoi, notification rattachée). Le routeur écrit lui-même la tentative.
 *
 * La chaîne de chaque opérateur est réduite, le temps du seeder, au pilote `log` — le repli de
 * développement (`SMS_LOG_FALLBACK`) : aucun fournisseur n'est appelé, même quand une agence a une
 * intégration SMS. Les tentatives portent donc le fournisseur `log`, comme sur un poste de développement.
 */
class NotificationDeliverySeeder extends Seeder
{
    /** Relances envoyées par SMS, par agence : les plus récentes. */
    private const PAR_AGENCE = 8;

    public function __construct(private readonly SeedingContext $ctx) {}

    public function run(): void
    {
        $avant = Config::get('sms.fallback_chains');
        Config::set('sms.fallback_chains', array_map(fn () => ['log'], is_array($avant) && $avant !== [] ? $avant : ['default' => []]));
        try {
            $router = app()->make(SmsRouterDriver::class);
            foreach ($this->ctx->agencies as $agency) {
                $this->agence((int) $agency->id, $router);
            }
        } finally {
            Config::set('sms.fallback_chains', $avant);
        }
    }

    private function agence(int $agencyId, SmsRouterDriver $router): void
    {
        $baux = Lease::query()->where('agency_id', $agencyId)->pluck('id')->map(fn ($id) => (string) $id)->all();
        if ($baux === []) {
            return;
        }
        $maintenant = CarbonImmutable::now();

        $relances = AppNotification::query()
            ->whereIn('code', [NotificationCode::LeasePaymentOverdue->value, NotificationCode::LeasePaymentOverdueLandlord->value])
            ->where('target->kind', 'lease')
            ->whereIn('target->id', $baux)
            ->whereDoesntHave('deliveryAttempts')
            ->with('user:id,phone')
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->limit(self::PAR_AGENCE * 3)
            ->get()
            ->filter(fn (AppNotification $n) => is_string($n->user?->phone) && PhoneNumber::isValid($n->user->phone))
            ->take(self::PAR_AGENCE)
            ->sortBy('id');

        foreach ($relances as $relance) {
            $le = CarbonImmutable::parse($relance->created_at);
            if ($le->greaterThan($maintenant)) {
                continue;
            }
            Timeline::aLaDate($le, fn () => $router->send($relance->user->phone, (string) $relance->body, [
                'is_critical' => false,
                'event_type' => $relance->code,
                'agency_id' => $agencyId,
                'notification_id' => (int) $relance->id,
            ]));
        }
    }
}
