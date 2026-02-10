import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdvertisementService } from '../services/advertisement.service';
import { AuthService } from '../services/auth.service';
import { NotificationService } from '../services/notification.service';
import { Subscription } from 'rxjs';
import type { AdvertisementGetResponse, AdvertisementLocations } from '@zeitvertreib/types';
import { ADVERTISEMENT_LOCATIONS } from '@zeitvertreib/types';

interface CalendarDay {
    date: string; // YYYY-MM-DD
    dayNumber: number;
    isCurrentMonth: boolean;
    isToday: boolean;
    bookedLocations: AdvertisementLocations[];
    ownedStatuses: Map<AdvertisementLocations, string>;
    freeSlots: number;
    totalSlots: number;
}

const LOCATION_LABELS: Record<string, string> = {
    LOCATION_1: 'Platz 1',
    LOCATION_2: 'Platz 2',
    LOCATION_3: 'Platz 3',
    LOCATION_4: 'Platz 4',
    LOCATION_5: 'Platz 5',
};

const PRICE_PER_DAY = 50;

@Component({
    selector: 'app-advertisement',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './advertisement.component.html',
    styleUrl: './advertisement.component.css',
})
export class AdvertisementComponent implements OnInit, OnDestroy {
    // Calendar state
    currentMonth: number = 0;
    currentYear: number = 0;
    calendarDays: CalendarDay[] = [];
    weekDays = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
    monthNames = [
        'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
        'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
    ];

    // Data
    advertisements: AdvertisementGetResponse['advertisements'] = [];
    allLocations = [...ADVERTISEMENT_LOCATIONS];
    locationLabels = LOCATION_LABELS;

    // Filter
    selectedFilters: Set<AdvertisementLocations> = new Set(ADVERTISEMENT_LOCATIONS);
    isFilterOpen = false;

    // Booking state
    isBookingMode = false;
    selectedDates: Set<string> = new Set();
    selectedLocation: AdvertisementLocations = 'LOCATION_1';
    bookingImage: string | null = null;
    bookingImageName: string = '';
    isSubmitting = false;

    // Auth
    isLoggedIn = false;
    userBalance = 0;

    // Loading
    isLoading = true;

    private authSub?: Subscription;
    private userDataSub?: Subscription;

    constructor(
        private adService: AdvertisementService,
        private authService: AuthService,
        private notify: NotificationService,
    ) { }

    ngOnInit(): void {
        const now = new Date();
        this.currentMonth = now.getMonth() + 1;
        this.currentYear = now.getFullYear();

        this.authSub = this.authService.currentUser$.subscribe((user) => {
            this.isLoggedIn = !!user;
        });

        this.userDataSub = this.authService.currentUserData$.subscribe((data) => {
            this.userBalance = data?.playerData?.experience ?? 0;
        });

        this.loadMonth();
    }

    ngOnDestroy(): void {
        this.authSub?.unsubscribe();
        this.userDataSub?.unsubscribe();
    }

    // --- Navigation ---

    prevMonth(): void {
        this.currentMonth--;
        if (this.currentMonth < 1) {
            this.currentMonth = 12;
            this.currentYear--;
        }
        this.clearBookingSelection();
        this.loadMonth();
    }

    nextMonth(): void {
        this.currentMonth++;
        if (this.currentMonth > 12) {
            this.currentMonth = 1;
            this.currentYear++;
        }
        this.clearBookingSelection();
        this.loadMonth();
    }

    get monthLabel(): string {
        return `${this.monthNames[this.currentMonth - 1]} ${this.currentYear}`;
    }

    // --- Filter ---

    isFilterActive(loc: AdvertisementLocations): boolean {
        return this.selectedFilters.has(loc);
    }

    toggleFilter(loc: AdvertisementLocations): void {
        if (this.selectedFilters.has(loc)) {
            if (this.selectedFilters.size > 1) {
                this.selectedFilters.delete(loc);
            }
        } else {
            this.selectedFilters.add(loc);
        }
        this.buildCalendar();
    }

    selectAllFilters(): void {
        this.selectedFilters = new Set(ADVERTISEMENT_LOCATIONS);
        this.buildCalendar();
    }

    toggleFilterPanel(): void {
        this.isFilterOpen = !this.isFilterOpen;
    }

    // --- Data Loading ---

    loadMonth(): void {
        this.isLoading = true;
        this.adService.getAdvertisements(this.currentMonth, this.currentYear).subscribe({
            next: (res) => {
                this.advertisements = res.advertisements;
                this.buildCalendar();
                this.isLoading = false;
            },
            error: () => {
                this.notify.error('Fehler', 'Werbedaten konnten nicht geladen werden.');
                this.isLoading = false;
            },
        });
    }

    // --- Calendar Build ---

    private buildCalendar(): void {
        const firstDay = new Date(this.currentYear, this.currentMonth - 1, 1);
        const lastDay = new Date(this.currentYear, this.currentMonth, 0);
        const daysInMonth = lastDay.getDate();

        // Monday=0 based week start
        let startWeekday = firstDay.getDay() - 1;
        if (startWeekday < 0) startWeekday = 6;

        const today = this.getTodayString();
        const days: CalendarDay[] = [];

        // Padding days from prev month
        const prevMonthLastDay = new Date(this.currentYear, this.currentMonth - 1, 0).getDate();
        for (let i = startWeekday - 1; i >= 0; i--) {
            const d = prevMonthLastDay - i;
            const prevMonth = this.currentMonth - 1 < 1 ? 12 : this.currentMonth - 1;
            const prevYear = this.currentMonth - 1 < 1 ? this.currentYear - 1 : this.currentYear;
            days.push(this.createDayEntry(d, prevMonth, prevYear, false, today));
        }

        // Current month days
        for (let d = 1; d <= daysInMonth; d++) {
            days.push(this.createDayEntry(d, this.currentMonth, this.currentYear, true, today));
        }

        // Padding days from next month
        const remaining = 7 - (days.length % 7);
        if (remaining < 7) {
            const nextMonth = this.currentMonth + 1 > 12 ? 1 : this.currentMonth + 1;
            const nextYear = this.currentMonth + 1 > 12 ? this.currentYear + 1 : this.currentYear;
            for (let d = 1; d <= remaining; d++) {
                days.push(this.createDayEntry(d, nextMonth, nextYear, false, today));
            }
        }

        this.calendarDays = days;
    }

    private createDayEntry(day: number, month: number, year: number, isCurrentMonth: boolean, today: string): CalendarDay {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const filteredLocations = [...this.selectedFilters];

        const bookedLocations: AdvertisementLocations[] = [];
        const ownedStatuses = new Map<AdvertisementLocations, string>();

        for (const ad of this.advertisements) {
            if (ad.date === dateStr && filteredLocations.includes(ad.location)) {
                bookedLocations.push(ad.location);
                if (ad.status) {
                    ownedStatuses.set(ad.location, ad.status);
                }
            }
        }

        return {
            date: dateStr,
            dayNumber: day,
            isCurrentMonth,
            isToday: dateStr === today,
            bookedLocations,
            ownedStatuses,
            freeSlots: filteredLocations.length - bookedLocations.length,
            totalSlots: filteredLocations.length,
        };
    }

    private getTodayString(): string {
        const now = new Date();
        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Europe/Berlin',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        });
        return formatter.format(now);
    }

    // --- Fill level helpers ---

    getFillPercent(day: CalendarDay): number {
        if (day.totalSlots === 0) return 0;
        return ((day.totalSlots - day.freeSlots) / day.totalSlots) * 100;
    }

    getFillClass(day: CalendarDay): string {
        const pct = this.getFillPercent(day);
        if (pct === 0) return 'fill-empty';
        if (pct < 50) return 'fill-low';
        if (pct < 100) return 'fill-high';
        return 'fill-full';
    }

    // --- Booking Mode ---

    enterBookingMode(): void {
        if (!this.isLoggedIn) {
            this.notify.warn('Anmeldung erforderlich', 'Bitte melde dich an, um Werbung zu buchen.');
            return;
        }
        this.isBookingMode = true;
        this.selectedDates.clear();
        this.bookingImage = null;
        this.bookingImageName = '';
    }

    cancelBooking(): void {
        this.isBookingMode = false;
        this.clearBookingSelection();
    }

    private clearBookingSelection(): void {
        this.selectedDates.clear();
        this.bookingImage = null;
        this.bookingImageName = '';
    }

    toggleDateSelection(day: CalendarDay): void {
        if (!this.isBookingMode || !day.isCurrentMonth) return;

        // Check if the selected location is free on this day
        const isBooked = this.advertisements.some(
            (ad) => ad.date === day.date && ad.location === this.selectedLocation,
        );
        if (isBooked) {
            this.notify.warn('Belegt', `${LOCATION_LABELS[this.selectedLocation]} ist am ${this.formatDateDisplay(day.date)} bereits belegt.`);
            return;
        }

        // Don't allow past dates
        if (day.date < this.getTodayString()) {
            this.notify.warn('Vergangen', 'Vergangene Tage können nicht gebucht werden.');
            return;
        }

        if (this.selectedDates.has(day.date)) {
            this.selectedDates.delete(day.date);
        } else {
            this.selectedDates.add(day.date);
        }
    }

    isDateSelected(day: CalendarDay): boolean {
        return this.selectedDates.has(day.date);
    }

    get totalCost(): number {
        return this.selectedDates.size * PRICE_PER_DAY;
    }

    get canAfford(): boolean {
        return this.userBalance >= this.totalCost;
    }

    formatDateDisplay(dateStr: string): string {
        const parts = dateStr.split('-');
        return `${parts[2]}.${parts[1]}.${parts[0]}`;
    }

    // --- Image Upload ---

    onImageSelected(event: Event): void {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            this.notify.error('Ungültige Datei', 'Bitte wähle eine Bilddatei aus.');
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            this.notify.error('Zu groß', 'Die Datei darf maximal 5 MB groß sein.');
            return;
        }

        this.bookingImageName = file.name;
        const reader = new FileReader();
        reader.onload = () => {
            this.bookingImage = reader.result as string;
        };
        reader.readAsDataURL(file);
    }

    // --- Submit ---

    submitBooking(): void {
        if (this.selectedDates.size === 0 || !this.bookingImage || this.isSubmitting) return;

        if (!this.canAfford) {
            this.notify.error('Nicht genügend ZVC', `Du benötigst ${this.totalCost} ZVC, hast aber nur ${this.userBalance} ZVC.`);
            return;
        }

        this.isSubmitting = true;
        const payload = {
            location: this.selectedLocation,
            dates: Array.from(this.selectedDates).sort(),
            full_res: this.bookingImage,
        };

        this.adService.createAdvertisement(payload).subscribe({
            next: (res) => {
                this.notify.success('Gebucht!', res.message);
                this.isBookingMode = false;
                this.clearBookingSelection();
                this.authService.refreshUserData();
                this.loadMonth();
                this.isSubmitting = false;
            },
            error: (err) => {
                const msg = err.error?.error || 'Buchung fehlgeschlagen.';
                this.notify.error('Fehler', msg);
                this.isSubmitting = false;
            },
        });
    }
}
