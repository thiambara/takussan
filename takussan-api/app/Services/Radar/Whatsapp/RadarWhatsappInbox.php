<?php

namespace App\Services\Radar\Whatsapp;

use App\Jobs\Radar\VerifyRadarConsentReply;
use App\Models\Enums\RadarConsentProof;
use App\Models\Enums\RadarOutreachChannel;
use App\Models\Enums\RadarOutreachOutcome;
use App\Models\Enums\RadarVerificationStatus;
use App\Models\RadarAdvertiser;
use App\Models\RadarConsent;
use App\Models\RadarListing;
use App\Models\RadarOutreach;
use App\Services\Radar\AdvertiserRevocation;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2395 (ADR-0077 §3, §5) — les messages reçus sur le numéro du Radar, lus par son webhook une fois la signature
 * vérifiée. Chaque message d'un annonceur devient une **réponse à confirmer** (`proof = provider_message`, l'identifiant
 * du message reçu dans `provider_message_id`, le texte dans `transcript`) sur le message envoyé par l'API auquel il
 * répond, puis la vérification part en file. **Rien n'est confirmé ici** : seul `recordOutcome()` le fait, par un humain.
 *
 * - **Seul le numéro du Radar est lu** : un message adressé à un autre `phone_number_id` (celui des notifications, si
 *   les deux numéros partagent une application Meta) est ignoré, et rien n'est lu sans identifiant configuré.
 * - **Le rattachement** : le message que cite `context.id` (l'annonceur a répondu à ce message, ou touché un bouton du
 *   gabarit), à défaut le dernier envoyé par l'API à ce numéro ; puis, comme pour un dépôt, la dernière relance envoyée
 *   de sa chaîne. Un message manuel (`wa.me`) n'est jamais candidat : il est parti d'un autre téléphone.
 * - **Ignorés** : un numéro inconnu du Radar (aucune réponse n'est créée ; le corps de la requête, gardé chiffré au journal
 *   des webhooks le temps du traitement, y est effacé à sa clôture — `WebhookJournal::close()`), un annonceur qui a dit
 *   STOP, un identifiant déjà reçu (Meta rejoue ses webhooks : sous le verrou de l'annonceur, et l'index unique partiel en
 *   dernier recours).
 * - **Un message sans texte** (vocal, image, autocollant) est gardé comme réponse, son type en transcription, mais sa
 *   vérification est d'emblée en échec (`radar.verification.no_text`) : rien n'est téléchargé, l'opérateur tranche.
 * - **Un texte qui vaut exactement STOP** (aux espaces, à la casse et à la ponctuation finale près) **révoque l'annonceur
 *   dès la réception** ({@see AdvertiserRevocation::apply()}, comme le STOP posé par l'opérateur) quand
 *   `radar_whatsapp.auto_stop` est vrai (défaut) : le droit d'opposition « en répondant STOP » n'attend pas qu'un
 *   opérateur lise la réponse (ADR-0081). Le message auquel il répond prend l'issue `stop`, sans auteur ; aucune réponse
 *   n'est créée, la purge part en file. Tout autre texte, refus compris, reste une réponse que l'opérateur tranche.
 */
final class RadarWhatsappInbox
{
    /** La transcription d'une réponse reçue : le texte de l'annonceur, préfixé comme celles des captures. */
    public const TRANSCRIPT_PREFIX = 'Annonceur : ';

    /** Combien de fois le STOP reprend quand une annonce rejoint l'annonceur pendant sa lecture. */
    private const STOP_ATTEMPTS = 3;

    public function __construct(private readonly RadarWhatsappNumber $number, private readonly AdvertiserRevocation $revocation) {}

    /**
     * @param  array<array-key, mixed>  $entries  `entry` du webhook de Meta
     * @return array{received: int, recorded: int, first_id: ?string}
     */
    public function receive(array $entries): array
    {
        $numberId = $this->number->phoneNumberId();
        $received = 0;
        $recorded = 0;
        $firstId = null;
        foreach ($entries as $entry) {
            foreach ((array) (is_array($entry) ? ($entry['changes'] ?? []) : []) as $change) {
                $value = is_array($change) ? ($change['value'] ?? null) : null;
                if (! is_array($value) || $numberId === '' || (string) ($value['metadata']['phone_number_id'] ?? '') !== $numberId) {
                    continue;
                }
                foreach ((array) ($value['messages'] ?? []) as $message) {
                    if (! is_array($message)) {
                        continue;
                    }
                    $received++;
                    $firstId ??= is_string($message['id'] ?? null) ? $message['id'] : null;
                    $recorded += $this->record($message) ? 1 : 0;
                }
            }
        }

        return ['received' => $received, 'recorded' => $recorded, 'first_id' => $firstId];
    }

    /** Le texte d'une transcription de réponse reçue, sans son préfixe ; null si elle n'en porte pas. */
    public static function replyText(?string $transcript): ?string
    {
        if ($transcript === null || ! str_starts_with($transcript, self::TRANSCRIPT_PREFIX)) {
            return null;
        }
        $text = trim(substr($transcript, strlen(self::TRANSCRIPT_PREFIX)));

        return $text === '' ? null : $text;
    }

    /** Le texte vaut-il exactement STOP, aux espaces, à la casse et à la ponctuation finale près. */
    public static function isStop(string $text): bool
    {
        return preg_match('/^\s*stop\s*[.!?…]*\s*$/iu', $text) === 1;
    }

    /**
     * @param  array<string, mixed>  $message
     * @return bool le message a été rangé (une réponse créée, ou un STOP appliqué)
     */
    private function record(array $message): bool
    {
        $id = trim((string) ($message['id'] ?? ''));
        $from = preg_replace('/\D+/', '', (string) ($message['from'] ?? '')) ?? '';
        if ($id === '' || $from === '' || mb_strlen($id) > 120) {
            return false;
        }
        // Meta écrit le numéro sans `+` ; le Radar le garde en E.164.
        $advertiser = RadarAdvertiser::query()->where('phone', '+'.$from)->first();
        if ($advertiser === null || $advertiser->do_not_contact_at !== null) {
            return false;
        }
        $text = self::text($message);
        $contextId = is_string($message['context']['id'] ?? null) ? $message['context']['id'] : null;
        if ($text !== null && self::isStop($text) && (bool) config('radar_whatsapp.auto_stop', true)) {
            return $this->stop($advertiser, $id, $contextId);
        }

        return DB::transaction(function () use ($advertiser, $id, $text, $contextId, $message): ?RadarConsent {
            $locked = RadarAdvertiser::query()->whereKey($advertiser->getKey())->lockForUpdate()->first();
            if ($locked === null || $locked->do_not_contact_at !== null || RadarConsent::query()->where('provider_message_id', $id)->exists()) {
                return null;
            }
            $outreach = $this->target($locked, $contextId);
            if ($outreach === null) {
                return null;
            }

            $consent = RadarConsent::query()->create([
                'radar_outreach_id' => $outreach->id,
                'radar_advertiser_id' => $locked->id,
                'proof' => RadarConsentProof::ProviderMessage,
                'provider_message_id' => $id,
                'transcript' => self::TRANSCRIPT_PREFIX.($text ?? '['.mb_substr((string) ($message['type'] ?? 'unknown'), 0, 30).']'),
                'verification_status' => $text === null ? RadarVerificationStatus::Failed : RadarVerificationStatus::Pending,
                'verification_reason' => $text === null ? VerifyRadarConsentReply::REASON_NO_TEXT : null,
            ]);
            if ($text !== null) {
                VerifyRadarConsentReply::dispatch($consent->id)->afterCommit();
            }

            activity('Admin')
                ->performedOn($outreach)
                ->withProperties(['outreach_id' => $outreach->id, 'consent_id' => $consent->id, 'channel' => RadarOutreachChannel::WhatsappCloud->value])
                ->event('radar_consent_reply_received')
                ->log('Réponse d\'annonceur reçue par l\'API WhatsApp du Radar');

            return $consent;
        }) !== null;
    }

    /**
     * Le STOP reçu : la révocation, sous l'ordre des verrous du Radar — toutes les annonces de l'annonceur (par id), puis
     * l'annonceur, puis le message. Une annonce qui le rejoint entre les deux fait REPRENDRE, comme la révocation.
     */
    private function stop(RadarAdvertiser $advertiser, string $id, ?string $contextId): bool
    {
        for ($attempt = 1; $attempt <= self::STOP_ATTEMPTS; $attempt++) {
            $done = DB::transaction(function () use ($advertiser, $id, $contextId): ?bool {
                $listings = RadarListing::query()->where('radar_advertiser_id', $advertiser->getKey())->orderBy('id')->lockForUpdate()->get();
                $locked = RadarAdvertiser::query()->whereKey($advertiser->getKey())->lockForUpdate()->first();
                if ($locked === null || $locked->do_not_contact_at !== null) {
                    return false;
                }
                if ($this->revocation->listingIds($locked) !== $listings->pluck('id')->map(fn ($listing) => (int) $listing)->sort()->values()->all()) {
                    return null;
                }
                $outreach = $this->target($locked, $contextId);
                $applied = $this->revocation->apply($locked, $listings);
                if ($outreach !== null && $outreach->outcome?->isFinal() !== true) {
                    $outreach->forceFill(['outcome' => RadarOutreachOutcome::Stop, 'outcome_at' => now(), 'outcome_by_id' => null])->save();
                }

                activity('Admin')
                    ->performedOn($outreach ?? $locked)
                    ->withProperties(array_filter([
                        'advertiser_id' => $locked->id,
                        'outreach_id' => $outreach?->id,
                        'provider_message_id' => $id,
                        'channel' => RadarOutreachChannel::WhatsappCloud->value,
                        'listing_ids' => $applied['closed'],
                        'revoked_consent_ids' => $applied['revoked_consents'],
                        'property_ids' => $applied['retired_properties'],
                    ], fn (mixed $value) => $value !== null && $value !== []))
                    ->event('radar_stop_received')
                    ->log('STOP reçu par l\'API WhatsApp du Radar : annonceur révoqué');

                return true;
            });
            if ($done !== null) {
                return $done;
            }
        }

        abort_code(409, 'radar.advertiser.busy');
    }

    /** Le message auquel la réponse se rattache, verrouillé ; null s'il n'y en a pas. */
    private function target(RadarAdvertiser $advertiser, ?string $contextId): ?RadarOutreach
    {
        $sent = fn () => RadarOutreach::query()
            ->where('radar_advertiser_id', $advertiser->id)
            ->where('channel', RadarOutreachChannel::WhatsappCloud->value)
            ->whereNotNull('sent_at');

        $outreach = $contextId === null ? null : $sent()->where('provider_message_id', $contextId)->first();
        $outreach ??= $sent()->orderByDesc('sent_at')->orderByDesc('id')->first();
        // La réponse va au dernier message envoyé de sa chaîne : une relance porte les mêmes annonces et les mêmes clauses.
        while ($outreach !== null && ($next = RadarOutreach::query()->where('follow_up_of_id', $outreach->id)->whereNotNull('sent_at')->first()) !== null) {
            $outreach = $next;
        }

        return $outreach === null ? null : RadarOutreach::query()->whereKey($outreach->id)->lockForUpdate()->first();
    }

    /**
     * Le texte du message : un texte, un bouton du gabarit (« OUI », « STOP »), une réponse interactive ; null pour un
     * vocal, une image ou tout autre type.
     *
     * @param  array<string, mixed>  $message
     */
    private static function text(array $message): ?string
    {
        $text = match ($message['type'] ?? null) {
            'text' => $message['text']['body'] ?? null,
            'button' => $message['button']['text'] ?? null,
            'interactive' => $message['interactive']['button_reply']['title'] ?? $message['interactive']['list_reply']['title'] ?? null,
            default => null,
        };

        return is_string($text) && trim($text) !== '' ? mb_substr(trim($text), 0, 4000) : null;
    }
}
