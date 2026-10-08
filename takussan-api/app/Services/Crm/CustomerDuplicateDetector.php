<?php

namespace App\Services\Crm;

use App\Models\Customer;
use App\Models\User;
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
