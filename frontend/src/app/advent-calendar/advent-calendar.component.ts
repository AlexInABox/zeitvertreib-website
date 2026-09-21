import { Component, OnDestroy, OnInit, ChangeDetectionStrategy, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { AdventCalendarService } from '../services/advent-calendar.service';
import { AuthService } from '../services/auth.service';
import type { UserData } from '../services/auth.service';
import type { AdventCalendarDoor, GetAdventCalendarResponse, RedeemAdventDoorResponse } from '@zeitvertreib/types';
import { IconComponent } from '../components/icon/icon.component';
import { JuleNavComponent } from '../components/jule-nav/jule-nav.component';
import { JuleFooterComponent } from '../components/jule-footer/jule-footer.component';

/** Seasonal advent calendar: one ZVC reward per day through December. */
@Component({
  selector: 'app-advent-calendar',
  standalone: true,
  imports: [RouterModule, IconComponent, JuleNavComponent, JuleFooterComponent],
  templateUrl: './advent-calendar.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./advent-calendar.component.css'],
})
export class AdventCalendarComponent implements OnInit, OnDestroy {
  private adventCalendarService = inject(AdventCalendarService);
  private authService = inject(AuthService);

  doors: AdventCalendarDoor[] = [];
  isLoading = true;
  hasError = false;
  errorMessage = '';
  isDecember = false;
  currentDay = new Date().getDate();
  isRedeeming = false;
  isDonator = false;

  // Snowfall animation
  snowflakes: { left: number; delay: number; size: number }[] = [];

  constructor() {
    this.generateSnowflakes();
    this.authService.currentUserData$.subscribe((data: UserData | null) => {
      this.isDonator = data?.isDonator ?? false;
    });
  }

  get openedCount(): number {
    return this.doors.filter((item) => item.opened).length;
  }

  get missedCount(): number {
    return this.doors.filter((item) => this.getDoorState(item) === 'past').length;
  }

  get lockedCount(): number {
    return this.doors.filter((item) => this.getDoorState(item) === 'locked').length;
  }

  ngOnInit(): void {
    this.loadCalendar();
  }

  ngOnDestroy(): void {}

  loadCalendar(): void {
    this.isLoading = true;
    this.hasError = false;

    this.adventCalendarService.getAdventCalendar().subscribe({
      next: (response: GetAdventCalendarResponse) => {
        if (response.calendar === null) {
          this.isDecember = false;
          this.isLoading = false;
        } else {
          this.isDecember = true;
          this.doors = response.calendar.doors;
          this.isLoading = false;
        }
      },
      error: (error: unknown) => {
        console.error('Error loading advent calendar:', error);
        this.hasError = true;
        this.errorMessage = 'Fehler beim Laden des Adventskalenders';
        this.isLoading = false;
      },
    });
  }

  canOpenDoor(door: AdventCalendarDoor): boolean {
    if (!this.isDecember || door.opened) {
      return false;
    }

    if (this.isDonator && door.day < this.currentDay) {
      return true;
    }

    return door.day === this.currentDay;
  }

  getDoorState(door: AdventCalendarDoor): 'opened' | 'available' | 'locked' | 'past' {
    if (door.opened) {
      return 'opened';
    }
    if (door.day === this.currentDay) {
      return 'available';
    }
    if (door.day < this.currentDay) {
      return 'past';
    }
    return 'locked';
  }

  openDoor(door: AdventCalendarDoor): void {
    if (!this.canOpenDoor(door) || this.isRedeeming) {
      return;
    }

    this.isRedeeming = true;

    this.adventCalendarService.redeemDoor(door.day).subscribe({
      next: (response: RedeemAdventDoorResponse) => {
        const doorIndex = this.doors.findIndex((item) => item.day === door.day);
        if (doorIndex !== -1) {
          const updatedDoor = this.doors[doorIndex];
          updatedDoor.opened = true;
          updatedDoor.redeemedAt = Math.floor(Date.now() / 1000);
          updatedDoor.reward = response.reward;
          this.doors[doorIndex] = updatedDoor;
        }

        this.isRedeeming = false;
      },
      error: (error: any) => {
        console.error('Error redeeming door:', error);
        this.isRedeeming = false;
      },
    });
  }

  private generateSnowflakes(): void {
    for (let index = 0; index < 50; index++) {
      this.snowflakes.push({
        left: Math.random() * 100,
        delay: Math.random() * 10,
        size: 10 + Math.random() * 20,
      });
    }
  }
}
