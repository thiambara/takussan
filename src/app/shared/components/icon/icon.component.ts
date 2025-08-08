import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Input,
  OnChanges,
  OnInit,
  signal,
  SimpleChanges
} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {CommonModule} from '@angular/common';
import {catchError, tap} from 'rxjs/operators';
import {of} from 'rxjs';
import {DomSanitizer, SafeHtml} from '@angular/platform-browser';

type IconStyle = 'solid' | 'outline';

interface CacheEntry {
  rawSvg: string;
  timestamp: number;
}

interface ProcessedCacheEntry {
  safeSvg: SafeHtml;
  timestamp: number;
}

@Component({
  selector: 'app-icon',
  standalone: true,
  imports: [CommonModule],
  template: `
      @if (svgContent()) {
          <span [innerHTML]="svgContent()"></span>
      }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class IconComponent implements OnInit, OnChanges {
  private static readonly rawSvgCache = new Map<string, CacheEntry>();
  private static readonly processedSvgCache = new Map<string, ProcessedCacheEntry>();
  private static readonly CACHE_EXPIRY = 30 * 60 * 1000; // 30 minutes
  private static readonly MAX_CACHE_SIZE = 100;
  @Input() name!: string;
  @Input() style: IconStyle = 'outline';
  @Input() size: number = 4;
  @Input() color: string = '';
  @Input() customClass: string = '';
  @Input() ariaLabel: string = 'icon';
  readonly svgContent = signal<SafeHtml | null>(null);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly http = inject(HttpClient);
  // Using signals for better performance
  private readonly iconPath = computed(() => {
    if (!this.name) return '';
    return `assets/icons/${this.style}/${this.name}.svg`;
  });
  private readonly cssClasses = computed(() => {
    const baseClass = `w-${this.size} h-${this.size}`;
    const colorClass = this.color ? ` ${this.color}` : '';
    const customClass = this.customClass ? ` ${this.customClass}` : '';
    return `${baseClass}${colorClass}${customClass}`.trim();
  });
  // Create cache key that includes all styling parameters
  private readonly cacheKey = computed(() => {
    const path = this.iconPath();
    const classes = this.cssClasses();
    const label = this.ariaLabel;
    return `${path}|${classes}|${label}`;
  });

  ngOnInit(): void {
    this.loadIcon();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Only reload if the name, style, size, color, or customClass changed
    const relevantChanges = ['name', 'style', 'size', 'color', 'customClass'];
    if (relevantChanges.some(key => changes[key])) {
      this.loadIcon();
    }
  }

  private loadIcon(): void {
    const path = this.iconPath();
    if (!path) {
      this.svgContent.set(null);
      return;
    }

    const fullCacheKey = this.cacheKey();

    // Check processed cache first (includes styling)
    const cachedProcessed = this.getCachedProcessedIcon(fullCacheKey);
    if (cachedProcessed) {
      this.svgContent.set(cachedProcessed);
      return;
    }

    // Check raw SVG cache
    const cachedRaw = this.getCachedRawIcon(path);
    if (cachedRaw) {
      const processedSvg = this.processSvg(cachedRaw);
      const safeSvg = this.sanitizer.bypassSecurityTrustHtml(processedSvg);

      this.setCachedProcessedIcon(fullCacheKey, safeSvg);
      this.svgContent.set(safeSvg);
      return;
    }

    // Load from server
    this.http.get(path, {responseType: 'text'}).pipe(
      tap(rawSvg => {
        // Cache raw SVG
        this.setCachedRawIcon(path, rawSvg);

        // Process and cache styled version
        const processedSvg = this.processSvg(rawSvg);
        const safeSvg = this.sanitizer.bypassSecurityTrustHtml(processedSvg);

        this.setCachedProcessedIcon(fullCacheKey, safeSvg);
        this.svgContent.set(safeSvg);
      }),
      catchError(error => {
        console.warn(`[AppIcon] Failed to load icon "${this.name}" from "${path}":`, error.message);
        this.svgContent.set(null);
        return of('');
      })
    ).subscribe();
  }

  private processSvg(rawSvg: string): string {
    const classes = this.cssClasses();
    const svgRegex = /<svg\b([^>]*)>/;

    return rawSvg.replace(svgRegex, (_, attributes) => {
      // Remove existing class, aria-label, aria-hidden, and role attributes to avoid conflicts
      const cleanAttributes = attributes
        .replace(/\s*class\s*=\s*"[^"]*"/gi, '')
        .replace(/\s*aria-label\s*=\s*"[^"]*"/gi, '')
        .replace(/\s*aria-hidden\s*=\s*"[^"]*"/gi, '')
        .replace(/\s*role\s*=\s*"[^"]*"/gi, '')
        .trim();

      return `<svg class="${classes}" ${cleanAttributes} aria-label="${this.ariaLabel}" role="img">`;
    });
  }

  private getCachedRawIcon(path: string): string | null {
    const cached = IconComponent.rawSvgCache.get(path);
    if (!cached) return null;

    // Check if cache entry is still valid
    if (Date.now() - cached.timestamp > IconComponent.CACHE_EXPIRY) {
      IconComponent.rawSvgCache.delete(path);
      return null;
    }

    return cached.rawSvg;
  }

  private setCachedRawIcon(path: string, rawSvg: string): void {
    // Implement simple LRU cache cleanup
    if (IconComponent.rawSvgCache.size >= IconComponent.MAX_CACHE_SIZE) {
      this.cleanupRawCache();
    }

    IconComponent.rawSvgCache.set(path, {
      rawSvg,
      timestamp: Date.now()
    });
  }

  private getCachedProcessedIcon(cacheKey: string): SafeHtml | null {
    const cached = IconComponent.processedSvgCache.get(cacheKey);
    if (!cached) return null;

    // Check if cache entry is still valid
    if (Date.now() - cached.timestamp > IconComponent.CACHE_EXPIRY) {
      IconComponent.processedSvgCache.delete(cacheKey);
      return null;
    }

    return cached.safeSvg;
  }

  private setCachedProcessedIcon(cacheKey: string, safeSvg: SafeHtml): void {
    // Implement simple LRU cache cleanup
    if (IconComponent.processedSvgCache.size >= IconComponent.MAX_CACHE_SIZE) {
      this.cleanupProcessedCache();
    }

    IconComponent.processedSvgCache.set(cacheKey, {
      safeSvg,
      timestamp: Date.now()
    });
  }

  private cleanupRawCache(): void {
    const now = Date.now();
    const entries = Array.from(IconComponent.rawSvgCache.entries());

    // Remove expired entries first
    entries.forEach(([key, entry]) => {
      if (now - entry.timestamp > IconComponent.CACHE_EXPIRY) {
        IconComponent.rawSvgCache.delete(key);
      }
    });

    // If still too many entries, remove the oldest ones
    if (IconComponent.rawSvgCache.size >= IconComponent.MAX_CACHE_SIZE) {
      const sortedEntries = Array.from(IconComponent.rawSvgCache.entries())
        .sort(([, a], [, b]) => a.timestamp - b.timestamp);

      const toRemove = sortedEntries.slice(0, IconComponent.rawSvgCache.size - IconComponent.MAX_CACHE_SIZE + 10);
      toRemove.forEach(([key]) => IconComponent.rawSvgCache.delete(key));
    }
  }

  private cleanupProcessedCache(): void {
    const now = Date.now();
    const entries = Array.from(IconComponent.processedSvgCache.entries());

    // Remove expired entries first
    entries.forEach(([key, entry]) => {
      if (now - entry.timestamp > IconComponent.CACHE_EXPIRY) {
        IconComponent.processedSvgCache.delete(key);
      }
    });

    // If still too many entries, remove the oldest ones
    if (IconComponent.processedSvgCache.size >= IconComponent.MAX_CACHE_SIZE) {
      const sortedEntries = Array.from(IconComponent.processedSvgCache.entries())
        .sort(([, a], [, b]) => a.timestamp - b.timestamp);

      const toRemove = sortedEntries.slice(0, IconComponent.processedSvgCache.size - IconComponent.MAX_CACHE_SIZE + 10);
      toRemove.forEach(([key]) => IconComponent.processedSvgCache.delete(key));
    }
  }
}
