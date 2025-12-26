import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from '../services/auth.service';
import { environment } from '../../environments/environment';
import type { PaysafeCardPostRequest, PaysafeCardGetResponse, PaysafeCardSubmissionStatus } from '@zeitvertreib/types';

interface PaysafeSubmission {
  id: number;
  cardCodeTruncated: string;
  submittedAt: number;
  processedAt: number;
  status: PaysafeCardSubmissionStatus;
  amount: number;
}

@Component({
  selector: 'app-paysafecard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './paysafecard.component.html',
  styleUrls: ['./paysafecard.component.css'],
})
export class PaysafecardComponent implements OnInit {
  cardCode = '';
  isSubmitting = false;
  isLoadingSubmissions = true;
  hasError = false;
  errorMessage = '';
  successMessage = '';
  submissions: PaysafeSubmission[] = [];

  // Animation particles
  particles: { left: number; delay: number; size: number }[] = [];

  constructor(
    private http: HttpClient,
    private authService: AuthService,
  ) {
    this.generateParticles();
  }

  ngOnInit(): void {
    this.loadSubmissions();
  }

  generateParticles(): void {
    this.particles = Array.from({ length: 20 }, () => ({
      left: Math.random() * 100,
      delay: Math.random() * 10,
      size: 14 + Math.random() * 10,
    }));
  }

  loadSubmissions(): void {
    this.isLoadingSubmissions = true;
    this.hasError = false;

    const headers = this.getAuthHeaders();
    this.http.get<PaysafeCardGetResponse>(`${environment.apiUrl}/paysafe`, { headers }).subscribe({
      next: (response) => {
        this.submissions = response.submissions;
        this.isLoadingSubmissions = false;
      },
      error: (error) => {
        console.error('Error loading submissions:', error);
        this.hasError = true;
        this.errorMessage = error?.error?.error || 'Fehler beim Laden der Einreichungen';
        this.isLoadingSubmissions = false;
      },
    });
  }

  submitCard(): void {
    if (!this.cardCode.trim()) {
      this.errorMessage = 'Bitte gib einen gültigen Paysafecard-Code ein';
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';
    this.successMessage = '';

    const headers = this.getAuthHeaders();
    const body: PaysafeCardPostRequest = {
      cardCode: this.cardCode.trim(),
    };

    this.http
      .post<{ success: boolean; message: string }>(`${environment.apiUrl}/paysafe`, body, { headers })
      .subscribe({
        next: (response) => {
          this.successMessage = response.message || 'Paysafecard erfolgreich eingereicht!';
          this.cardCode = '';
          this.isSubmitting = false;
          this.loadSubmissions(); // Refresh the list
        },
        error: (error) => {
          console.error('Error submitting card:', error);
          this.errorMessage = error?.error?.error || 'Fehler beim Einreichen der Paysafecard';
          this.isSubmitting = false;
        },
      });
  }

  getStatusClass(status: PaysafeCardSubmissionStatus): string {
    switch (status) {
      case 'approved':
        return 'status-approved';
      case 'rejected':
        return 'status-rejected';
      case 'pending':
      default:
        return 'status-pending';
    }
  }

  getStatusLabel(status: PaysafeCardSubmissionStatus): string {
    switch (status) {
      case 'approved':
        return '✅ Genehmigt';
      case 'rejected':
        return '❌ Abgelehnt';
      case 'pending':
      default:
        return '⏳ Ausstehend';
    }
  }

  formatDate(timestamp: number): string {
    return new Date(timestamp * 1000).toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private getAuthHeaders(): HttpHeaders {
    const sessionToken = this.authService.getSessionToken();
    let headers = new HttpHeaders();
    if (sessionToken) {
      headers = headers.set('Authorization', `Bearer ${sessionToken}`);
    }
    return headers;
  }
}
