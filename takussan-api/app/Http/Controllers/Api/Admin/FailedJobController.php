<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Services\Admin\FailedJobService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class FailedJobController extends Controller
{
    public function __construct(private readonly FailedJobService $service) {}

    public function index(Request $request): JsonResponse
    {
        $paginator = $this->service->paginate(
            ['queue' => $request->input('filter.queue') ?? $request->input('filter')['queue'] ?? null],
            (int) $request->input('per_page', 20),
        );

        return $this->paginated($paginator, $paginator->items());
    }

    public function show(int $id): JsonResponse
    {
        return $this->json(['data' => $this->service->find($id), 'warning' => 'Payload complet potentiellement sensible.']);
    }

    public function retry(Request $request, int $id): JsonResponse
    {
        $this->service->retry($id);

        activity('Admin')
            ->causedBy($request->user())
            ->event('super_admin_job_retried')
            ->withProperties(['failed_job_id' => $id])
            ->log('Job échoué rejoué');

        return $this->json(['data' => ['retried' => true]]);
    }

    public function retryAll(Request $request): JsonResponse
    {
        $count = $this->service->retryAll();

        activity('Admin')
            ->causedBy($request->user())
            ->event('super_admin_job_bulk_retried')
            ->withProperties(['count' => $count])
            ->log('Jobs échoués rejoués en lot');

        return $this->json(['data' => ['queued' => $count]]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $this->service->delete($id);

        activity('Admin')
            ->causedBy($request->user())
            ->event('super_admin_job_deleted')
            ->withProperties(['failed_job_id' => $id])
            ->log('Job échoué supprimé');

        return $this->json(['data' => ['deleted' => true]]);
    }
}
