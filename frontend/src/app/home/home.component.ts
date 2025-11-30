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
  ];
  players: Player[] = [];
  isLoading = true;
  private intervalId: any;
  lightboxOpen = false;
  currentImageIndex = 0;
  showGalleryBadge = true;

  constructor(private http: HttpClient) { }

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
  }

  ngOnDestroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    window.removeEventListener('scroll', this.handleScroll.bind(this));
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
  }

  closeLightbox() {
    this.lightboxOpen = false;
    document.body.style.overflow = '';
  }

  nextImage(event: Event) {
    event.stopPropagation();
    this.currentImageIndex = (this.currentImageIndex + 1) % this.images.length;
  }

  previousImage(event: Event) {
    event.stopPropagation();
    this.currentImageIndex = (this.currentImageIndex - 1 + this.images.length) % this.images.length;
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
