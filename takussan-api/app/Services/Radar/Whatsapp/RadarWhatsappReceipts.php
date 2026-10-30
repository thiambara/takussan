<?php

namespace App\Services\Radar\Whatsapp;

use App\Models\Enums\RadarOutreachChannel;
use App\Models\RadarAdvertiser;
use App\Models\RadarOutreach;
use App\Services\Radar\RadarOutreachWorkflow;
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
 * - **Un envoi ambigu n'a souvent pas d'identifiant** (délai, 5xx : Meta ne l'a pas rendu). Un accusé d'un identifiant
 *   inconnu, adressé au numéro d'un annonceur, ne peut venir que d'un message envoyé par l'API à ce numéro : il se
 *   rattache au SEUL envoi ambigu sans identifiant de cet annonceur, qui prend l'identifiant (les accusés suivants et
 *   les réponses s'apparient alors par lui), à condition que l'accusé ne précède pas l'envoi de plus de
 *   {@see self::ADOPTION_SLACK_SECONDS}. Deux candidats : rien n'est deviné.
 * - **Les verrous suivent l'ordre du Radar** — l'annonceur, puis le message (un sous-ensemble de « annonces, annonceur,
 *   message ») : un accusé qui arrive pendant l'envoi attend que {@see RadarOutreachWorkflow::markSent()}
 *   ait écrit l'identifiant, au lieu de le manquer.
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

    /** L'avance qu'un accusé peut avoir sur l'envoi ambigu qu'il adopte : Meta date l'acceptation, le Radar sa fin d'attente. */
    public const ADOPTION_SLACK_SECONDS = 600;

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
        $known = RadarOutreach::query()->where('provider_message_id', $id)->first();
        $advertiserId = $known?->radar_advertiser_id ?? $this->recipient($status)?->id;
        if ($advertiserId === null) {
            return false;
        }
        $timestamp = is_numeric($status['timestamp'] ?? null) ? (int) $status['timestamp'] : null;

        return DB::transaction(function () use ($id, $new, $advertiserId, $timestamp, $status): bool {
            if (RadarAdvertiser::query()->whereKey($advertiserId)->lockForUpdate()->first() === null) {
                return false;
            }
            $outreach = $this->cloud($advertiserId)->where('provider_message_id', $id)->lockForUpdate()->first();
            $adopted = $outreach === null;
            $outreach ??= $this->ambiguousWithoutId($advertiserId, $timestamp);
            if ($outreach === null || ! self::advances($outreach->provider_status, $new)) {
                return false;
            }

            $previous = $outreach->provider_status;
            $outreach->forceFill(['provider_status' => $new] + ($adopted ? ['provider_message_id' => $id] : []))->save();

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
                        'adopted' => $adopted ?: null,
                    ], fn (mixed $value) => $value !== null))
                    ->event('radar_whatsapp_delivery_failed')
                    ->log('Message du Radar non remis par WhatsApp');
            }

            return true;
        });
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

    /** Le seul envoi ambigu sans identifiant de l'annonceur, verrouillé, si l'accusé ne le précède pas ; null sinon. */
    private function ambiguousWithoutId(int $advertiserId, ?int $timestamp): ?RadarOutreach
    {
        $candidates = $this->cloud($advertiserId)
            ->whereNull('provider_message_id')
            ->where('provider_status', RadarWhatsappOutreach::STATUS_AMBIGUOUS)
            ->limit(2)
            ->lockForUpdate()
            ->get();
        if ($candidates->count() !== 1) {
            return null;
        }
        $outreach = $candidates->first();
        if ($timestamp !== null && $timestamp < $outreach->sent_at->getTimestamp() - self::ADOPTION_SLACK_SECONDS) {
            return null;
        }

        return $outreach;
    }

    /**
     * L'annonceur auquel l'accusé est adressé : Meta écrit le numéro sans `+`, le Radar le garde en E.164.
     *
     * @param  array<string, mixed>  $status
     */
    private function recipient(array $status): ?RadarAdvertiser
    {
        $digits = preg_replace('/\D+/', '', (string) ($status['recipient_id'] ?? '')) ?? '';

        return $digits === '' ? null : RadarAdvertiser::query()->where('phone', '+'.$digits)->first();
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
