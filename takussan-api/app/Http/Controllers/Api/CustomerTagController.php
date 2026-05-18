<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\AttachCustomerTagsRequest;
use App\Models\Customer;
use App\Models\Enums\TagType;
use App\Models\Tag;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class CustomerTagController extends Controller
{
    public function store(AttachCustomerTagsRequest $request, Customer $customer): JsonResponse
    {
        $this->authorizeAccess($request, $customer);

        $names = $request->normalizedNames();

        // Names already attached to this customer (case-insensitive comparison
        // because seeded tags can be capitalized while the request is normalized
        // to lowercase). Count once instead of per-name exists() queries.
        $alreadyAttachedLower = $customer->tags()
            ->pluck('tags.name')
            ->map(fn (string $n) => mb_strtolower($n))
            ->all();

        $newNames = array_values(array_diff($names, $alreadyAttachedLower));

        if (count($alreadyAttachedLower) + count($newNames) > 10) {
            return $this->json([
                'message' => __('validation.max.array', ['attribute' => 'tags', 'max' => 10]),
            ], 422);
        }

        foreach ($names as $name) {
            // The `tags.name` column has a single unique index (no compound on type).
            // Looking up case-insensitively avoids a unique-constraint violation when a
            // tag was seeded or created from another module with a different capitalisation.
            $tag = Tag::whereRaw('LOWER(name) = ?', [$name])->first();
            if ($tag === null) {
                $tag = Tag::create([
                    'name' => $name,
                    'slug' => Str::slug($name).'-'.Str::random(4),
                    'type' => TagType::Crm->value,
                ]);
            }

            if (! $customer->tags()->where('tags.id', $tag->id)->exists()) {
                $customer->tags()->attach($tag->id);
                activity()
                    ->performedOn($customer)
                    ->withProperties(['tag_name' => $tag->name, 'tag_id' => $tag->id])
                    ->event('tag.attached')
                    ->log('tag.attached');
            }
        }

        return $this->json(['data' => $this->formatTags($customer)]);
    }

    public function destroy(Request $request, Customer $customer, Tag $tag): JsonResponse
    {
        $this->authorizeAccess($request, $customer);

        $customer->tags()->detach($tag->id);

        activity()
            ->performedOn($customer)
            ->withProperties(['tag_name' => $tag->name, 'tag_id' => $tag->id])
            ->event('tag.detached')
            ->log('tag.detached');

        return $this->json(null, 204);
    }

    private function formatTags(Customer $customer): array
    {
        return $customer->tags()->get()->map(fn (Tag $t) => [
            'id' => $t->id,
            'name' => $t->name,
            'slug' => $t->slug,
            'color' => $t->color,
        ])->values()->all();
    }

    private function authorizeAccess(Request $request, Customer $customer): void
    {
        $user = $request->user();
        $ok = $user->isSuperAdmin()
            || $customer->added_by_id === $user->id
            || ($user->agency_id && $user->agency_id === $customer->agency_id);

        abort_unless($ok, 403);
    }
}
