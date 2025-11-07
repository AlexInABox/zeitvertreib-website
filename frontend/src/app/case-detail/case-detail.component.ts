import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { ButtonModule } from 'primeng/button';
import { AuthService } from '../services/auth.service';

interface CaseFile {
  name: string;
  viewUrl: string;
  expiresIn: number;
}

@Component({
  selector: 'app-case-detail',
  imports: [CommonModule, ButtonModule],
  templateUrl: './case-detail.component.html',
  styleUrl: './case-detail.component.css',
})
export class CaseDetailComponent implements OnInit {
  caseId: string = '';
  caseName: string = '';
  files: CaseFile[] = [];
  isLoading = true;
  hasError = false;
  errorMessage = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private http: HttpClient,
    private authService: AuthService,
  ) {}

  private getAuthHeaders(): HttpHeaders {
    const token = this.authService.getSessionToken();
    let headers = new HttpHeaders();
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  }

  ngOnInit() {
    this.caseId = this.route.snapshot.paramMap.get('id') || '';
    this.caseName = `case-${this.caseId}`;
    this.loadFiles();
  }

  loadFiles() {
    this.isLoading = true;
    this.hasError = false;

    this.http
      .get<{ files: CaseFile[]; expiresIn: number }>(
        `${environment.apiUrl}/cases/files?case=${this.caseId}`,
        {
          headers: this.getAuthHeaders(),
          withCredentials: true,
        },
      )
      .subscribe({
        next: (response) => {
          this.files = response.files;
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error loading files:', error);
          this.hasError = true;
          this.errorMessage = error.error?.error || 'Failed to load files';
          this.isLoading = false;
        },
      });
  }

  getFileUrl(file: CaseFile): string {
    return file.viewUrl;
  }

  goBack() {
    this.router.navigate(['/cases']);
  }
}
