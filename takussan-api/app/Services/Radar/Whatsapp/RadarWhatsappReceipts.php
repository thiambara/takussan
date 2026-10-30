<?php

namespace App\Services\Radar\Whatsapp;

use App\Models\Enums\RadarOutreachChannel;
use App\Models\RadarAdvertiser;
use App\Models\RadarOutreach;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * TCK-2427 (ADR-0081) — les accusés de livraison des messages envoyés par l'API du Radar (`statuses` de son webhook :
 * `sent`, `delivered`, `read`, `failed`), lus une fois la signature vérifiée. `radar_outreaches.provider_status` les suit,
 * apparié par `provider_message_id`. **Un accusé n'est jamais une preuve d'accord** : il ne touche ni `sent_at`, ni
 * l'issue, ni les annonces, et ne crée aucune réponse.
 *
 * - **Le statut ne recule jamais**, quel que soit l'ordre dans lequel Meta livre ses accusés, et autant de fois qu'il les
 *   rejoue : `accepted`/`ambiguous` → `sent` → `delivered` → `read`. `failed` remplace `accepted`, `ambiguous` ou
 *   `sent`, jamais une remise (`delivered`, `read` : le message est arrivé) ; rien ne remplace `failed` ni `read`.
 * - **Un `failed` est journalisé** (`radar_whatsapp_delivery_failed`) avec le code de Meta, seule partie stable de
 *   l'erreur ; ni son texte (`title`, `message`, `error_data` peuvent citer le numéro), ni le numéro. Sur un envoi
 *   `ambiguous`, il dit que le message n'est pas parti ; le message reste envoyé (`sent_at`) : l'opérateur juge.
 * - **Un accusé d'identifiant inconnu est ignoré**, compté (`received`) et journalisé par son identifiant et son statut
 *   seuls, **jamais rattaché par inférence**. Le rattacher « au seul envoi ambigu de ce numéro » rouvrait le double envoi
 *   de la reprise de {@see RadarWhatsappOutreach} (l'accusé d'une relance pris par un ancien ambigu, puis l'index unique
 *   heurté), et faisait d'un message étranger au Radar, sur le même numéro, la remise d'un message d'accord (vérification
 *   de TCK-2427, I-1).
 * - **Sauf appariement EXACT par le jeton opaque** (TCK-2436, amendement d'ADR-0081) : un accusé d'identifiant inconnu
 *   qui porte le `biz_opaque_callback_data` d'un envoi par l'API, `ambiguous` et sans identifiant, adressé au numéro de
 *   son annonceur (`recipient_id`), le rattache : l'identifiant de Meta est écrit sur la ligne, le statut avance. Tout
 *   autre cas — sans jeton, jeton inconnu, envoi déjà identifié ou jamais parti, autre destinataire, annonceur purgé —
 *   reste ignoré. Meta ne documente le renvoi du jeton que pour `sent`, `delivered` et `read` : un `failed` sans jeton
 *   laisse l'envoi `ambiguous`, et l'opérateur juge.
 * - **Les verrous suivent l'ordre du Radar** — l'annonceur, puis le message (un sous-ensemble de « annonces, annonceur,
 *   message ») : deux accusés du même message se sérialisent, et le second relit le statut écrit par le premier.
 */
final class RadarWhatsappReceipts
{
    public const STATUS_SENT = 'sent';

    public const STATUS_DELIVERED = 'delivered';

    public const STATUS_READ = 'read';

    public const STATUS_FAILED = 'failed';

    /** Le rang d'un statut : un accusé n'écrit que s'il avance. `failed` a ses propres règles ({@see self::advances()}). */
    private const RANKS = [
        RadarWhatsappOutreach::STATUS_ACCEPTED => 0,
        RadarWhatsappOutreach::STATUS_AMBIGUOUS => 0,
        self::STATUS_SENT => 1,
        self::STATUS_DELIVERED => 2,
        self::STATUS_READ => 3,
    ];

    public function __construct(private readonly RadarWhatsappNumber $number) {}

    /**
     * @param  array<array-key, mixed>  $entries  `entry` du webhook de Meta
     * @return array{received: int, applied: int, first_id: ?string}
     */
    public function receive(array $entries): array
    {
        $numberId = $this->number->phoneNumberId();
        $received = 0;
        $applied = 0;
        $firstId = null;
        foreach ($entries as $entry) {
            foreach ((array) (is_array($entry) ? ($entry['changes'] ?? []) : []) as $change) {
                $value = is_array($change) ? ($change['value'] ?? null) : null;
                if (! is_array($value) || $numberId === '' || (string) ($value['metadata']['phone_number_id'] ?? '') !== $numberId) {
                    continue;
                }
                foreach ((array) ($value['statuses'] ?? []) as $status) {
                    if (! is_array($status)) {
                        continue;
                    }
                    $received++;
                    $firstId ??= is_string($status['id'] ?? null) ? $status['id'] : null;
                    $applied += $this->apply($status) ? 1 : 0;
                }
            }
        }

        return ['received' => $received, 'applied' => $applied, 'first_id' => $firstId];
    }

    /** @param  array<string, mixed>  $status */
    private function apply(array $status): bool
    {
        $id = trim((string) ($status['id'] ?? ''));
        $new = (string) ($status['status'] ?? '');
        if ($id === '' || mb_strlen($id) > 120 || ! in_array($new, [self::STATUS_SENT, self::STATUS_DELIVERED, self::STATUS_READ, self::STATUS_FAILED], true)) {
            return false;
        }
        $token = self::callbackToken($status);
        $advertiserId = RadarOutreach::query()->where('provider_message_id', $id)->value('radar_advertiser_id')
            ?? ($token === null ? null : RadarOutreach::query()->where('provider_callback_token', $token)->value('radar_advertiser_id'));
        if ($advertiserId === null) {
            Log::info('[radar.whatsapp] accusé d\'un identifiant inconnu, ignoré', ['provider_message_id' => $id, 'status' => $new]);

            return false;
        }

        return DB::transaction(function () use ($id, $new, $advertiserId, $status, $token): bool {
            $advertiser = RadarAdvertiser::query()->whereKey($advertiserId)->lockForUpdate()->first();
            if ($advertiser === null) {
                return false;
            }
            // L'identifiant d'abord, relu sous le verrou : un accusé concurrent a pu l'écrire par le jeton entre-temps.
            $outreach = $this->cloud($advertiser->id)->where('provider_message_id', $id)->lockForUpdate()->first()
                ?? ($token === null ? null : $this->ambiguousByToken($advertiser, $token, $id, $status));
            if ($outreach === null || ! self::advances($outreach->provider_status, $new)) {
                return false;
            }

            $previous = $outreach->provider_status;
            $outreach->forceFill(['provider_status' => $new, 'provider_message_id' => $id])->save();

            if ($new === self::STATUS_FAILED) {
                $code = self::errorCode($status);
                Log::warning('[radar.whatsapp] message non remis', ['outreach_id' => $outreach->id, 'provider_message_id' => $id, 'code' => $code]);
                activity('Admin')
                    ->performedOn($outreach)
                    ->withProperties(array_filter([
                        'outreach_id' => $outreach->id,
                        'provider_message_id' => $id,
                        'channel' => RadarOutreachChannel::WhatsappCloud->value,
                        'previous_status' => $previous,
                        'provider_error_code' => $code,
                    ], fn (mixed $value) => $value !== null))
                    ->event('radar_whatsapp_delivery_failed')
                    ->log('Message du Radar non remis par WhatsApp');
            }

            return true;
        });
    }

    /**
     * TCK-2436 — l'envoi sans identifiant que désigne EXACTEMENT ce jeton, ou null : il doit être de cet annonceur,
     * adressé à son numéro (un annonceur purgé n'en a plus), et l'identifiant de Meta libre. Un envoi par l'API sans
     * identifiant est toujours `ambiguous` : le jeton n'est écrit qu'avec les colonnes du canal.
     *
     * @param  array<string, mixed>  $status
     */
    private function ambiguousByToken(RadarAdvertiser $advertiser, string $token, string $id, array $status): ?RadarOutreach
    {
        if ($advertiser->phone === null || (string) ($status['recipient_id'] ?? '') !== ltrim($advertiser->phone, '+')) {
            return null;
        }
        if (RadarOutreach::query()->where('provider_message_id', $id)->exists()) {
            return null;
        }

        return $this->cloud($advertiser->id)
            ->where('provider_callback_token', $token)
            ->whereNull('provider_message_id')
            ->lockForUpdate()
            ->first();
    }

    /**
     * Le jeton opaque rendu par Meta, ou null.
     *
     * @param  array<string, mixed>  $status
     */
    private static function callbackToken(array $status): ?string
    {
        $token = $status['biz_opaque_callback_data'] ?? null;

        return is_string($token) && $token !== '' ? $token : null;
    }

    /** Le statut avance-t-il ? Jamais en arrière, jamais après `failed` ni `read`, jamais `failed` après une remise. */
    public static function advances(?string $current, string $new): bool
    {
        $rank = $current === null ? 0 : (self::RANKS[$current] ?? null);
        if ($rank === null) {
            // `failed`, ou une valeur inconnue : rien ne la remplace.
            return false;
        }

        return $new === self::STATUS_FAILED ? $rank <= self::RANKS[self::STATUS_SENT] : (self::RANKS[$new] ?? 0) > $rank;
    }

    /**
     * Les messages de l'annonceur envoyés par l'API ; un message manuel (`wa.me`) part d'un autre téléphone.
     *
     * @return Builder<RadarOutreach>
     */
    private function cloud(int $advertiserId): Builder
    {
        return RadarOutreach::query()
            ->where('radar_advertiser_id', $advertiserId)
            ->where('channel', RadarOutreachChannel::WhatsappCloud->value)
            ->whereNotNull('sent_at');
    }

    /**
     * Le code de la première erreur d'un `failed` (`131026` : non remis, `131049` : limité par Meta…) ; null sans code.
     *
     * @param  array<string, mixed>  $status
     */
    private static function errorCode(array $status): ?int
    {
        $code = $status['errors'][0]['code'] ?? null;

        return is_int($code) || (is_string($code) && ctype_digit($code)) ? (int) $code : null;
    }
}
