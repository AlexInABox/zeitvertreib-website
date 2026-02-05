import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from './components/header/header.component';
import { DomainWarningComponent } from './components/domain-warning/domain-warning.component';
import { ToastComponent } from './components/toast/toast.component';
import { BackgroundMusicService } from './services/background-music.service';

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterOutlet, HeaderComponent, DomainWarningComponent, ToastComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements OnInit {
  title = 'zeitvertreib-website';
  showHeader = true;
  showSoundCTA: boolean = false;
  constructor(private backgroundMusic: BackgroundMusicService) {}

  //feel free to transfer this to a seperate file and then call that, but I tried it and it broke everything and killed my grandma
  private easterDates: Record<number, { month: number; day: number }> = {
    2026: { month: 3, day: 5 },
    2027: { month: 2, day: 28 },
    2028: { month: 3, day: 16 },
    2029: { month: 3, day: 1 },
    2030: { month: 3, day: 21 },
    //remind me to add more in 4 years
  };

  private isEaster(date: Date): boolean {
    const year = date.getFullYear();
    const easter = this.easterDates[year];
    if (!easter) return false;

    return date.getMonth() === easter.month && date.getDate() === easter.day;
  }

  ngOnInit(): void {
    try {
      const today = new Date();
      const isEasterToday = this.isEaster(today);
      if (isEasterToday) {
        document.body.classList.add('easter');
      } else {
        document.body.classList.remove('easter');
      }
    } catch (e) {
      console.warn('Easter background check failed', e);
    }

    // Start background music
    try {
      this.backgroundMusic.init();
    } catch (e) {
      console.warn('Failed to initialize background music', e);
    }
  }
}
