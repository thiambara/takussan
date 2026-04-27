<?php

namespace App\Http\Controllers\Api\Agency;

use App\Http\Controllers\Base\Controller;
use App\Jobs\Media\RegenerateAgencyWatermarksJob;
use App\Models\Agency;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RegenerateWatermarksController extends Controller
{
    public function __invoke(Request $request, Agency $agency): JsonResponse
    {
        $user = $request->user();

        abort_unless(
            $agency->primary_admin_id === $user->id || $user->hasRole(['admin', 'super_admin']),
            403,
        );

        RegenerateAgencyWatermarksJob::dispatch($agency->id);

        return $this->json(['queued' => true, 'agency_id' => $agency->id], 202);
    }
}
