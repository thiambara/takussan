import {Injectable} from '@angular/core';
import {HttpClient} from "@angular/common/http";
import {Observable} from "rxjs";
import {BaseHttpService} from "./base/base-http.service";
import {Property} from "../../models/http/property.model";
import {Media} from "../../models/http/media.model";
import {BaseHttpIndexQueryParams} from "../../models/http/base/base-http-index-query-param.model";

@Injectable({
  providedIn: 'root'
})
export class PropertyService extends BaseHttpService<Property> {
  protected override suffix: string = 'properties';

  constructor(protected override http: HttpClient) {
    super(http);
  }

  /**
   * Upload media files for a specific property
   * @param propertyId - The ID of the property
   * @param files - The files to upload
   */
  uploadMedia(propertyId: number, files: File[]): Observable<Media[]> {
    const formData = new FormData();

    // Spatie MediaLibrary expects 'file[]' as the key for multiple files
    files.forEach((file) => {
      formData.append('file[]', file);
    });

    return this.http.post<Media[]>(`${this.endpointUrl}/${propertyId}/media`, formData);
  }

  /**
   * Get all media for a specific property
   * @param propertyId - The ID of the property
   */
  getMedia(propertyId: number): Observable<Media[]> {
    return this.http.get<Media[]>(`${this.endpointUrl}/${propertyId}/media`);
  }

  /**
   * Delete a specific media item
   * @param propertyId - The ID of the property
   * @param mediaId - The ID of the media to delete
   */
  deleteMedia(propertyId: number, mediaId: number): Observable<void> {
    return this.http.delete<void>(`${this.endpointUrl}/${propertyId}/media/${mediaId}`);
  }

  /**
   * Set a media item as the featured image
   * @param propertyId - The ID of the property
   * @param mediaId - The ID of the media to set as featured
   */
  setFeaturedMedia(propertyId: number, mediaId: number): Observable<void> {
    return this.http.post<void>(`${this.endpointUrl}/${propertyId}/media/${mediaId}/featured`, {});
  }

  /**
   * Hero search properties
   * @param params
   */
  heroSearch(params: BaseHttpIndexQueryParams<Property>) {
    return this.http.get<Property[]>(`${this.endpointUrl}/hero-search?${objectToQueryString(params)}`);
  }
}
