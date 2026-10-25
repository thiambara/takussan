<?php

namespace App\Services\Crm;

use App\Models\Customer;
use App\Models\User;
use App\Support\AdvisoryLock;
use App\Support\CaseInsensitive;
use Illuminate\Database\Eloquent\Builder;

/**
 * TCK-591 — un client existe-t-il déjà dans cette agence, au même téléphone normalisé ou au même
 * e-mail replié ?
 *
 * Les deux requêtes écrivent exactement les expressions des index `customers_agency_phone_idx` et
 * `customers_agency_email_ci_idx` (ADR-0025) — une expression différente ne les emprunterait pas.
 *
 * Le résultat ne nomme que les fiches que l'appelant a le droit de voir : à un agent sans
 * `crm.view_all`, le doublon d'un collègue se signale sans livrer son nom.
 */
class CustomerDuplicateDetector
{
    /** TCK-2054 (ADR-0073 § 2) — l'espace de nom du verrou de création d'une fiche client. */
    public const LOCK_NAMESPACE = 'crm.customer';

    /**
     * TCK-2054 (ADR-0073) — sérialise la détection d'un doublon et la création d'une fiche : verrou
     * consultatif transactionnel de clé `(agence, téléphone canonique)`, ou `(agence, e-mail replié)`
     * quand le téléphone manque — les valeurs mêmes que {@see find()} compare. À appeler dans la
     * transaction qui couvre la détection ET la création, après ses verrous de ligne.
     *
     * Sans agence, ou sans téléphone ni e-mail, rien : le détecteur ne cherche rien non plus.
     */
    public static function lockCreation(?int $agencyId, ?string $phone, ?string $email): void
    {
        $parts = self::lockParts($agencyId, $phone, $email);
        if ($parts !== null) {
            AdvisoryLock::acquire(self::LOCK_NAMESPACE, ...$parts);
        }
    }

    /** @return list<string>|null les parties de la clé, `null` quand il n'y a rien à verrouiller */
    public static function lockParts(?int $agencyId, ?string $phone, ?string $email): ?array
    {
        if ($agencyId === null) {
            return null;
        }

        $phone = CustomerPhoneNormalizer::normalize($phone);
        if ($phone !== null) {
            return [(string) $agencyId, 'tel', $phone];
        }

        $email = $email !== null && trim($email) !== '' ? CaseInsensitive::fold(trim($email)) : null;

        return $email !== null ? [(string) $agencyId, 'email', $email] : null;
    }

    /**
     * @return list<array{id: ?int, name: ?string, matched_on: string}>
     */
    public function find(?int $agencyId, ?string $phone, ?string $email, User $viewer, ?int $ignoreId = null): array
    {
        if ($agencyId === null) {
            return [];
        }

        $phone = CustomerPhoneNormalizer::normalize($phone);
        $email = $email !== null && trim($email) !== '' ? CaseInsensitive::fold(trim($email)) : null;
        if ($phone === null && $email === null) {
            return [];
        }

        $matches = Customer::query()
            ->where('agency_id', $agencyId)
            ->when($ignoreId !== null, fn (Builder $q) => $q->whereKeyNot($ignoreId))
            ->where(function (Builder $q) use ($phone, $email) {
                if ($phone !== null) {
                    $q->orWhere('phone', $phone);
                }
                if ($email !== null) {
                    $q->orWhereRaw(CaseInsensitive::sql('email').' = ?', [$email]);
                }
            })
            ->orderBy('id')
            ->limit(5)
            ->get();

        return $matches->map(function (Customer $c) use ($phone, $viewer) {
            $visible = $viewer->can('view', $c);

            return [
                'id' => $visible ? $c->id : null,
                'name' => $visible ? $c->getFullNameAttribute() : null,
                'matched_on' => $phone !== null && $c->phone === $phone ? 'phone' : 'email',
            ];
        })->values()->all();
    }
}
