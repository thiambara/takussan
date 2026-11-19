<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Commitment\ListCommitmentsRequest;
use App\Http\Resources\CommitmentResource;
use App\Models\Commitment;
use App\Models\Enums\CommitmentStatus;
use App\Models\User;
use App\Rules\PersonnelDeLAgence;
use App\Services\Messaging\ConversationAccess;
use App\Services\Messaging\FileDuFil;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;

/**
 * TCK-2987 (ADR-0130 § 6) — `GET /api/commitments` : l'onglet « Engagements », hors des fils.
 *
 *  - les engagements des fils que le lecteur L LIT (`ConversationAccess::participatingQuery`), jamais
 *    d'un autre ;
 *  - `filter[role]=owed` : ceux qu'on lui doit — le porteur n'est pas de son côté, et L en est le
 *    bénéficiaire ou du personnel de l'agence. Le côté est la règle de TCK-2967 : le personnel actif de
 *    l'agence forme l'équipe (`FileDuFil::personnelDe`), tout autre lecteur est seul de son côté ;
 *  - `filter[role]=mine` : L en est le porteur ;
 *  - `filter[etat]` : l'état dérivé, jugé en SQL (« en retard » = `open` et échu).
 *
 * `meta.counts` (`owed`, `mine`, `late`) sans les filtres de la requête. En retard d'abord, puis par
 * échéance. Un nombre de requêtes constant : relations chargées en lot, et aucune garde par ligne.
 */
class CommitmentListController extends Controller
{
    public function index(ListCommitmentsRequest $request): JsonResponse
    {
        $lecteur = $request->user();
        $maintenant = now();

        $base = Commitment::query()
            ->whereIn('commitments.conversation_id', app(ConversationAccess::class)->participatingQuery($lecteur)->select('conversations.id'));

        $role = $request->validated('filter.role');
        $etat = $request->validated('filter.etat');

        $page = (clone $base)
            ->where(fn (Builder $q) => match ($role) {
                null => $q->where(fn (Builder $r) => $this->owed($r, $lecteur))->orWhere(fn (Builder $r) => $this->mine($r, $lecteur)),
                'owed' => $this->owed($q, $lecteur),
                'mine' => $this->mine($q, $lecteur),
                default => $q->whereRaw('1 = 0'),
            })
            ->when($etat !== null, fn (Builder $q) => $this->etat($q, (string) $etat, $maintenant))
            ->with(['conversation', 'holder', 'beneficiary'])
            ->orderByRaw('CASE WHEN commitments.status = ? AND commitments.due_at < ? THEN 0 ELSE 1 END', [CommitmentStatus::Open->value, $maintenant])
            ->orderBy('commitments.due_at')
            ->orderBy('commitments.id')
            ->paginate((int) ($request->validated('per_page') ?? 20));

        $data = $page->getCollection()
            ->map(fn (Commitment $e) => [
                // Sans `abilities` : les gestes se font dans le fil, où la carte les rend ; les juger ici
                // coûterait une garde d'écriture par ligne (requêtes constantes, AC5).
                ...CommitmentResource::make($e)->resolve($request),
                // Le titre du fil tel que la liste des fils le rend (`subject`).
                'conversation' => ['id' => (int) $e->conversation_id, 'title' => $e->conversation?->subject],
            ])
            ->all();

        return $this->paginated($page, $data, ['counts' => [
            'owed' => (clone $base)->where(fn (Builder $q) => $this->owed($q, $lecteur))->count(),
            'mine' => (clone $base)->where(fn (Builder $q) => $this->mine($q, $lecteur))->count(),
            'late' => (clone $base)
                ->where(fn (Builder $q) => $q->where(fn (Builder $r) => $this->owed($r, $lecteur))->orWhere(fn (Builder $r) => $this->mine($r, $lecteur)))
                ->where(fn (Builder $q) => $this->etat($q, 'late', $maintenant))
                ->count(),
        ]]);
    }

    /** Ceux qu'on doit à L : porteur hors de son côté, et L bénéficiaire ou personnel de l'agence. */
    private function owed(Builder $q, User $lecteur): void
    {
        $q->where('commitments.holder_id', '!=', $lecteur->id);
        $agences = PersonnelDeLAgence::agencesOuPersonnelActif($lecteur);

        $q->where(function (Builder $o) use ($lecteur, $agences): void {
            // Hors des agences où L est du personnel : il est seul de son côté, et ce qu'on lui doit est
            // ce dont il est le bénéficiaire.
            $o->where(fn (Builder $b) => $b
                ->where('commitments.beneficiary_id', $lecteur->id)
                ->when($agences !== [], fn (Builder $x) => $x->whereNotIn('commitments.agency_id', $agences)));
            // Dans son agence : le personnel suit tout engagement dont le porteur n'est pas de l'équipe.
            foreach ($agences as $agence) {
                $o->orWhere(fn (Builder $a) => $a
                    ->where('commitments.agency_id', $agence)
                    ->whereNotIn('commitments.holder_id', FileDuFil::personnelDe($agence)));
            }
        });
    }

    private function mine(Builder $q, User $lecteur): void
    {
        $q->where('commitments.holder_id', $lecteur->id);
    }

    /** L'état dérivé, en SQL ; une valeur hors liste ne rend rien. */
    private function etat(Builder $q, string $etat, mixed $maintenant): void
    {
        match ($etat) {
            'late' => $q->where('commitments.status', CommitmentStatus::Open->value)->where('commitments.due_at', '<', $maintenant),
            'open' => $q->where('commitments.status', CommitmentStatus::Open->value)->where('commitments.due_at', '>=', $maintenant),
            'proposed', 'kept', 'cancelled' => $q->where('commitments.status', $etat),
            default => $q->whereRaw('1 = 0'),
        };
    }
}
