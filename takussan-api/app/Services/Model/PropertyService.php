<?php

namespace App\Services\Model;

use App\Models\Property;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Log;
use Spatie\MediaLibrary\MediaCollections\Exceptions\FileDoesNotExist;
use Spatie\MediaLibrary\MediaCollections\Exceptions\FileIsTooBig;
use Throwable;

class PropertyService
{
    /**
     * Store a new property
     * @throws Throwable
     */
    public function store(array $data): Property
    {
        $addressData = $data['address'] ?? null;
        $tagsData = $data['tags'] ?? null;
        $images = $data['images'] ?? null;
        $documents = $data['documents'] ?? null;

        // Remove non-fillable data
        unset($data['address'], $data['tags'], $data['images'], $data['documents']);

        // Set current user as owner if not specified
        if (!isset($data['user_id'])) {
            $data['user_id'] = auth()->id();
        }

        return DB::transaction(function () use ($data, $addressData, $tagsData, $images, $documents) {
            // Create the property
            $property = Property::create($data);

            // Add address if provided
            if ($addressData) {
                $property->address()->create($addressData);
            }

            // Sync tags if provided
            if ($tagsData) {
                $property->tags()->sync($tagsData);
            }

            // Add images if provided
            if ($images) {
                $this->addMediaFiles($property, $images, 'images');
            }

            // Add documents if provided
            if ($documents) {
                $this->addMediaFiles($property, $documents, 'documents');
            }

            return $property;
        });
    }

    /**
     * Add media files to a property
     */
    protected function addMediaFiles(Property $property, array $files, string $collection): void
    {
        foreach ($files as $file) {
            if ($file instanceof UploadedFile) {
                try {
                    $property->addMedia($file)
                        ->toMediaCollection($collection);
                } catch (FileDoesNotExist|FileIsTooBig $e) {
                    // Log error but continue processing other files
                    Log::error("Failed to add media file to property: " . $e->getMessage());
                }
            }
        }
    }

    /**
     * Update an existing property
     * @throws Throwable
     */
    public function update(Property $property, array $data): Property
    {
        $addressData = $data['address'] ?? null;
        $tagsData = $data['tags'] ?? null;
        $images = $data['images'] ?? null;
        $documents = $data['documents'] ?? null;

        // Remove non-fillable data
        unset($data['address'], $data['tags'], $data['images'], $data['documents']);

        return DB::transaction(function () use ($property, $data, $addressData, $tagsData, $images, $documents) {
            // Update the property
            $property->update($data);

            // Update address if provided
            if ($addressData) {
                // Simply update or create the address without the is_primary condition
                // since we're using a morphOne relationship, there should only be one address per property
                $property->address()->updateOrCreate(['addressable_id' => $property->id, 'addressable_type' => Property::class], $addressData);
            }

            // Sync tags if provided
            if ($tagsData !== null) {
                $property->tags()->sync($tagsData);
            }

            // Add images if provided
            if ($images) {
                $this->addMediaFiles($property, $images, 'images');
            }

            // Add documents if provided
            if ($documents) {
                $this->addMediaFiles($property, $documents, 'documents');
            }

            return $property;
        });
    }

    /**
     * Delete a property
     * @throws Throwable
     */
    public function delete(Property $property): bool
    {
        return DB::transaction(function () use ($property) {
            // Delete associated address
            $property->address()->delete();

            // Delete the property
            return $property->delete();
        });
    }
}
