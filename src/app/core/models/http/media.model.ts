import {BaseModelInterface} from './base/base.model';

export interface Media extends BaseModelInterface {
  id?: number;
  model_id?: number; // ID of the related model (e.g., property_id)
  model_type?: string; // Full class name of the related model
  collection_name?: string; // Collection name defined in the model
  name?: string; // Name of the file (human-readable)
  file_name?: string; // Original filename
  mime_type?: string; // MIME type of the file
  disk?: string; // Storage disk
  conversions_disk?: string; // Disk where conversions are stored
  size?: number; // Size in bytes
  manipulations?: any; // Custom manipulations
  custom_properties?: any; // Custom properties
  generated_conversions?: { [key: string]: boolean }; // Generated image conversions
  responsive_images?: any; // Responsive image data
  order_column?: number; // Sorting order
  is_featured?: boolean; // Custom property for featured media
  created_at?: string;
  updated_at?: string;

  // URLs for the media
  original_url?: string; // URL to the original file
  preview_url?: string; // URL to the preview conversion
  thumbnail_url?: string; // URL to the thumbnail conversion

  // Helper properties
  is_image?: boolean; // Whether the media is an image
  extension?: string; // File extension
}
