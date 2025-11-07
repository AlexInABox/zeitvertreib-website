import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { ButtonModule } from 'primeng/button';
import { AuthService } from '../services/auth.service';

interface CaseFolder {
  name: string;
}

@Component({
  selector: 'app-case-management',
  imports: [CommonModule, ButtonModule],
  templateUrl: './case-management.component.html',
  styleUrl: './case-management.component.css',
})
export class CaseManagementComponent implements OnInit {
  caseFolders: CaseFolder[] = [];
  isLoading = true;
  hasError = false;
  errorMessage = '';

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private router: Router,
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
    this.loadCaseFolders();
  }

  loadCaseFolders() {
    this.isLoading = true;
    this.hasError = false;

    this.http
      .get<{ folders: string[] }>(`${environment.apiUrl}/cases`, {
        headers: this.getAuthHeaders(),
        withCredentials: true,
      })
      .subscribe({
        next: (response) => {
          // API returns cases ordered by creation date (oldest first), so reverse to show newest first
          this.caseFolders = response.folders
            .map((folderName) => ({
              name: folderName,
            }))
            .reverse();
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error loading case folders:', error);
          this.hasError = true;
          this.errorMessage =
            error.error?.error || 'Failed to load case folders';
          this.isLoading = false;
        },
      });
  }

  createNewCase() {
    this.http
      .post<{
        folderName: string;
      }>(
        `${environment.apiUrl}/cases`,
        {},
        {
          headers: this.getAuthHeaders(),
          withCredentials: true,
        },
      )
      .subscribe({
        next: (response) => {
          this.caseFolders.unshift({
            name: response.folderName,
          });
        },
        error: (error) => {
          console.error('Error creating case folder:', error);
          alert(
            'Failed to create case folder: ' +
              (error.error?.error || 'Unknown error'),
          );
        },
      });
  }

  openCase(caseFolder: CaseFolder) {
    const caseId = caseFolder.name.replace('case-', '');
    this.router.navigate(['/cases', caseId]);
  }

  formatCaseName(name: string): string {
    // Convert "case-123" to "Fall #123"
    const caseNumber = name.replace('case-', '');
    return `Fall #${caseNumber}`;
  }

  getRecentCasesCount(): number {
    // For now, return total count / 3 as "recent" (could be enhanced with actual timestamps)
    return Math.max(1, Math.ceil(this.caseFolders.length / 3));
  }
}
