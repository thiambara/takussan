<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Services\Dashboard\CollectedPayments;
use App\Services\Payments\PaymentHistory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Pagination\LengthAwarePaginator;

/**
 * GET /api/payments/history — consolidated history across BookingPayment and LeasePayment.
 *
 * TCK-940 (P46.01) — `POST /api/payments`, le routeur unifié, est retiré : un paiement se crée par
 * les voies imbriquées du bail et de la réservation, sous leurs policies.
 */
class PaymentController extends Controller
{
    public function __construct(
        private readonly PaymentHistory $history,
    ) {}

    /**
     * Consolidated payment history across BookingPayments and LeasePayments.
     *
     * Supported filters:
     *   - filter[entity_type]={property|lease|customer|booking}
     *   - filter[entity_id]=<id>
     *   - filter[status]=<PaymentStatus>
     *   - filter[date_from]=YYYY-MM-DD
     *   - filter[date_to]=YYYY-MM-DD — avec `date_from` : `paid_at` OU `period_start` dans la borne
     *   - filter[paid_from]=YYYY-MM-DD, filter[paid_to]=YYYY-MM-DD — l'ENCAISSÉ : `paid_at` seul
     *     (refus de TCK-2659, M1), le sens de la tuile « Encaissé en <mois> »
     *   - per_page=<int> (default 20, max 100)
     *   - sort=-date|date|-amount|amount (default -date)
     *
     * TCK-2657 — à la demande, et rien de plus sans eux (la ligne garde sa forme d'avant) :
     *   - include=payer,property,landlord,reminders — `payer {id, name, phone}`, `property {id, title,
     *     reference_number}`, `landlord {id, name}`
     *   - filter[payer_id], filter[landlord_id], filter[payment_method]=wave,cash,
     *     filter[search], filter[days_late_min], filter[days_late_max] ; sort=days_late|-days_late
     *   - dès qu'un de ces paramètres est passé, chaque ligne porte `days_late` (entier ≥ 1 sur une
     *     échéance due et échue, `null` sinon et sur une réservation).
     */
    public function history(Request $request): JsonResponse
    {
        // TCK-2721 — la sélection vit dans `PaymentHistory`, que l'export du registre lit aussi.
        $includes = $this->history->requestedIncludes($request);
        $selection = $this->history->select(
            $request->user(),
            (array) $request->input('filter', []),
            $includes,
            PaymentHistory::sort($request->input('sort', '-date')),
            PaymentHistory::HARD_LIMIT,
        );
        $merged = $selection['rows'];
        $truncated = $selection['truncated'];
        $leasePayments = $selection['lease_payments'];

        // Pagination
        $perPage = min(max((int) $request->input('per_page', 20), 1), 100);
        $page = max((int) $request->input('page', 1), 1);

        $total = $merged->count();
        $items = $merged->slice(($page - 1) * $perPage, $perPage)->values();
        // TCK-2658 — la dernière relance et leur compte, pour la seule page rendue (une requête).
        if (in_array('reminders', $includes, true)) {
            $items = $this->history->withReminders($request->user(), $items, $leasePayments);
        }

        // Totals across the (potentially truncated) filtered dataset.
        $totals = [
            'count' => $total,
            'amount' => round((float) $merged->sum('amount'), 2),
            'paid_amount' => round((float) $merged->sum('paid_amount'), 2),
            'remaining_amount' => round((float) $merged->sum('remaining_amount'), 2),
        ];
        // TCK-2733 — le registre garde les cautions, que la tuile « Encaissé » exclut : il en dit la
        // part, sur la même sélection (avant la page, troncature comprise).
        $cautions = $merged->filter(fn (array $row): bool => ($row['source'] ?? null) === 'lease'
            && in_array($row['payment_type'] ?? null, CollectedPayments::depositTypeValues(), true));
        $totals['deposits_count'] = $cautions->count();
        $totals['deposits_amount'] = round((float) $cautions->sum('paid_amount'), 2);

        $paginator = new LengthAwarePaginator(
            items: $items,
            total: $total,
            perPage: $perPage,
            currentPage: $page,
        );

        return $this->json([
            'data' => $items->all(),
            'meta' => $this->paginationMeta($paginator, [
                'totals' => $totals,
                'truncated' => $truncated,
                'limit' => PaymentHistory::HARD_LIMIT,
            ]),
        ]);
    }
}
