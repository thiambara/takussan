<?php

namespace App\Http\Controllers\Base;

use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Foundation\Bus\DispatchesJobs;
use Illuminate\Foundation\Validation\ValidatesRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller as BaseController;

class
Controller extends BaseController
{
    use AuthorizesRequests, DispatchesJobs, ValidatesRequests;

    public function json($data = [], $status = 200, array|null $headers = null, $options = 0): JsonResponse
    {
        $headers ??= [];
        return response()->json($data, $status, $headers, $options);
    }
}
