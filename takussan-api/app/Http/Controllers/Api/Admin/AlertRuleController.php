<?php

namespace App\Http\Controllers\Api\Admin;

use App\Domain\Alerts\AlertableEvents;
use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Admin\StoreAlertRuleRequest;
use App\Http\Requests\Api\Admin\UpdateAlertRuleRequest;
use App\Models\AlertRule;
use App\Services\Admin\AlertRuleService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AlertRuleController extends Controller
{
    public function __construct(private readonly AlertRuleService $alerts) {}

    public function index(): JsonResponse
    {
        return $this->json(['data' => $this->alerts->all(), 'catalogue' => AlertableEvents::all()]);
    }

    public function store(StoreAlertRuleRequest $request): JsonResponse
    {
        $data = $request->validated();

        return $this->json(['data' => $this->alerts->create($data, $request->user())], 201);
    }

    public function update(UpdateAlertRuleRequest $request, AlertRule $alertRule): JsonResponse
    {
        $data = $request->validated();

        return $this->json(['data' => $this->alerts->update($alertRule, $data, $request->user())]);
    }

    public function destroy(Request $request, AlertRule $alertRule): JsonResponse
    {
        $this->alerts->delete($alertRule, $request->user());

        return $this->json(null, 204);
    }

    public function test(AlertRule $alertRule): JsonResponse
    {
        $this->alerts->test($alertRule);

        return $this->json(['data' => ['queued' => true]]);
    }
}
