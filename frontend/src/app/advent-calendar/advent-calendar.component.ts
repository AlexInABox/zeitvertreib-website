import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AdventCalendarService } from '../services/advent-calendar.service';
import { AuthService } from '../services/auth.service';
import type { UserData } from '../services/auth.service';
import type { AdventCalendarDoor, GetAdventCalendarResponse, RedeemAdventDoorResponse } from '@zeitvertreib/types';

@Component({
    selector: 'app-advent-calendar',
    standalone: true,
    imports: [CommonModule, RouterModule],
    templateUrl: './advent-calendar.component.html',
    styleUrls: ['./advent-calendar.component.css'],
})
export class AdventCalendarComponent implements OnInit {
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

    // Randomized door tilt/offset for a handcrafted feel
    private doorTilts: Map<number, number> = new Map();
    private doorOffsets: Map<number, number> = new Map();

    constructor(private adventCalendarService: AdventCalendarService, private authService: AuthService) {
        this.generateSnowflakes();
        this.generateDoorStyles();
        this.authService.currentUserData$.subscribe((data: UserData | null) => {
            this.isDonator = data?.isDonator ?? false;
        });
    }

    get openedCount(): number {
        return this.doors.filter((item) => item.opened).length;
    }

    get progressPercent(): number {
        const percent = (this.openedCount / 24) * 100;
        return Math.min(100, Math.max(0, Math.round(percent)));
    }

    get todayDoor(): AdventCalendarDoor | undefined {
        return this.doors.find((item) => item.day === this.currentDay);
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

    getDoorTilt(day: number): string {
        const value = this.doorTilts.get(day) ?? 0;
        return `${value}deg`;
    }

    getDoorOffset(day: number): string {
        const value = this.doorOffsets.get(day) ?? 0;
        return `${value}px`;
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

    private generateDoorStyles(): void {
        for (let day = 1; day <= 24; day++) {
            const tilt = -6 + Math.random() * 12; // -6deg to 6deg
            const offset = -8 + Math.random() * 16; // -8px to 8px
            this.doorTilts.set(day, tilt);
            this.doorOffsets.set(day, offset);
        }
    }
}
