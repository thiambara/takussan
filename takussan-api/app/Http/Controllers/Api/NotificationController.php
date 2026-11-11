<?php

namespace App\Http\Controllers\Api;

use App\Domain\Notifications\NotificationClassification;
use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\ListNotificationsRequest;
use App\Http\Resources\AppNotificationResource;
use App\Models\AppNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    /** TCK-588 — `per_page` était recopié tel quel : `per_page=100000` rendait tout l'historique. */
    public const MAX_PER_PAGE = 50;

    /**
     * TCK-2633 — `filter[famille]` et `filter[a_traiter]` s'ajoutent à `filter[unread]` et se
     * cumulent, en SQL, par les listes dérivées de {@see NotificationClassification}.
     * `meta.counts` porte sur les NON LUES de l'appelant, filtres ignorés : une requête groupée
     * par `(code, type)`, repliée par la même table que la ressource.
     */
    public function index(ListNotificationsRequest $request): JsonResponse
    {
        $perPage = max(1, min(self::MAX_PER_PAGE, (int) $request->input('per_page', 20)));
        $familles = $request->familles();

        $paginator = AppNotification::where('user_id', $request->user()->id)
            ->when($request->nonLues(), fn ($query) => $query->whereNull('read_at'))
            ->when($familles !== [], fn ($query) => NotificationClassification::constrainToFamilies($query, $familles))
            ->when($request->aTraiter(), fn ($query) => NotificationClassification::constrainToAction($query))
            ->latest()
            ->latest('id')
            ->paginate($perPage);

        [$unread, $counts] = $this->unreadCounts($request->user()->id);

        return $this->json([
            'data' => AppNotificationResource::collection($paginator->items())->toArray($request),
            'meta' => $this->paginationMeta($paginator, [
                'unread' => $unread,
                'counts' => $counts,
            ]),
        ]);
    }

    /**
     * TCK-2633 — les non-lues de l'appelant, en une requête groupée : leur total (`meta.unread`,
     * inchangé), celles « à traiter », et leur nombre par famille — une famille sans non-lue est
     * absente de l'objet.
     *
     * @return array{0: int, 1: array{a_traiter_non_lues: int, par_famille: object}}
     */
    private function unreadCounts(int $userId): array
    {
        $groupes = AppNotification::query()
            ->where('user_id', $userId)
            ->whereNull('read_at')
            ->toBase()
            ->selectRaw('code, type, '.NotificationClassification::TARGET_KIND_SQL.' as target_kind, count(*) as total')
            ->groupByRaw('code, type, '.NotificationClassification::TARGET_KIND_SQL)
            ->get();

        $unread = 0;
        $aTraiter = 0;
        $parFamille = [];
        foreach ($groupes as $groupe) {
            $n = (int) $groupe->total;
            $classe = NotificationClassification::of($groupe->code, $groupe->type, $groupe->target_kind);
            $unread += $n;
            $aTraiter += $classe['a_traiter'] ? $n : 0;
            $parFamille[$classe['famille']->value] = ($parFamille[$classe['famille']->value] ?? 0) + $n;
        }

        // Un objet même vide : `{}`, jamais `[]`.
        return [$unread, ['a_traiter_non_lues' => $aTraiter, 'par_famille' => (object) $parFamille]];
    }

    public function markAsRead(Request $request, AppNotification $notification): JsonResponse
    {
        abort_unless($notification->user_id === $request->user()->id, 403);
        $notification->update(['read_at' => now(), 'is_read' => true]);

        return $this->json(['data' => AppNotificationResource::make($notification)->resolve($request)]);
    }

    public function markAsUnread(Request $request, AppNotification $notification): JsonResponse
    {
        abort_unless($notification->user_id === $request->user()->id, 403);
        $notification->update(['read_at' => null, 'is_read' => false]);

        return $this->json(['data' => AppNotificationResource::make($notification)->resolve($request)]);
    }

    public function markAllRead(Request $request): JsonResponse
    {
        AppNotification::where('user_id', $request->user()->id)
            ->whereNull('read_at')
            ->update(['read_at' => now(), 'is_read' => true]);

        return $this->json(['message' => 'ok']);
    }
}
