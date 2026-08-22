<?php

namespace Tests\Support;

/**
 * Reconnaître une date **à sa forme**, jamais à son nom de clé — TCK-327 / ADR-0018.
 *
 * `scripts/check-resource-date-format.mjs` part du nom (`*_at`, `*_date`, `*_since`…) : c'est un
 * plancher, et il laisse passer tout ce qu'on n'a pas pensé à nommer. Cette classe-ci part de la
 * VALEUR. Elle répond à deux questions distinctes, et l'ordre compte :
 *
 * 1. *cette chaîne ressemble-t-elle à une date ?* — {@see self::ressembleAUneDate()} ;
 * 2. *si oui, est-elle sous l'une des deux formes d'ADR-0018 ?* — {@see self::estConforme()}.
 *
 * **Le point délicat est la première question, pas la seconde.** Une reconnaissance trop large
 * crie sur un numéro de version ou un identifiant, et la garde finit désarmée pour cause de faux
 * positifs — c'est-à-dire supprimée. Une reconnaissance trop étroite ne voit rien et affiche un
 * vert creux. Le compromis retenu est l'**ancrage** : la chaîne entière doit être une date, ou
 * commencer par une date suivie d'une heure. Une date noyée dans une phrase n'est donc PAS vue —
 * c'est une limite assumée, écrite ici pour qu'on ne la découvre pas à l'usage.
 *
 * Les quatre formes que ce dépôt a réellement payées et que la reconnaissance doit attraper :
 * `2026-08-17T12:34:56.000000Z` (Carbon `toISOString`, l'ancienne majorité),
 * `2026-08-17 12:34:56` (chaîne SQL brute d'un `selectRaw`, la « cinquième forme »),
 * `2026-08-17T12:34:56Z`, et `17/08/2026`.
 *
 * ⚠ **Ce qu'elle ne peut pas voir, par construction** : un horodatage Unix. `1755434096` est
 * indiscernable d'un identifiant ou d'un montant en centimes — aucune forme ne les sépare. Le
 * dépôt n'en émet aucun aujourd'hui ; le jour où il en émettrait un, ce dispositif serait muet.
 */
final class WireDateForm
{
    /** Un INSTANT sur le fil, et rien d'autre : `2026-08-17T12:34:56+00:00`. */
    public const INSTANT = '/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+00:00$/';

    /** Un JOUR CALENDAIRE sur le fil, et rien d'autre : `2026-08-17`. */
    public const JOUR = '/^\d{4}-\d{2}-\d{2}$/';

    /**
     * Les formes qui font d'une chaîne une date PRÉSUMÉE. Toutes ancrées.
     *
     * @var array<int,string>
     */
    private const SUSPECTES = [
        // ISO-ish : `2026-08-17`, `2026-08-17 12:34:56`, `2026-08-17T12:34:56.000000Z`, …
        '/^\d{4}-\d{2}-\d{2}([T ].*)?$/',
        // jour/mois/année ou jour-mois-année : `17/08/2026`, `17-08-2026`
        '/^\d{1,2}[\/-]\d{1,2}[\/-]\d{4}([T ,].*)?$/',
        // année/mois/jour : `2026/08/17`
        '/^\d{4}\/\d{1,2}\/\d{1,2}([T ,].*)?$/',
        // une heure seule : `12:34:56`
        '/^\d{1,2}:\d{2}(:\d{2})?(\.\d+)?$/',
        // RFC 2822 / `toRfc…String()` : `Mon, 17 Aug 2026 12:34:56 +0000`
        '/^(mon|tue|wed|thu|fri|sat|sun|lun|mar|mer|jeu|ven|sam|dim)[a-zé]*,?\s+\d{1,2}\s+\p{L}/iu',
        // date en toutes lettres : `17 August 2026`, `17 août 2026`
        '/^\d{1,2}\s+\p{L}{3,10}\.?\s+\d{4}([T ,].*)?$/u',
    ];

    public static function ressembleAUneDate(string $valeur): bool
    {
        $valeur = trim($valeur);

        if ($valeur === '') {
            return false;
        }

        foreach (self::SUSPECTES as $motif) {
            if (preg_match($motif, $valeur) === 1) {
                return true;
            }
        }

        return false;
    }

    public static function estConforme(string $valeur): bool
    {
        return preg_match(self::INSTANT, $valeur) === 1
            || preg_match(self::JOUR, $valeur) === 1;
    }

    /**
     * `null` si la valeur n'est pas une date ou l'est sous une forme conforme ; sinon le motif
     * écrit de l'écart, prêt à être affiché dans un message d'échec.
     */
    public static function ecart(string $valeur): ?string
    {
        if (! self::ressembleAUneDate($valeur) || self::estConforme($valeur)) {
            return null;
        }

        return match (true) {
            str_contains($valeur, '.') && str_ends_with($valeur, 'Z') => 'c\'est la forme `…T12:34:56.000000Z` de Carbon::toISOString() — '
                .'ADR-0018 l\'a écartée le 2026-08-17 : microsecondes fausses et suffixe `Z` au lieu de `+00:00`',
            str_ends_with($valeur, 'Z') => 'le suffixe `Z` n\'est pas le suffixe d\'ADR-0018 : `+00:00`',
            (bool) preg_match('/^\d{4}-\d{2}-\d{2} /', $valeur) => 'c\'est une chaîne SQL BRUTE, jamais convertie — '
                .'`new Date("2026-08-17 12:34:56")` est lu comme une heure LOCALE par le navigateur : '
                .'2 h d\'écart sous TZ=Europe/Paris, 0 sous TZ=UTC, donc invisible ici et faux chez l\'utilisateur',
            default => 'aucune des deux formes d\'ADR-0018',
        };
    }
}
