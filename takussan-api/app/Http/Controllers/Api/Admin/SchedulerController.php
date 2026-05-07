<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Services\Admin\ScheduledTaskInspector;
use Illuminate\Http\JsonResponse;

class SchedulerController extends Controller
{
    public function __construct(private readonly ScheduledTaskInspector $inspector) {}

    public function __invoke(): JsonResponse
    {
        return $this->json(['data' => $this->inspector->all()]);
    }
}
