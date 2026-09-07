import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

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
  imports: [AnimateOnScrollModule, ImageModule, PanelModule, CardModule, DiscordStatsComponent],
  templateUrl: './home.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./home.component.css'],
})
export class HomeComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);

  images: string[] = [
    '0.avif',
    '1.avif',
    '2.avif',
    '3.avif',
    '4.avif',
    '5.avif',
    '6.avif',
    '7.avif',
    '8.gif',
    '9.avif',
    '10.avif',
    '11.avif',
    '13.avif',
    '14.avif',
    '15.avif',
    '16.avif',
    '17.avif',
    '18.avif',
    '19.avif',
    '20.avif',
    '21.avif',
    '22.avif',
    '23.gif',
    '24.avif',
  ];
  players: Player[] = [];
  isLoading = true;
  private intervalId: any;
  private boundScrollHandler: (() => void) | null = null;
  lightboxOpen = false;
  currentImageIndex = 0;
  showGalleryBadge = true;
  private imageCache: Map<string, boolean> = new Map();

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
    this.boundScrollHandler = this.handleScroll.bind(this);
    window.addEventListener('scroll', this.boundScrollHandler);
  }

  ngOnDestroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    if (this.boundScrollHandler) {
      window.removeEventListener('scroll', this.boundScrollHandler);
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
      this.imageCache.set(cacheKey, false);
    };
    img.onload = () => {
      this.imageCache.set(cacheKey, true);
    };
    img.src = `/assets/showcase/${folder}/${filename}`;
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
