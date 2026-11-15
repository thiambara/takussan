<?php

namespace App\Sorts;

use App\Services\Messaging\MessagingRelation;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use Spatie\QueryBuilder\Sorts\Sort;

/**
 * TCK-2745 — `sort=-last_exchange_at` sur `GET /api/conversations/contacts` : les personnes par leur
 * dernier échange AVEC L'APPELANT — le `last_message_at` le plus récent des fils qu'il voit
 * ({@see MessagingRelation::filsVisibles()}) et où la personne figure. Un fil entre la personne et
 * un collègue ne compte pas : il ne dit rien de « mes » échanges, et il les trahirait.
 *
 * Un fil quitté, dont il a été retiré, ou d'une agence fermée au bailleur parti n'en est pas.
 *
 * Pas `customers.last_contacted_at` : la fiche ne le rend qu'à qui lit les visites
 * (`CustomerResource::readsVisits`) — un tri sur lui serait un oracle.
 *
 * Sans échange, la personne vient en DERNIER dans les deux sens (`NULLS LAST`), puis par identifiant.
 */
class LastExchangeSort implements Sort
{
    public function __construct(private readonly MessagingRelation $relation) {}

    public function __invoke(Builder $query, bool $descending, string $property): void
    {
        $dernier = DB::table('conversation_participants as lx')
            ->join('conversations as cx', 'cx.id', '=', 'lx.conversation_id')
            ->selectRaw('MAX(cx.last_message_at)')
            ->whereColumn('lx.user_id', 'users.id')
            ->whereIn('cx.id', $this->relation->filsVisibles()->toBase());

        $query->orderByRaw('('.$dernier->toSql().') '.($descending ? 'DESC' : 'ASC').' NULLS LAST', $dernier->getBindings())
            ->orderBy('users.id');
    }
}
