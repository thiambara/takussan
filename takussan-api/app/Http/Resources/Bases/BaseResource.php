<?php

namespace App\Http\Resources\Bases;

use BackedEnum;
use Carbon\Carbon;
use DateTimeInterface;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Lang;

abstract class BaseResource extends JsonResource
{
    /**
     * Un INSTANT sur le fil : `2026-08-17T12:34:56+00:00` (ADR-0018).
     *
     * **Le `->utc()` n'est pas décoratif.** `format(ATOM)` conserve le décalage LOCAL de
     * l'instance : sur un Carbon en `Europe/Paris`, il rendait `…T14:34:56+02:00`. L'instant
     * restait juste, mais la chaîne cessait d'être comparable lexicographiquement à ses voisines
     * — un tri de dates redevient faux sans qu'aucune valeur ne soit fausse. Le trou était fermé
     * par `config/app.php` → `'timezone' => 'UTC'`, c'est-à-dire par une valeur de configuration
     * et non par le code. Il l'est désormais ici.
     *
     * `Carbon::instance()` construit une NOUVELLE instance : `$date->utc()` seul muterait le
     * Carbon reçu, donc l'attribut du modèle. Un helper de sérialisation ne modifie pas ce qu'il
     * sérialise. `tests/Unit/Http/Resources/DateRepresentationTest.php` fige les deux points.
     */
    protected function iso(?DateTimeInterface $date): ?string
    {
        return $date === null
            ? null
            : Carbon::instance($date)->utc()->format(DateTimeInterface::ATOM);
    }

    /**
     * Une DATE CALENDAIRE sur le fil : `2026-08-17` (ADR-0018).
     *
     * À employer pour tout attribut casté `date` — `due_date`, `period_start`, `issue_date`. Ces
     * champs portent une intention métier SANS heure : leur ajouter `T00:00:00` et un fuseau
     * ajoute une précision fausse. Le dépôt a payé le cas : `PlatformPayoutResource` émettait
     * `period_start` (casté `date`) par `iso()`, quand `PayoutResource` et
     * `BankStatementResource` émettaient le même champ, sur le même cast, en `2026-08-17`.
     *
     * Deux appelants du front comparent ces valeurs LITTÉRALEMENT — `src/lib/schemas/payment.ts`
     * (`due_date < issue_date`, comparaison lexicographique) et
     * `src/components/leases/LeaseRenewalDialog.tsx` (égalité avec la valeur d'un
     * `<input type="date">`, toujours `YYYY-MM-DD`). Les convertir les casserait en silence.
     *
     * Pas de `->utc()` ici, délibérément : convertir le fuseau d'une date sans heure peut la
     * faire changer de JOUR, ce qui est précisément l'erreur que cette séparation évite.
     */
    protected function calendarDate(?DateTimeInterface $date): ?string
    {
        return $date?->format('Y-m-d');
    }

    protected function enumValue(?BackedEnum $enum): string|int|null
    {
        return $enum?->value;
    }

    protected function enumLabel(?BackedEnum $enum, string $group, string $locale = 'fr'): ?string
    {
        if ($enum === null) {
            return null;
        }

        $key = "{$group}.{$enum->value}";
        $translation = Lang::get($key, [], $locale);

        return $translation === $key ? null : $translation;
    }

    protected function mediaUrl(string $collection, ?string $conversion = null): ?string
    {
        if ($this->resource === null || ! method_exists($this->resource, 'getFirstMediaUrl')) {
            return null;
        }

        $url = $conversion !== null
            ? $this->resource->getFirstMediaUrl($collection, $conversion)
            : $this->resource->getFirstMediaUrl($collection);

        return $url !== '' ? $url : null;
    }
}
