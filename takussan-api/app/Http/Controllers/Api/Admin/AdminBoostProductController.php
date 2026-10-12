<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Admin\StoreBoostProductRequest;
use App\Http\Requests\Api\Admin\UpdateBoostProductRequest;
use App\Http\Resources\Credits\BoostProductResource;
use App\Models\BoostProduct;
use Illuminate\Http\JsonResponse;

/** TCK-633 lot F (ADR-0061 §4) — le catalogue, réglé sans redéploiement ; chaque écriture journalisée. */
class AdminBoostProductController extends Controller
{
    public function index(): JsonResponse
    {
        $products = BoostProduct::query()->orderBy('sort_order')->orderBy('id')->get();

        return $this->json(['data' => BoostProductResource::collection($products)->resolve()]);
    }

    public function store(StoreBoostProductRequest $request): JsonResponse
    {
        $product = BoostProduct::query()->create($request->validated() + ['is_active' => true, 'sort_order' => 100]);

        activity('Boost')
            ->performedOn($product)
            ->causedBy($request->user())
            ->withProperties(['product' => BoostProductResource::make($product)->resolve()])
            ->event('super_admin_boost_product_created')
            ->log('Offre de mise en avant créée');

        return $this->json(['data' => BoostProductResource::make($product)->resolve()], 201);
    }

    public function update(UpdateBoostProductRequest $request, BoostProduct $boostProduct): JsonResponse
    {
        $before = BoostProductResource::make($boostProduct)->resolve();
        $boostProduct->update($request->validated());

        activity('Boost')
            ->performedOn($boostProduct)
            ->causedBy($request->user())
            ->withProperties(['before' => $before, 'after' => BoostProductResource::make($boostProduct)->resolve()])
            ->event('super_admin_boost_product_updated')
            ->log('Offre de mise en avant modifiée');

        return $this->json(['data' => BoostProductResource::make($boostProduct)->resolve()]);
    }
}
