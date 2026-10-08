<?php

namespace App\Services\Webhooks;

/**
 * TCK-602 (ADR-0051 §4) — la VUE d'un webhook entrant, celle que lit la console : une liste
 * blanche de champs par canal et fournisseur. Ce qui n'y figure pas n'y entre pas ; un numéro y
 * garde ses 4 derniers chiffres ; un nom, un e-mail, un texte libre n'y entrent jamais.
 *
 * Une dernière passe, sur tout ce qui a traversé la liste, masque encore toute suite de 9 chiffres
 * ou plus et toute adresse e-mail : une liste blanche se trompe d'un champ, la passe rattrape la
 * valeur (défense en profondeur, AC6).
 *
 * Les chemins sont pointés ; `*` vaut pour toute clé d'une liste.
 */
final class WebhookPayloadRedactor
{
    /** Le champ est gardé tel quel (après la passe finale). */
    private const KEEP = 'keep';

    /** Le champ est un numéro : seuls ses 4 derniers chiffres restent. */
    private const PHONE = 'phone';

    /**
     * @var array<string, array<string, array<string, self::KEEP|self::PHONE>>>
     */
    private const WHITELIST = [
        'payment' => [
            'wave' => [
                'type' => self::KEEP,
                'data.id' => self::KEEP,
                'data.amount' => self::KEEP,
                'data.currency' => self::KEEP,
                'data.payment_status' => self::KEEP,
                'data.checkout_status' => self::KEEP,
                'data.client_reference' => self::KEEP,
            ],
            'orange_money' => [
                'status' => self::KEEP,
                'pay_token' => self::KEEP,
                'txnid' => self::KEEP,
                'amount' => self::KEEP,
                'currency' => self::KEEP,
            ],
            'lemon_squeezy' => [
                'meta.event_name' => self::KEEP,
                'meta.custom_data.payment_id' => self::KEEP,
                'meta.custom_data.payment_type' => self::KEEP,
                'data.id' => self::KEEP,
                'data.type' => self::KEEP,
                'data.attributes.status' => self::KEEP,
                'data.attributes.identifier' => self::KEEP,
                'data.attributes.total' => self::KEEP,
                'data.attributes.currency' => self::KEEP,
            ],
        ],
        'sms' => [
            'orange' => [
                'deliveryInfoNotification.deliveryInfo.deliveryStatus' => self::KEEP,
                'deliveryInfoNotification.deliveryInfo.address' => self::PHONE,
                'deliveryInfoNotification.callbackData' => self::KEEP,
            ],
            'mtarget' => [
                'MsgId' => self::KEEP,
                'Status' => self::KEEP,
                'StatusText' => self::KEEP,
                'DestinationAdress' => self::PHONE,
                'DeliveryDateTime' => self::KEEP,
            ],
            'lafricamobile' => [
                'push_id' => self::KEEP,
                'ret_id' => self::KEEP,
                'status' => self::KEEP,
                'to' => self::PHONE,
            ],
        ],
        'whatsapp' => [
            'whatsapp_cloud' => [
                'entry.*.changes.*.field' => self::KEEP,
                'entry.*.changes.*.value.statuses.*.id' => self::KEEP,
                'entry.*.changes.*.value.statuses.*.status' => self::KEEP,
                'entry.*.changes.*.value.statuses.*.timestamp' => self::KEEP,
                'entry.*.changes.*.value.statuses.*.recipient_id' => self::PHONE,
                'entry.*.changes.*.value.statuses.*.errors.*.code' => self::KEEP,
            ],
        ],
    ];

    /**
     * @param  array<array-key, mixed>  $data  le corps décodé (JSON, formulaire ou requête GET)
     * @return array<string, mixed>
     */
    public function redact(string $channel, string $provider, array $data): array
    {
        $rules = self::WHITELIST[$channel][$provider] ?? [];
        $view = [];

        foreach ($rules as $path => $kind) {
            foreach ($this->extract($data, explode('.', $path), []) as [$concretePath, $value]) {
                if (is_array($value) || is_object($value)) {
                    continue;
                }
                $value = $kind === self::PHONE ? self::maskPhone((string) $value) : $value;
                data_set($view, implode('.', $concretePath), self::scrub($value));
            }
        }

        return $view;
    }

    /** Un numéro réduit à ses 4 derniers chiffres : `221771234567` → `••••4567`. */
    public static function maskPhone(string $value): string
    {
        $digits = preg_replace('/\D+/', '', $value) ?? '';

        return $digits === '' ? '••••' : '••••'.substr($digits, -4);
    }

    /** La passe finale : aucune suite de 9 chiffres ou plus, aucune adresse e-mail. */
    private static function scrub(mixed $value): mixed
    {
        if (! is_string($value)) {
            return $value;
        }

        $value = preg_replace('/[^\s@<>"\']+@[^\s@<>"\']+\.[a-z]{2,}/i', '[email]', $value) ?? '';

        return preg_replace_callback('/\+?\d[\d\s.\-]{7,}\d/', function (array $m): string {
            $digits = preg_replace('/\D+/', '', $m[0]) ?? '';

            return strlen($digits) >= 9 ? '••••'.substr($digits, -4) : $m[0];
        }, $value) ?? '';
    }

    /**
     * @param  array<array-key, mixed>|mixed  $data
     * @param  list<string>  $segments
     * @param  list<string>  $prefix
     * @return list<array{0: list<string>, 1: mixed}>
     */
    private function extract(mixed $data, array $segments, array $prefix): array
    {
        if ($segments === []) {
            return [[$prefix, $data]];
        }
        if (! is_array($data)) {
            return [];
        }

        $segment = array_shift($segments);
        if ($segment === '*') {
            $found = [];
            foreach ($data as $key => $child) {
                array_push($found, ...$this->extract($child, $segments, [...$prefix, (string) $key]));
            }

            return $found;
        }

        return array_key_exists($segment, $data) ? $this->extract($data[$segment], $segments, [...$prefix, $segment]) : [];
    }
}
