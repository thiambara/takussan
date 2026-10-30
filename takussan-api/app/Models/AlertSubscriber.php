<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Services\Notifications\Sms\PhoneNumber;
use App\Support\AppKeyHmac;
use App\Support\CaseInsensitive;
use Illuminate\Contracts\Translation\HasLocalePreference;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Notifications\Notifiable;
use InvalidArgumentException;

/**
 * TCK-599 (ADR-0050 §4) — un visiteur qui demande une alerte sans compte : UNE LIGNE PAR DEMANDE.
 *
 * ⚠ **`contact` est la donnée d'une personne physique** (e-mail ou téléphone) : colonne `text`,
 * cast `encrypted`, `$hidden`, jamais journalisé (le modèle n'est pas `Auditable`). On la retrouve
 * par {@see self::contactHash()} — HMAC sous `app.key`, la forme de `PayoutMethod::fingerprint()` :
 * un SHA-256 nu d'un numéro se retrouve par force brute. TCK-2430 (ADR-0084) — une écriture pose l'empreinte sous la
 * clé courante, une lecture la cherche aussi sous `APP_PREVIOUS_KEYS` ({@see self::contactHashes()}) : une
 * rotation d'`APP_KEY` ne coupe pas un contact de ses demandes d'avant.
 *
 * Rien ne part avant `confirmed_at`, sauf l'unique message qui le demande. La désinscription
 * efface TOUTES les demandes du contact ({@see self::eraseContact()}) ; une demande non confirmée
 * est purgée à 48 h (`search-alerts:purge-unconfirmed`).
 */
class AlertSubscriber extends AbstractModel implements HasLocalePreference
{
    use Notifiable;

    public const CHANNEL_EMAIL = 'email';

    public const CHANNEL_WHATSAPP = 'whatsapp';

    /** @var list<string> */
    public const CHANNELS = [self::CHANNEL_EMAIL, self::CHANNEL_WHATSAPP];

    /** La source du consentement WhatsApp que pose la confirmation d'une alerte. */
    public const WHATSAPP_CONSENT_SOURCE = 'search_alert';

    /** La version du texte de consentement affiché par le formulaire (preuve de consentement). */
    public const CONSENT_VERSION = 'search-alert-2026-10-08';

    protected $fillable = [
        'channel', 'contact', 'contact_hash', 'mailbox_hash', 'locale', 'confirmation_token_hash',
        'confirmation_sent_at', 'confirmed_at', 'unsubscribe_token', 'unsubscribe_token_hash',
        'consent_at', 'consent_source', 'consent_version',
    ];

    protected $hidden = ['contact', 'contact_hash', 'mailbox_hash', 'confirmation_token_hash', 'unsubscribe_token', 'unsubscribe_token_hash'];

    protected $casts = [
        'contact' => 'encrypted',
        'unsubscribe_token' => 'encrypted',
        'confirmation_sent_at' => 'datetime',
        'confirmed_at' => 'datetime',
        'consent_at' => 'datetime',
    ];

    protected static array $queryFields = ['id', 'channel', 'locale', 'confirmed_at', 'created_at'];

    protected static function booted(): void
    {
        // L'empreinte de boîte se déduit du contact : aucun écrivain ne peut l'oublier.
        static::creating(function (self $subscriber): void {
            $subscriber->mailbox_hash ??= self::mailboxHash((string) $subscriber->channel, (string) $subscriber->contact);
        });
    }

    /** La forme comparable d'un contact : e-mail replié (ADR-0025), téléphone en E.164. */
    public static function normalizeContact(string $channel, string $contact): string
    {
        return $channel === self::CHANNEL_WHATSAPP
            ? PhoneNumber::normalize($contact)
            : CaseInsensitive::fold(trim($contact));
    }

    /** L'empreinte de recherche d'un contact. Le canal en fait partie : un même texte, deux contacts. */
    public static function contactHash(string $channel, string $contact): string
    {
        return AppKeyHmac::of($channel.'|'.self::normalizeContact($channel, $contact));
    }

    /**
     * TCK-2430 — les empreintes sous lesquelles ce contact a pu être écrit : ce qu'une lecture cherche.
     *
     * @return list<string>
     */
    public static function contactHashes(string $channel, string $contact): array
    {
        return AppKeyHmac::all($channel.'|'.self::normalizeContact($channel, $contact));
    }

    /**
     * verif-599 m1 — l'empreinte de la BOÎTE qui reçoit : `awa+promo@exemple.sn` et
     * `awa@exemple.sn` arrivent au même endroit. Elle porte les PLAFONDS et le limiteur par
     * contact, jamais le rattachement ni la désinscription, qui restent sur le contact saisi
     * ({@see self::contactHash()}). Un téléphone n'a pas d'alias : même empreinte que le contact.
     */
    public static function mailboxHash(string $channel, string $contact): string
    {
        return AppKeyHmac::of(self::mailbox($channel, $contact));
    }

    /**
     * TCK-2430 — les empreintes sous lesquelles cette boîte a pu être écrite : les plafonds les comptent toutes.
     *
     * @return list<string>
     */
    public static function mailboxHashes(string $channel, string $contact): array
    {
        return AppKeyHmac::all(self::mailbox($channel, $contact));
    }

    private static function mailbox(string $channel, string $contact): string
    {
        $contact = self::normalizeContact($channel, $contact);
        if ($channel === self::CHANNEL_EMAIL) {
            $contact = (string) preg_replace('/\+[^@]*(?=@[^@]*$)/', '', $contact);
        }

        return 'mailbox|'.$channel.'|'.$contact;
    }

    /** L'empreinte stockée d'un jeton : on ne garde jamais le jeton de confirmation lui-même. */
    public static function tokenHash(string $token): string
    {
        return hash('sha256', $token);
    }

    /** 256 bits, encodés pour une URL. */
    public static function newToken(): string
    {
        return rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
    }

    /** @return HasMany<SavedSearch, $this> */
    public function savedSearches(): HasMany
    {
        return $this->hasMany(SavedSearch::class);
    }

    /** @param  Builder<AlertSubscriber>  $query */
    public function scopeForContact(Builder $query, string $channel, string $contact): Builder
    {
        return $query->whereIn('contact_hash', self::contactHashes($channel, $contact));
    }

    public function isConfirmed(): bool
    {
        return $this->confirmed_at !== null;
    }

    public function unsubscribeToken(): string
    {
        return (string) $this->unsubscribe_token;
    }

    public function preferredLocale(): ?string
    {
        return $this->locale ?: null;
    }

    /** @return string|null l'adresse, pour le canal `mail` */
    public function routeNotificationForMail(): ?string
    {
        return $this->channel === self::CHANNEL_EMAIL ? (string) $this->contact : null;
    }

    /** @return string|null le numéro E.164, pour le canal `whatsapp` */
    public function routeNotificationForWhatsapp(): ?string
    {
        return $this->channel === self::CHANNEL_WHATSAPP ? (string) $this->contact : null;
    }

    /**
     * « Effacer le contact » : toutes les demandes de ce contact, et leurs recherches (FK en
     * cascade). Une ligne par demande ne doit pas laisser une seconde copie derrière la première.
     * TCK-2430 — sous toutes les clés reconnues : une demande écrite avant une rotation d'`APP_KEY` part aussi.
     */
    public function eraseContact(): int
    {
        if ($this->channel === self::CHANNEL_WHATSAPP) {
            $this->retirerLeConsentementWhatsapp();
        }

        $hashes = [$this->contact_hash];
        try {
            $hashes = [...$hashes, ...self::contactHashes((string) $this->channel, (string) $this->contact)];
        } catch (InvalidArgumentException) {
            // Un numéro que `PhoneNumber::normalize()` refuse : la désinscription garde au moins l'empreinte stockée.
        }

        return self::query()->whereIn('contact_hash', array_values(array_unique($hashes)))->delete();
    }

    /**
     * verif-599 m3 — la confirmation par code inscrit le numéro dans `whatsapp_contacts`, en
     * `opted_in` (la garde d'opt-in de `WhatsappChannel` l'exige). La désinscription le retire :
     * la ligne disparaît si l'alerte était sa seule raison d'être (aucun compte, aucun message
     * reçu) ; sinon le consentement que l'alerte avait posé est retiré. Un consentement venu
     * d'ailleurs (`opt_in_source` ≠ `search_alert`) n'est pas touché.
     */
    private function retirerLeConsentementWhatsapp(): void
    {
        $contact = WhatsappContact::query()->where('phone', $this->contact)->first();
        if ($contact === null || $contact->opt_in_source !== self::WHATSAPP_CONSENT_SOURCE) {
            return;
        }

        $contact->user_id === null && $contact->last_inbound_at === null
            ? $contact->delete()
            : $contact->optOut('search_alert_unsubscribe');
    }
}
