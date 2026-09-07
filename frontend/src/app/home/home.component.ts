import { Component, OnDestroy, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterModule } from '@angular/router';
import { M3NavComponent } from '../components/m3-nav/m3-nav.component';
import { M3FooterComponent } from '../components/m3-footer/m3-footer.component';
import { SHOWCASE_IMAGES } from '../utils/showcase';

interface Player {
  Name: string;
  UserId: string;
  Team: string;
  DiscordId?: string;
  AvatarUrl?: string;
}

interface DiscordInviteResponse {
  approximate_member_count: number;
  approximate_presence_count: number;
}

@Component({
  selector: 'app-home',
  imports: [RouterModule, M3NavComponent, M3FooterComponent],
  templateUrl: './home.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./home.component.css'],
})
export class HomeComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);

  /** Direct-connect deep link into the server. */
  readonly steamUrl = 'steam://rungameid/700330//+connect 92.119.167.107:7100';

  players: Player[] = [];
  private intervalId: any;

  discordMembers = 0;
  discordOnline = 0;

  galleryImages = SHOWCASE_IMAGES;
  activeImageIndex = 0;
  stageBehind = `/assets/showcase/full/${SHOWCASE_IMAGES[0]}`;

  private slideshowTimer: any;
  private lastManual = 0;
  private readonly manualResumeDelay = 8000;
  private readonly slideInterval = 5000;

  ngOnInit(): void {
    this.fetchPlayerlist();
    this.intervalId = setInterval(() => this.fetchPlayerlist(), 10000);
    this.fetchDiscordStats();
    this.startSlideshow();
    // Immersive m3 chrome: hides the global header/site footer while mounted.
    document.body.classList.add('m3-active');
  }

  ngOnDestroy(): void {
    clearInterval(this.intervalId);
    clearInterval(this.slideshowTimer);
    document.body.classList.remove('m3-active');
  }

  private fetchPlayerlist(): void {
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const apiUrl = isLocalhost
      ? 'https://dev.zeitvertreib.vip/api/playerlist'
      : `${window.location.origin}/api/playerlist`;

    this.http.get<Player[]>(apiUrl).subscribe({
      next: (data) => {
        this.players = data;
      },
      error: () => {},
    });
  }

  private fetchDiscordStats(): void {
    this.http.get<DiscordInviteResponse>('https://discord.com/api/v9/invites/MhQ4Wp7GfS?with_counts=true').subscribe({
      next: (data) => {
        this.discordMembers = data.approximate_member_count;
        this.discordOnline = data.approximate_presence_count;
      },
      error: (error) => {
        console.error('Error fetching Discord stats:', error);
      },
    });
  }

  /** German thousands separator for the readouts. */
  fmt(value: number): string {
    return value.toLocaleString('de-DE');
  }

  get playerCount(): number {
    return this.players.length;
  }

  get alivePlayers(): Player[] {
    return this.players.filter((p) => p.Team !== 'Dead');
  }

  get deadPlayers(): Player[] {
    return this.players.filter((p) => p.Team === 'Dead');
  }

  /** Front layer of the crossfade stage; re-keyed on change so the fade replays. */
  get stageFront(): string {
    return this.imageSrc(this.activeImageIndex);
  }

  private imageSrc(index: number): string {
    return `/assets/showcase/full/${this.galleryImages[index]}`;
  }

  pickImage(index: number, manual = true): void {
    const len = this.galleryImages.length;
    if (manual) this.lastManual = Date.now();
    this.stageBehind = this.imageSrc(this.activeImageIndex);
    this.activeImageIndex = ((index % len) + len) % len;
    this.preload(this.imageSrc((this.activeImageIndex + 1) % len));
  }

  nextImage(): void {
    this.pickImage(this.activeImageIndex + 1);
  }

  prevImage(): void {
    this.pickImage(this.activeImageIndex - 1);
  }

  private preload(src: string): void {
    const img = new Image();
    img.src = src;
  }

  /** Auto-advance the gallery; pauses after manual interaction, skips under reduced motion. */
  private startSlideshow(): void {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    this.slideshowTimer = setInterval(() => {
      if (Date.now() - this.lastManual < this.manualResumeDelay) return;
      this.pickImage(this.activeImageIndex + 1, false);
    }, this.slideInterval);
  }
}
