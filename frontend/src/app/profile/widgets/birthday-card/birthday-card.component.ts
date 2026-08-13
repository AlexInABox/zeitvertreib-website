import { Component, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BirthdayService } from '../../../services/birthday.service';

@Component({
  selector: 'app-birthday-card',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './birthday-card.component.html',
  styleUrls: ['./birthday-card.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class BirthdayCardComponent implements OnInit {
  private birthdayService = inject(BirthdayService);

  birthdayDay: number | null = null;
  birthdayMonth: number | null = null;
  birthdayYear: number | null = null;
  birthdayLastUpdated: number | null = null;
  loadingBirthday = true;
  birthdayLoading = false;
  birthdayError = '';
  isEditingBirthday = false;
  editDay: number | null = null;
  editMonth: number | null = null;
  editYear: number | null = null;
  showDeleteConfirm = false;

  private readonly THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

  ngOnInit() {
    this.loadBirthday();
  }

  loadBirthday() {
    this.loadingBirthday = true;
    this.birthdayService.getBirthday().subscribe({
      next: (response) => {
        this.birthdayLastUpdated = response.lastUpdated ?? null;
        if (response.birthday) {
          this.birthdayDay = response.birthday.day;
          this.birthdayMonth = response.birthday.month;
          this.birthdayYear = response.birthday.year ?? null;
        } else {
          this.birthdayDay = null;
          this.birthdayMonth = null;
          this.birthdayYear = null;
        }
        this.loadingBirthday = false;
      },
      error: () => {
        this.birthdayDay = null;
        this.birthdayMonth = null;
        this.birthdayYear = null;
        this.birthdayLastUpdated = null;
        this.loadingBirthday = false;
      },
    });
  }

  hasBirthday(): boolean {
    return this.birthdayDay !== null && this.birthdayMonth !== null;
  }

  isBirthdayEditDisabled(): boolean {
    if (!this.birthdayLastUpdated) return false;
    return Date.now() - this.birthdayLastUpdated < this.THIRTY_DAYS_MS;
  }

  getDaysUntilBirthdayEdit(): number {
    if (!this.birthdayLastUpdated) return 0;
    const nextEditDate = this.birthdayLastUpdated + this.THIRTY_DAYS_MS;
    const diff = nextEditDate - Date.now();
    const days = Math.ceil(diff / (24 * 60 * 60 * 1000));
    return Math.max(0, days);
  }

  getBirthdayDisplay(): string {
    if (!this.hasBirthday()) return '';
    const dayStr = String(this.birthdayDay).padStart(2, '0');
    const monthStr = String(this.birthdayMonth).padStart(2, '0');
    if (this.birthdayYear) {
      return `${dayStr}. ${this.getMonthName(this.birthdayMonth!)} ${this.birthdayYear}`;
    }
    return `${dayStr}. ${this.getMonthName(this.birthdayMonth!)}`;
  }

  getMonthName(month: number): string {
    const months = [
      'Januar',
      'Februar',
      'März',
      'April',
      'Mai',
      'Juni',
      'Juli',
      'August',
      'September',
      'Oktober',
      'November',
      'Dezember',
    ];
    return months[month - 1] || '';
  }

  startEditBirthday() {
    this.isEditingBirthday = true;
    this.editDay = this.birthdayDay;
    this.editMonth = this.birthdayMonth;
    this.editYear = this.birthdayYear;
    this.birthdayError = '';
    this.showDeleteConfirm = false;
  }

  cancelEditBirthday() {
    this.isEditingBirthday = false;
    this.editDay = null;
    this.editMonth = null;
    this.editYear = null;
    this.birthdayError = '';
    this.showDeleteConfirm = false;
  }

  saveBirthday() {
    if (this.birthdayLoading) return;
    if (!this.editDay || !this.editMonth) {
      this.birthdayError = 'Bitte gib Tag und Monat ein';
      return;
    }
    if (this.editDay < 1 || this.editDay > 31) {
      this.birthdayError = 'Tag muss zwischen 1 und 31 liegen';
      return;
    }
    if (this.editMonth < 1 || this.editMonth > 12) {
      this.birthdayError = 'Monat muss zwischen 1 und 12 liegen';
      return;
    }

    const currentYear = new Date().getFullYear();
    if (this.editYear) {
      if (this.editYear < currentYear - 100 || this.editYear > currentYear) {
        this.birthdayError = `Jahr muss zwischen ${currentYear - 100} und ${currentYear} liegen`;
        return;
      }
      const today = new Date();
      const birthDate = new Date(this.editYear, this.editMonth - 1, this.editDay);
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      if (age < 18) {
        this.birthdayError = 'Du musst mindestens 18 Jahre alt sein';
        return;
      }
    }

    this.birthdayLoading = true;
    this.birthdayError = '';

    this.birthdayService.setBirthday(this.editDay, this.editMonth, this.editYear ?? undefined).subscribe({
      next: () => {
        this.birthdayDay = this.editDay;
        this.birthdayMonth = this.editMonth;
        this.birthdayYear = this.editYear ?? null;
        this.birthdayLastUpdated = Date.now();
        this.birthdayLoading = false;
        this.isEditingBirthday = false;
      },
      error: (error) => {
        this.birthdayLoading = false;
        if (error.status === 429) {
          this.birthdayError = 'Dein Geburtstag kann nur alle 30 Tage aktualisiert werden';
        } else if (error.status === 400) {
          this.birthdayError = 'Ungültiges Datum';
        } else {
          this.birthdayError = 'Fehler beim Speichern. Bitte versuche es später erneut.';
        }
      },
    });
  }

  showDeleteBirthdayConfirm() {
    this.showDeleteConfirm = true;
  }

  cancelDeleteBirthday() {
    this.showDeleteConfirm = false;
  }

  deleteBirthday() {
    if (this.birthdayLoading) return;
    this.birthdayLoading = true;
    this.birthdayService.deleteBirthday().subscribe({
      next: () => {
        this.birthdayDay = null;
        this.birthdayMonth = null;
        this.birthdayYear = null;
        this.birthdayLastUpdated = null;
        this.birthdayLoading = false;
        this.isEditingBirthday = false;
        this.showDeleteConfirm = false;
      },
      error: () => {
        this.birthdayLoading = false;
        this.birthdayError = 'Fehler beim Löschen. Bitte versuche es später erneut.';
      },
    });
  }

  isUnder18(): boolean {
    if (!this.editYear || !this.editMonth || !this.editDay) return false;
    const today = new Date();
    const birthDate = new Date(this.editYear, this.editMonth - 1, this.editDay);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age < 18;
  }
}
