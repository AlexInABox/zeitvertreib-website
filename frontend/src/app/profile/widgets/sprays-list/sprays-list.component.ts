import { Component, inject, input, output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-sprays-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './sprays-list.component.html',
  styleUrls: ['./sprays-list.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class SpraysListComponent {
  private http = inject(HttpClient);
  private authService = inject(AuthService);

  sprays = input<any[]>([]);
  sprayBanned = input<boolean>(false);
  isManageView = input<boolean>(false);
  steamId = input<string | undefined>();

  sprayDeleted = output<number>();
  sprayUpdated = output<{ id: number; name: string }>();

  editingSprayId: number | null = null;
  editingSprayName = '';

  startEditSpray(spray: any) {
    this.editingSprayId = spray.id;
    this.editingSprayName = spray.name || '';
  }

  cancelEditSpray() {
    this.editingSprayId = null;
    this.editingSprayName = '';
  }

  saveSprayEdit(sprayId: number) {
    const name = this.editingSprayName.trim();
    if (!name) return alert('Name darf nicht leer sein');
    const sid = this.steamId();
    if (!sid) return;

    let headers = new HttpHeaders();
    const token = this.authService.getSessionToken();
    if (token) headers = headers.set('Authorization', `Bearer ${token}`);

    const url = `${environment.apiUrl}/profile-details/spray`;
    this.http.patch(url, { steamId: sid, sprayId, name }, { headers, withCredentials: true }).subscribe({
      next: () => {
        this.sprayUpdated.emit({ id: sprayId, name });
        this.cancelEditSpray();
      },
      error: (err) => {
        alert('Fehler beim Speichern der Änderungen');
        console.error('Error updating spray:', err);
      },
    });
  }

  deleteSpray(sprayId: number) {
    if (!confirm('Wirklich löschen?')) return;
    const sid = this.steamId();
    if (!sid) return;

    let headers = new HttpHeaders();
    const token = this.authService.getSessionToken();
    if (token) headers = headers.set('Authorization', `Bearer ${token}`);

    const url = `${environment.apiUrl}/profile-details/spray?steamId=${encodeURIComponent(sid)}&sprayId=${sprayId}`;
    this.http.delete(url, { headers, withCredentials: true }).subscribe({
      next: () => {
        this.sprayDeleted.emit(sprayId);
      },
      error: (err) => {
        alert('Fehler beim Löschen des Sprays');
        console.error('Error deleting spray:', err);
      },
    });
  }

  getDateDisplay(timestamp?: number): string {
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }
}
