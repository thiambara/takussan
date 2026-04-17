<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Spatie\Activitylog\Models\Activity;

class AuditLogController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()->hasRole(['admin', 'super_admin']), 403);

        $query = Activity::query()->with(['causer', 'subject']);

        if ($logName = $request->input('log_name')) {
            $query->where('log_name', $logName);
        }

        if ($event = $request->input('event')) {
            $query->where('event', $event);
        }

        if ($causerId = $request->input('causer_id')) {
            $query->where('causer_id', $causerId);
        }

        if ($causerType = $request->input('causer_type')) {
            $query->where('causer_type', $causerType);
        }

        if ($subjectType = $request->input('subject_type')) {
            $query->where('subject_type', $subjectType);
        }

        if ($subjectId = $request->input('subject_id')) {
            $query->where('subject_id', $subjectId);
        }

        if ($from = $request->input('from')) {
            $query->where('created_at', '>=', $from);
        }

        if ($to = $request->input('to')) {
            $query->where('created_at', '<=', $to);
        }

        $order = $request->input('order', 'desc') === 'asc' ? 'asc' : 'desc';
        $paginator = $query->orderBy('created_at', $order)
            ->paginate((int) $request->input('per_page', 50));

        $data = $paginator->getCollection()->map(function (Activity $log): array {
            return [
                'id' => $log->id,
                'log_name' => $log->log_name,
                'event' => $log->event,
                'description' => $log->description,
                'causer_type' => $log->causer_type,
                'causer_id' => $log->causer_id,
                'causer' => $log->causer ? [
                    'id' => $log->causer->getKey(),
                    'name' => $log->causer->name ?? null,
                    'email' => $log->causer->email ?? null,
                ] : null,
                'subject_type' => $log->subject_type,
                'subject_id' => $log->subject_id,
                'properties' => $log->properties,
                'created_at' => $log->created_at,
            ];
        })->all();

        return $this->json([
            'data' => $data,
            'meta' => [
                'total' => $paginator->total(),
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
            ],
        ]);
    }
}
