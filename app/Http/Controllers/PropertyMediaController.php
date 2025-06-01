<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Base\Controller;
use App\Models\Property;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

class PropertyMediaController extends Controller
{
    /**
     * Display a listing of the property media.
     *
     * @param  int  $propertyId
     * @return \Illuminate\Http\Response
     */
    public function index($propertyId)
    {
        $property = Property::findOrFail($propertyId);
        
        // Check if user has permission to view this property's media
        if (!$this->canAccessProperty($property)) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $media = $property->getMedia('properties');
        
        return response()->json($media);
    }

    /**
     * Store newly uploaded media for a property.
     *
     * @param  \Illuminate\Http\Request  $request
     * @param  int  $propertyId
     * @return \Illuminate\Http\Response
     */
    public function store(Request $request, $propertyId)
    {
        $property = Property::findOrFail($propertyId);
        
        // Check if user has permission to add media to this property
        if (!$this->canManageProperty($property)) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }
        
        // Validate the incoming request
        $request->validate([
            'file' => 'required|array',
            'file.*' => 'file|mimes:jpeg,png,jpg,gif,svg,pdf,doc,docx,xls,xlsx,mp4,mov,avi|max:20480',
        ]);

        $mediaItems = [];
        
        if ($request->hasFile('file')) {
            foreach ($request->file('file') as $file) {
                $media = $property->addMedia($file)
                    ->toMediaCollection('properties');
                    
                $mediaItems[] = $media;
            }
        }
        
        return response()->json($mediaItems, 201);
    }

    /**
     * Remove the specified media from storage.
     *
     * @param  int  $propertyId
     * @param  int  $mediaId
     * @return \Illuminate\Http\Response
     */
    public function destroy($propertyId, $mediaId)
    {
        $property = Property::findOrFail($propertyId);
        
        // Check if user has permission to delete media from this property
        if (!$this->canManageProperty($property)) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }
        
        $media = Media::findOrFail($mediaId);
        
        // Make sure the media belongs to this property
        if ($media->model_id != $propertyId || $media->model_type != Property::class) {
            return response()->json(['message' => 'Media not found for this property'], 404);
        }
        
        $media->delete();
        
        return response()->json(['message' => 'Media deleted successfully']);
    }
    
    /**
     * Set the specified media as featured for the property.
     *
     * @param  int  $propertyId
     * @param  int  $mediaId
     * @return \Illuminate\Http\Response
     */
    public function setFeatured($propertyId, $mediaId)
    {
        $property = Property::findOrFail($propertyId);
        
        // Check if user has permission to update this property
        if (!$this->canManageProperty($property)) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }
        
        $media = Media::findOrFail($mediaId);
        
        // Make sure the media belongs to this property
        if ($media->model_id != $propertyId || $media->model_type != Property::class) {
            return response()->json(['message' => 'Media not found for this property'], 404);
        }
        
        // Remove featured flag from all property media
        foreach ($property->getMedia('properties') as $item) {
            $item->setCustomProperty('is_featured', false);
            $item->save();
        }
        
        // Set this media as featured
        $media->setCustomProperty('is_featured', true);
        $media->save();
        
        return response()->json(['message' => 'Media set as featured successfully', 'media' => $media]);
    }
    
    /**
     * Check if the authenticated user can access the property.
     *
     * @param  \App\Models\Property  $property
     * @return bool
     */
    private function canAccessProperty(Property $property)
    {
        $user = Auth::user();
        
        // Admin can access all properties
        if ($user && $user->hasPermission('properties.view')) {
            return true;
        }
        
        // Property owner can access their own properties
        return $user && $property->user_id === $user->id;
    }
    
    /**
     * Check if the authenticated user can manage the property.
     *
     * @param  \App\Models\Property  $property
     * @return bool
     */
    private function canManageProperty(Property $property)
    {
        $user = Auth::user();
        
        // Admin can manage all properties
        if ($user && $user->hasPermission('properties.edit')) {
            return true;
        }
        
        // Property owner can manage their own properties
        return $user && $property->user_id === $user->id;
    }
}
