<?php

namespace App\Http\Controllers\Api\Admin;

use App\Domain\Alerts\AlertableEvents;
use App\Http\Controllers\Base\Controller;
use App\Models\AlertRule;
use App\Services\Admin\AlertRuleService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AlertRuleController extends Controller
{
    public function __construct(private readonly AlertRuleService $alerts) {}

    public function index(): JsonResponse
    {
        return $this->json(['data' => $this->alerts->all(), 'catalogue' => AlertableEvents::all()]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);

        return $this->json(['data' => $this->alerts->create($data, $request->user())], 201);
    }

    public function update(Request $request, AlertRule $alertRule): JsonResponse
    {
        $data = $this->validated($request, partial: true);

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

    private function validated(Request $request, bool $partial = false): array
    {
        $required = $partial ? 'sometimes' : 'required';

        return $request->validate([
            'event' => [$required, 'string', Rule::in(array_keys(AlertableEvents::all()))],
            'channels' => [$required, 'array', 'min:1'],
            'channels.*' => ['string', Rule::in(['email', 'slack', 'discord'])],
            'recipients' => [$required, 'array'],
            'recipients.emails' => ['nullable', 'array'],
            'recipients.emails.*' => ['email'],
            'recipients.webhooks' => ['nullable', 'array'],
            'recipients.webhooks.*' => ['url'],
            'is_active' => ['sometimes', 'boolean'],
        ]);
    }
}
