<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\AnnouncementResource;
use App\Models\Announcement;
use App\Services\Announcements\AnnouncementResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AnnouncementController extends Controller
{
    public function __construct(private readonly AnnouncementResolver $resolver) {}

    public function active(Request $request): JsonResponse
    {
        return $this->json([
            'data' => AnnouncementResource::collection($this->resolver->activeFor($request->user()))->resolve(),
        ]);
    }

    public function dismiss(Request $request, Announcement $announcement): JsonResponse
    {
        abort_unless($this->resolver->matches($announcement, $request->user()), 404);

        $dismissal = $this->resolver->dismiss($announcement, $request->user());

        return $this->json([
            'data' => [
                'dismissed' => $dismissal !== null,
                'announcement_id' => $announcement->id,
            ],
        ]);
    }
}
