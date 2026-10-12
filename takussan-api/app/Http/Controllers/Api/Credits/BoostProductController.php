<?php

namespace App\Http\Controllers\Api\Credits;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\Credits\BoostProductResource;
use App\Models\BoostProduct;
use Illuminate\Http\JsonResponse;

/** TCK-633 lot F (ADR-0061 §4) — les offres en vente. Lecture seule : les prix ne sont pas un secret. */
class BoostProductController extends Controller
{
    public function index(): JsonResponse
    {
        $products = BoostProduct::query()->where('is_active', true)->orderBy('sort_order')->orderBy('id')->get();

        return $this->json(['data' => BoostProductResource::collection($products)->resolve()]);
    }
}
