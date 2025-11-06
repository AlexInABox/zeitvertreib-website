import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { AuthService } from '../services/auth.service';

interface CaseFolder {
  name: string;
  fileCount: number;
  files: string[];
  loading: boolean;
}

@Component({
  selector: 'app-case-management',
  imports: [CommonModule, ButtonModule, CardModule, TableModule, TagModule],
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
      .get<{ folders: string[] }>(`${environment.apiUrl}/public/folders`, {
        headers: this.getAuthHeaders(),
        withCredentials: true,
      })
      .subscribe({
        next: (response) => {
          this.caseFolders = response.folders.map((folderName) => ({
            name: folderName,
            fileCount: 0,
            files: [],
            loading: false,
          }));
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
        `${environment.apiUrl}/public/folder`,
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
            fileCount: 0,
            files: [],
            loading: false,
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

  toggleFiles(caseFolder: CaseFolder) {
    if (caseFolder.files.length > 0) {
      // Collapse files
      caseFolder.files = [];
      caseFolder.fileCount = 0;
      return;
    }

    // Load files
    caseFolder.loading = true;
    const caseId = caseFolder.name.replace('case-', '');

    this.http
      .get<{
        files: string[];
      }>(`${environment.apiUrl}/public/files?case=${caseId}`, {
        headers: this.getAuthHeaders(),
        withCredentials: true,
      })
      .subscribe({
        next: (response) => {
          caseFolder.files = response.files;
          caseFolder.fileCount = response.files.length;
          caseFolder.loading = false;
        },
        error: (error) => {
          console.error('Error loading files:', error);
          caseFolder.loading = false;
          alert(
            'Failed to load files: ' + (error.error?.error || 'Unknown error'),
          );
        },
      });
  }

  getCaseId(folderName: string): string {
    return folderName.replace('case-', '');
  }

  getFileUrl(folderName: string, fileName: string): string {
    return `https://s3.zeitvertreib.vip/test/${folderName}/${fileName}`;
  }
}
