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
    ) { }

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
}
