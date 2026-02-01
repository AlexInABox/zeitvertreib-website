import { Component, OnInit, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';

import { AnimateOnScrollModule } from 'primeng/animateonscroll';
import { ImageModule } from 'primeng/image';
import { PanelModule } from 'primeng/panel';
import { CardModule } from 'primeng/card';
import { DiscordStatsComponent } from '../components/discord-stats/discord-stats.component';

interface Player {
  Name: string;
  UserId: string;
  Team: string;
  DiscordId?: string;
  AvatarUrl?: string;
}

@Component({
  selector: 'app-home',
  imports: [CommonModule, AnimateOnScrollModule, ImageModule, PanelModule, CardModule, DiscordStatsComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class HomeComponent implements OnInit, OnDestroy {
  images: string[] = [
    '0.jpg',
    '1.jpg',
    '2.jpg',
    '3.jpg',
    '4.jpg',
    '5.jpg',
    '6.jpg',
    '7.jpg',
    '8.gif',
    '9.jpg',
    '10.jpg',
    '11.jpg',
    '13.jpg',
    '14.jpg',
    '15.jpg',
    '16.jpg',
    '17.jpg',
    '18.jpg',
    '19.jpg',
    '20.jpg',
    '21.jpg',
    '22.jpg',
    '23.mp4',
    '24.jpg',
  ];
  players: Player[] = [];
  isLoading = true;
  private intervalId: any;
  lightboxOpen = false;
  currentImageIndex = 0;
  showGalleryBadge = true;
  private imageCache: Map<string, boolean> = new Map();
  private intersectionObserver: IntersectionObserver | null = null;

  constructor(private http: HttpClient) {}

  get currentImage(): string {
    return this.images[this.currentImageIndex];
  }

  ngOnInit() {
    this.fetchPlayerlist();
    // Refresh playerlist every 10 seconds
    this.intervalId = setInterval(() => {
      this.fetchPlayerlist();
    }, 10000);

    // Setup scroll listener to hide badge when gallery is visible
    window.addEventListener('scroll', this.handleScroll.bind(this));

    //Firefox Fix(?)
    setTimeout(() => {
      this.images.forEach((image) => {
        if (!image.endsWith('.mp4')) {
          this.preloadImage(image, 'tiny');
        }
      });
    }, 100);

    setTimeout(() => {
      this.setupImageObserver();
    }, 500);
  }

  ngOnDestroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    window.removeEventListener('scroll', this.handleScroll.bind(this));
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
    }
  }

  fetchPlayerlist() {
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const apiUrl = isLocalhost
      ? 'https://dev.zeitvertreib.vip/api/playerlist'
      : `${window.location.origin}/api/playerlist`;

    this.http.get<Player[]>(apiUrl).subscribe({
      next: (data) => {
        this.players = data;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error fetching playerlist:', error);
        this.isLoading = false;
      },
    });
  }

  get alivePlayers(): Player[] {
    return this.players.filter((p) => p.Team !== 'Dead');
  }

  get deadPlayers(): Player[] {
    return this.players.filter((p) => p.Team === 'Dead');
  }

  get playerCount(): number {
    return this.players.length;
  }

  get aliveCount(): number {
    return this.alivePlayers.length;
  }

  openLightbox(index: number) {
    this.currentImageIndex = index;
    this.lightboxOpen = true;
    document.body.style.overflow = 'hidden';
    this.preloadImage(this.images[index], 'full');
    this.preloadImage(this.images[(index + 1) % this.images.length], 'full');
    this.preloadImage(this.images[(index - 1 + this.images.length) % this.images.length], 'full');
  }

  closeLightbox() {
    this.lightboxOpen = false;
    document.body.style.overflow = '';
  }

  nextImage(event: Event) {
    event.stopPropagation();
    this.currentImageIndex = (this.currentImageIndex + 1) % this.images.length;
    const nextIdx = (this.currentImageIndex + 1) % this.images.length;
    const nextNextIdx = (this.currentImageIndex + 2) % this.images.length;
    this.preloadImage(this.images[nextIdx], 'full');
    this.preloadImage(this.images[nextNextIdx], 'full');
  }

  previousImage(event: Event) {
    event.stopPropagation();
    this.currentImageIndex = (this.currentImageIndex - 1 + this.images.length) % this.images.length;
    const prevIdx = (this.currentImageIndex - 1 + this.images.length) % this.images.length;
    const prevPrevIdx = (this.currentImageIndex - 2 + this.images.length) % this.images.length;
    this.preloadImage(this.images[prevIdx], 'full');
    this.preloadImage(this.images[prevPrevIdx], 'full');
  }

  private preloadImage(filename: string, folder: 'tiny' | 'full'): void {
    if (filename.endsWith('.mp4')) {
      return;
    }

    const cacheKey = `${folder}/${filename}`;
    // Don't preload if already cached
    if (this.imageCache.has(cacheKey)) {
      return;
    }

    const img = new Image();
    img.onerror = () => {
      console.warn(`Failed to preload image: ${cacheKey}`);
    };
    img.onload = () => {
      this.imageCache.set(cacheKey, true);
    };
    img.src = `/assets/showcase/${folder}/${filename}`;
  }

  private setupImageObserver(): void {
    const imageElements = document.querySelectorAll('.masonry-media');

    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const img = entry.target as HTMLImageElement | HTMLVideoElement;
            const src = img.getAttribute('data-src');
            if (src && !img.src) {
              img.src = src;
              img.removeAttribute('data-src');
            }
          }
        });
      },
      { rootMargin: '200px' }, //Alex: adjust based on how soon images should load
    );

    imageElements.forEach((img) => {
      this.intersectionObserver!.observe(img);
    });
  }

  scrollToGallery(event: Event) {
    event.preventDefault();
    const gallerySection = document.getElementById('gallery-section');
    if (gallerySection) {
      gallerySection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  handleScroll() {
    const gallerySection = document.getElementById('gallery-section');
    if (gallerySection) {
      const rect = gallerySection.getBoundingClientRect();
      // Hide badge when gallery section is in viewport (top of section is visible)
      this.showGalleryBadge = rect.top > window.innerHeight * 0.3;
    }
  }

  get yearsSinceFounding(): number {
    const foundingDate = new Date(2021, 8, 19); // September 19, 2021 (month is 0-indexed)
    const now = new Date();
    const diffTime = now.getTime() - foundingDate.getTime();
    const diffYears = diffTime / (1000 * 60 * 60 * 24 * 365.25);
    return Math.floor(diffYears);
  }
}
