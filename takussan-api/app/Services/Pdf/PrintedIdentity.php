<?php

namespace App\Services\Pdf;

use App\Models\Address;
use App\Models\Property;
use Illuminate\Database\Eloquent\Model;

/**
 * P140.02 (TCK-1792) — les identités qu'un acte délivré imprime (quittance, reçu de réservation,
 * état des lieux signé), figées au fait qu'il atteste : l'acquittement de l'échéance ou du
 * paiement, la seconde signature de l'état des lieux. Elles se rangent dans `metadata` sous
 * {@see self::KEY}, et le rendu les rend sur des COPIES en mémoire des modèles qu'il passe au
 * gabarit : les gabarits ne changent pas, et rien n'est écrit sur les lignes courantes.
 *
 * Ce qui est figé est ce que les gabarits lisent, et lui seul : nom et courriel d'une personne,
 * titre et adresse d'un bien, nom de l'agence. Le logo de l'agence reste recomposé (P109.04).
 * Un acte acquitté ou signé avant ce ticket n'a pas d'instantané : il imprime les valeurs
 * courantes, comme avant.
 */
final class PrintedIdentity
{
    public const KEY = 'printed_identity';

    /**
     * P234.06 (TCK-2315) — la raison sociale du bailleur société, figée à côté des rôles : ce n'est
     * pas une colonne d'un modèle, mais `owner_profiles.metadata.company_name` de son profil dans
     * l'agence.
     */
    public const LANDLORD_COMPANY = 'landlord_company_name';

    /** Les attributs d'une personne (locataire, client, bailleur) que les gabarits impriment. */
    private const PERSON = ['first_name', 'last_name', 'name', 'email'];

    /** Les composantes de `Address::full_address`, un accesseur : on fige ses parts. */
    private const ADDRESS = ['street', 'neighborhood', 'postal_code', 'city', 'region', 'country'];

    /**
     * @param  array<string, Model|null>  $roles  `tenant`, `customer`, `landlord`, `property`, `agency`
     * @return array<string, array<string, mixed>|null>
     */
    public static function capture(array $roles): array
    {
        $snapshot = [];
        foreach ($roles as $role => $model) {
            $snapshot[$role] = match (true) {
                $model === null => null,
                $model instanceof Property => [
                    'title' => $model->getAttributes()['title'] ?? null,
                    'address' => $model->address !== null ? self::raw($model->address, self::ADDRESS) : null,
                ],
                $role === 'agency' => ['name' => $model->getAttributes()['name'] ?? null],
                default => self::raw($model, self::PERSON),
            };
        }

        return $snapshot;
    }

    /**
     * Les modèles à passer au gabarit : des copies portant l'instantané quand `$metadata` en a un,
     * les modèles tels quels sinon. Un rôle absent de l'instantané reste tel quel.
     *
     * @param  array<string, Model|null>  $roles
     * @return array<string, Model|null>
     */
    public static function restore(mixed $metadata, array $roles): array
    {
        $snapshot = self::snapshot($metadata);
        if ($snapshot === null) {
            return $roles;
        }

        foreach ($roles as $role => $model) {
            if ($model === null || ! is_array($snapshot[$role] ?? null)) {
                continue;
            }
            $values = $snapshot[$role];
            $copy = clone $model;

            if ($copy instanceof Property) {
                $copy->forceFill(['title' => $values['title'] ?? null]);
                $address = is_array($values['address'] ?? null)
                    ? ($copy->address !== null ? clone $copy->address : new Address)->forceFill($values['address'])
                    : null;
                $copy->setRelation('address', $address);
            } else {
                $copy->forceFill($values);
            }

            $roles[$role] = $copy;
        }

        return $roles;
    }

    /**
     * P234.06 (TCK-2315) — la raison sociale à imprimer : celle de l'instantané quand l'acte en a un
     * (un acte figé sans elle n'en imprime aucune), `$current` sinon, comme les autres identités.
     */
    public static function landlordCompany(mixed $metadata, ?string $current): ?string
    {
        $snapshot = self::snapshot($metadata);
        if ($snapshot === null) {
            return $current;
        }

        return is_string($snapshot[self::LANDLORD_COMPANY] ?? null) ? $snapshot[self::LANDLORD_COMPANY] : null;
    }

    /**
     * P234.06 (TCK-2315) — le rôle a-t-il été figé ABSENT ? L'instantané le porte à `null` : l'acte
     * l'a été sans lui, et l'imprimer maintenant changerait ce qui a été signé.
     */
    public static function frozenAbsent(mixed $metadata, string $role): bool
    {
        $snapshot = self::snapshot($metadata);

        return $snapshot !== null && array_key_exists($role, $snapshot) && $snapshot[$role] === null;
    }

    /** @return array<string, mixed>|null */
    private static function snapshot(mixed $metadata): ?array
    {
        return is_array($metadata) && is_array($metadata[self::KEY] ?? null) ? $metadata[self::KEY] : null;
    }

    /**
     * Les valeurs BRUTES des seules colonnes présentes : un accesseur (`User::name`) ne s'y mêle
     * pas, et une colonne qu'un modèle n'a pas n'est pas inventée.
     *
     * @param  list<string>  $keys
     * @return array<string, mixed>
     */
    private static function raw(Model $model, array $keys): array
    {
        return array_intersect_key($model->getAttributes(), array_flip($keys));
    }
}
