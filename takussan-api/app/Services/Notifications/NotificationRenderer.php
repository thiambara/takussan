<?php

namespace App\Services\Notifications;

use App\Domain\Notifications\NotificationCode;
use App\Models\Enums\Currency;
use App\Services\Admin\NotificationTemplateService;
use App\Services\Formatting\CurrencyFormatter;
use Illuminate\Support\Carbon;
use NumberFormatter;

/**
 * TCK-588 (ADR-0032) — rend une notification par code, pour UNE surface et UNE langue.
 *
 * Surfaces : `title`, `body`, `mail_subject`, `mail_body`, `sms`. Clés :
 * `lang/{fr,en,wo}/notifications.php` → `codes.<code>.<surface>` ; `mail_subject` retombe sur
 * `title` et `mail_body` sur `body` quand le code n'en déclare pas. Un paramètre facultatif
 * présent (le lien de paiement) choisit la variante `<surface>_link`.
 *
 * Un gabarit ACTIF de l'éditeur du super-admin, pour {@see NotificationCode::templateEvent()},
 * le canal et la langue, l'emporte sur `lang/` pour l'e-mail et le SMS.
 *
 * Formatage dans la langue du DESTINATAIRE : montants par {@see CurrencyFormatter}, dates dans
 * son fuseau (`users.timezone`, défaut `Africa/Dakar`), pluriels par `trans_choice`.
 */
class NotificationRenderer
{
    public const SURFACES = ['title', 'body', 'mail_subject', 'mail_body', 'sms'];

    public const DEFAULT_TIMEZONE = 'Africa/Dakar';

    /**
     * Longueur maximale d'un paramètre TEXTE dans un SMS. Un texte accentué part en UCS-2 :
     * deux segments, c'est 134 caractères. Sans plafond, un intitulé de bien de 49 caractères
     * (le plus long du jeu de données, mesuré le 2026-10-07) et un nom de locataire poussaient
     * `lease_payment.overdue_landlord` à trois segments.
     */
    public const SMS_TEXT_MAX = 32;

    public function __construct(
        private readonly CurrencyFormatter $currency,
        private readonly NotificationTemplateService $templates,
    ) {}

    /**
     * @param  array<string, mixed>  $params  paramètres BRUTS, tels qu'ils sont stockés
     */
    public function render(
        NotificationCode $code,
        array $params,
        string $locale,
        ?string $timezone = null,
        string $surface = 'body',
        ?string $firstName = null,
    ): string {
        if (! in_array($surface, self::SURFACES, true)) {
            throw new \InvalidArgumentException("Surface inconnue : {$surface}");
        }

        $formatted = $this->format($code, $params, $locale, $timezone ?: self::DEFAULT_TIMEZONE, $surface === 'sms' ? self::SMS_TEXT_MAX : null);

        $fromTemplate = $this->fromTemplate($code, $params, $formatted, $locale, $surface, $firstName);
        if ($fromTemplate !== null) {
            return $fromTemplate;
        }

        $key = $this->key($code, $params, $locale, $surface);
        $plural = $code->pluralParam();

        return $plural !== null
            ? trans_choice($key, (int) ($params[$plural] ?? 0), $formatted, $locale)
            : __($key, $formatted, $locale);
    }

    /**
     * Les paramètres formatés pour un texte, dans la langue et le fuseau du destinataire. Un
     * `$textMax` tronque les paramètres texte (SMS).
     *
     * @param  array<string, mixed>  $params
     * @return array<string, string>
     */
    public function format(NotificationCode $code, array $params, string $locale, string $timezone, ?int $textMax = null): array
    {
        $out = [];
        foreach ($code->params() + $code->optionalParams() as $name => $type) {
            $value = $params[$name] ?? null;
            $out[$name] = match ($type) {
                NotificationCode::PARAM_MONEY => $this->formatMoney($value, $locale),
                NotificationCode::PARAM_DATE => $this->date($value, $locale, null),
                NotificationCode::PARAM_DATETIME => $this->date($value, $locale, $timezone),
                NotificationCode::PARAM_COUNT => (string) (int) $value,
                NotificationCode::PARAM_URL => is_string($value) && $value !== '' ? $value : '—',
                NotificationCode::PARAM_REASON_CODE => $this->reasonCode($value, $params['reason'] ?? null, $locale, $textMax),
                default => is_scalar($value) && (string) $value !== '' ? $this->text((string) $value, $textMax) : '—',
            };
        }

        return $out;
    }

    /**
     * La valeur brute d'un montant, telle qu'un paramètre `money` la porte.
     *
     * @return array{amount: string, currency: string}
     */
    public static function money(float|int|string|null $amount, Currency|string|null $currency): array
    {
        return [
            'amount' => number_format((float) $amount, 2, '.', ''),
            'currency' => $currency instanceof Currency ? $currency->value : ($currency ?: Currency::XOF->value),
        ];
    }

    private function key(NotificationCode $code, array $params, string $locale, string $surface): string
    {
        $base = 'notifications.codes.'.$code->value.'.';
        $fallback = match ($surface) {
            'mail_subject' => 'title',
            'mail_body' => 'body',
            default => $surface,
        };

        $candidates = [];
        if ($this->hasOptional($code, $params)) {
            $candidates[] = $base.$surface.'_link';
            $candidates[] = $base.$fallback.'_link';
        }
        $candidates[] = $base.$surface;
        $candidates[] = $base.$fallback;

        foreach ($candidates as $candidate) {
            if (trans()->has($candidate, $locale)) {
                return $candidate;
            }
        }

        return $base.$fallback;
    }

    private function hasOptional(NotificationCode $code, array $params): bool
    {
        foreach (array_keys($code->optionalParams()) as $name) {
            if (is_string($params[$name] ?? null) && $params[$name] !== '') {
                return true;
            }
        }

        return false;
    }

    /**
     * verif-597 m5 — le libellé traduit du motif, jamais le code brut (« Motif : personal_data. »),
     * puis le complément libre entre parenthèses s'il y en a un.
     */
    private function reasonCode(mixed $code, mixed $detail, string $locale, ?int $max): string
    {
        $key = 'moderation.reasons.'.(is_string($code) ? $code : '');
        $label = is_string($code) && $code !== '' && trans()->has($key, $locale) ? __($key, [], $locale) : '—';
        $label = is_string($detail) && $detail !== '' ? $label.' ('.$detail.')' : $label;

        return $this->text($label, $max);
    }

    private function text(string $value, ?int $max): string
    {
        return $max !== null && mb_strlen($value) > $max
            ? rtrim(mb_substr($value, 0, $max - 3)).'...'
            : $value;
    }

    private function formatMoney(mixed $value, string $locale): string
    {
        if (! is_array($value) || ! is_numeric($value['amount'] ?? null)) {
            return '—';
        }
        $currency = Currency::tryFrom((string) ($value['currency'] ?? '')) ?? Currency::XOF;

        return $this->currency->format((float) $value['amount'], $currency, $locale);
    }

    private function date(mixed $value, string $locale, ?string $timezone): string
    {
        if (! is_string($value) || $value === '') {
            return '—';
        }
        $date = Carbon::parse($value);
        if ($timezone !== null) {
            $date = $date->setTimezone($timezone);
        }

        return $date->locale($locale)->isoFormat($timezone !== null ? 'LLL' : 'LL');
    }

    /**
     * Le gabarit actif de l'éditeur du super-admin, s'il y en a un pour ce code, ce canal et
     * cette langue. Null : `lang/` s'applique.
     *
     * @param  array<string, mixed>  $params
     * @param  array<string, string>  $formatted
     */
    private function fromTemplate(
        NotificationCode $code,
        array $params,
        array $formatted,
        string $locale,
        string $surface,
        ?string $firstName,
    ): ?string {
        $event = $code->templateEvent();
        if ($event === null || ! in_array($surface, ['mail_subject', 'mail_body', 'sms'], true)) {
            return null;
        }

        $rendered = $this->templates->renderActive(
            $event,
            $surface === 'sms' ? 'sms' : 'email',
            $locale,
            $this->templateData($event, $params, $formatted, $locale, (string) $firstName),
            ['subject' => null, 'body' => null],
        );

        $value = $surface === 'mail_subject' ? $rendered['subject'] : $rendered['body'];

        return is_string($value) && $value !== '' ? $value : null;
    }

    /**
     * Les variables qu'un gabarit de l'éditeur connaît ({@see EditableNotificationEvents}).
     *
     * @param  array<string, mixed>  $params
     * @param  array<string, string>  $formatted
     * @return array<string, mixed>
     */
    private function templateData(string $event, array $params, array $formatted, string $locale, string $firstName): array
    {
        $user = ['first_name' => $firstName];

        return match ($event) {
            'booking_confirmed' => [
                'booking' => [
                    'code' => $formatted['reference'] ?? '',
                    'start_date' => $formatted['start_date'] ?? '',
                    'end_date' => $formatted['end_date'] ?? '',
                ],
                'user' => $user,
                'property' => ['title' => $formatted['property'] ?? ''],
            ],
            'payment_received' => [
                'payment' => [
                    'amount' => $this->number((float) ($params['amount']['amount'] ?? 0), $locale),
                    'currency' => (string) ($params['amount']['currency'] ?? ''),
                ],
                'user' => $user,
            ],
            'maintenance_created' => [
                'maintenance' => ['reference' => $formatted['reference'] ?? ''],
                'property' => ['title' => $formatted['property'] ?? ''],
                'user' => $user,
            ],
            default => ['user' => $user],
        };
    }

    private function number(float $value, string $locale): string
    {
        $formatter = new NumberFormatter($locale, NumberFormatter::DECIMAL);

        return (string) $formatter->format($value);
    }
}
