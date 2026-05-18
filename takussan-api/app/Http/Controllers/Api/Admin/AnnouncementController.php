<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Admin\StoreAnnouncementRequest;
use App\Http\Requests\Api\Admin\UpdateAnnouncementRequest;
use App\Http\Resources\AnnouncementResource;
use App\Models\Announcement;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AnnouncementController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $paginator = Announcement::buildQuery(request: $request)
            ->defaultSort('-starts_at')
            ->paginate((int) $request->input('per_page', 20));

        return $this->json([
            'data' => AnnouncementResource::collection($paginator->items())->resolve(),
            'meta' => [
                'total' => $paginator->total(),
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
            ],
        ]);
    }

    public function store(StoreAnnouncementRequest $request): JsonResponse
    {
        $announcement = Announcement::query()->create([
            ...$request->validated(),
            'created_by' => $request->user()->id,
        ]);

        activity('Admin')
            ->causedBy($request->user())
            ->performedOn($announcement)
            ->event('super_admin_announcement_created')
            ->log('Annonce plateforme créée');

        return $this->json(['data' => AnnouncementResource::make($announcement)->resolve()], 201);
    }

    public function update(UpdateAnnouncementRequest $request, Announcement $announcement): JsonResponse
    {
        $announcement->update($request->validated());

        activity('Admin')
            ->causedBy($request->user())
            ->performedOn($announcement)
            ->event('super_admin_announcement_updated')
            ->log('Annonce plateforme modifiée');

        return $this->json(['data' => AnnouncementResource::make($announcement->refresh())->resolve()]);
    }

    public function deactivate(Request $request, Announcement $announcement): JsonResponse
    {
        $announcement->update(['is_active' => false]);

        activity('Admin')
            ->causedBy($request->user())
            ->performedOn($announcement)
            ->event('super_admin_announcement_deactivated')
            ->log('Annonce plateforme désactivée');

        return $this->json(['data' => AnnouncementResource::make($announcement->refresh())->resolve()]);
    }
}
