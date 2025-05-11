<?php

namespace App\Services;

use App\Models\Property;
use Illuminate\Support\Facades\DB;
use Illuminate\Http\UploadedFile;
use Spatie\MediaLibrary\MediaCollections\Exceptions\FileDoesNotExist;
use Spatie\MediaLibrary\MediaCollections\Exceptions\FileIsTooBig;

class PropertyService
{
    /**
     * Store a new property
     *
     * @param array $data
     * @return Property
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
     * Update an existing property
     *
     * @param Property $property
     * @param array $data
     * @return Property
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
                $property->address()->updateOrCreate(
                    ['is_primary' => true],
                    $addressData
                );
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
     *
     * @param Property $property
     * @return bool
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
    
    /**
     * Add media files to a property
     *
     * @param Property $property
     * @param array $files
     * @param string $collection
     * @return void
     */
    protected function addMediaFiles(Property $property, array $files, string $collection): void
    {
        foreach ($files as $file) {
            if ($file instanceof UploadedFile) {
                try {
                    $property->addMedia($file)
                        ->toMediaCollection($collection);
                } catch (FileDoesNotExist | FileIsTooBig $e) {
                    // Log error but continue processing other files
                    \Log::error("Failed to add media file to property: " . $e->getMessage());
                }
            }
        }
    }
}
