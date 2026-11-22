<?php

namespace App\Services\Radar;

use App\Support\RadarPhone;
use DOMAttr;
use DOMXPath;

/**
 * TCK-2465 (ADR-0087 §1, §3) — les numéros qu'une page ne porte QUE dans ses attributs : un lien `tel:` ou `sms:`, un
 * lien WhatsApp (`wa.me/<numéro>`, `api.whatsapp.com/send?phone=`, `web.whatsapp.com/send?phone=`,
 * `whatsapp://send?phone=`), où qu'il soit écrit (un `href`, ou une URL rangée dans un `data-*` comme
 * `data-whatsapp`), et la valeur d'un attribut `data-*phone*` / `data-mobile`. Relevé sur CoinAfrique le 2026-11-04 :
 * le numéro de l'annonceur n'est QUE là, le texte de la page ne le porte pas.
 *
 * Chaque numéro passe par `RadarPhone::canonical()` : E.164 sénégalais, ou rien (un sélecteur CSS rangé dans un
 * `data-…-phone-container`, un numéro étranger). Dans l'ordre de la page, sans doublon.
 *
 * `organizationPhones()` : les numéros du JSON-LD `Organization` (et de ses `contactPoint`), ceux du SITE lui-même —
 * jamais ceux d'un annonceur. Le HTML vient d'un site tiers : rien n'en est suivi ni exécuté.
 */
final class PagePhones
{
    /** Le numéro d'un lien WhatsApp : le paramètre `phone`, ou le chemin de `wa.me`. */
    private const WHATSAPP_URL = '~^(?:https?://(?:[a-z0-9-]+\.)*(?:wa\.me|whatsapp\.com)/|whatsapp://)~i';

    /**
     * @return list<string>
     */
    public static function fromDom(DOMXPath $xpath): array
    {
        $phones = [];
        foreach ($xpath->query('//@*') ?: [] as $attribute) {
            if (! $attribute instanceof DOMAttr) {
                continue;
            }
            $phone = self::fromAttribute($attribute->name, $attribute->value);
            if ($phone !== null) {
                $phones[$phone] = true;
            }
        }

        return array_keys($phones);
    }

    /** Le numéro que porte un attribut, en E.164, ou null. */
    public static function fromAttribute(string $name, string $value): ?string
    {
        $name = strtolower($name);
        $value = trim(html_entity_decode($value, ENT_QUOTES | ENT_HTML5, 'UTF-8'));
        if ($value === '') {
            return null;
        }

        if (preg_match('~^(?:tel|sms):(.+)$~i', $value, $m) === 1) {
            return RadarPhone::canonical(rawurldecode(explode('?', $m[1])[0]));
        }

        if (preg_match(self::WHATSAPP_URL, $value) === 1) {
            return self::fromWhatsappUrl($value);
        }

        if (str_starts_with($name, 'data-') && (str_contains($name, 'phone') || str_contains($name, 'mobile'))) {
            return RadarPhone::canonical($value);
        }

        return null;
    }

    /**
     * Les numéros du site lui-même : `telephone` des nœuds JSON-LD dont le `@type` est `Organization`, à toute
     * profondeur de ces nœuds (`contactPoint` compris).
     *
     * @return list<string>
     */
    public static function organizationPhones(DOMXPath $xpath): array
    {
        $phones = [];
        foreach ($xpath->query('//script[@type="application/ld+json"]') ?: [] as $script) {
            $data = json_decode((string) $script->textContent, true);
            if (is_array($data)) {
                self::collectOrganizations($data, $phones, false, 0);
            }
        }

        return array_keys($phones);
    }

    private static function fromWhatsappUrl(string $url): ?string
    {
        $query = (string) parse_url($url, PHP_URL_QUERY);
        parse_str($query, $params);
        if (isset($params['phone']) && is_string($params['phone'])) {
            return RadarPhone::canonical($params['phone']);
        }

        if (preg_match('~^https?://(?:[a-z0-9-]+\.)*wa\.me/([^/?#]+)~i', $url, $m) === 1) {
            return RadarPhone::canonical(rawurldecode($m[1]));
        }

        return null;
    }

    /**
     * @param  array<mixed>  $node
     * @param  array<string, true>  $out
     */
    private static function collectOrganizations(array $node, array &$out, bool $inOrganization, int $depth): void
    {
        if ($depth > 10) {
            return;
        }

        $types = (array) ($node['@type'] ?? []);
        $inOrganization = $inOrganization || in_array('Organization', $types, true);

        foreach ($node as $key => $value) {
            if ($inOrganization && $key === 'telephone') {
                foreach ((array) $value as $raw) {
                    $phone = is_string($raw) ? RadarPhone::canonical($raw) : null;
                    if ($phone !== null) {
                        $out[$phone] = true;
                    }
                }
            } elseif (is_array($value)) {
                self::collectOrganizations($value, $out, $inOrganization, $depth + 1);
            }
        }
    }
}
