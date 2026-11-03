<?php

namespace App\Models\Enums;

/** TCK-2386 (ADR-0077 §10) — le site d'où vient une annonce, déduit du nom d'hôte de son URL. */
enum RadarSourceSite: string
{
    case Coinafrique = 'coinafrique';
    case ExpatDakar = 'expat_dakar';
    case Facebook = 'facebook';
    case Whatsapp = 'whatsapp';
    case Other = 'other';

    /** Domaines reconnus : l'hôte lui-même ou l'un de ses sous-domaines, jamais un suffixe de texte. */
    private const DOMAINS = [
        'coinafrique' => ['coinafrique.com'],
        'expat_dakar' => ['expat-dakar.com'],
        'facebook' => ['facebook.com', 'fb.com'],
        'whatsapp' => ['wa.me', 'whatsapp.com'],
    ];

    public static function fromHost(string $host): self
    {
        $host = rtrim(mb_strtolower(trim($host)), '.');

        foreach (self::DOMAINS as $site => $domains) {
            foreach ($domains as $domain) {
                if ($host === $domain || str_ends_with($host, '.'.$domain)) {
                    return self::from($site);
                }
            }
        }

        return self::Other;
    }
}
