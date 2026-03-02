import { Component, OnInit, inject, Input } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ProgressBarModule } from 'primeng/progressbar';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../services/auth.service';
import type {
  GetQuestsTodayResponse,
  GetQuestsWeeklyResponse,
  DailyQuestProgress,
} from '@zeitvertreib/types';

@Component({
  selector: 'app-daily-quests',
  standalone: true,
  imports: [CommonModule, ButtonModule, CardModule, ProgressBarModule],
  templateUrl: './daily-quests.component.html',
  styleUrls: ['./daily-quests.component.css'],
})
export class DailyQuestsComponent implements OnInit {
  @Input() questType: 'daily' | 'weekly' = 'daily';

  quests: DailyQuestProgress[] = [];
  isLoading = true;
  hasError = false;
  errorMessage = '';
  claimingQuestId: number | null = null;

  private http = inject(HttpClient);
  private authService = inject(AuthService);

  private getAuthHeaders(): HttpHeaders {
    const sessionToken = this.authService.getSessionToken();
    let headers = new HttpHeaders();
    if (sessionToken) {
      headers = headers.set('Authorization', `Bearer ${sessionToken}`);
    }
    return headers;
  }

  ngOnInit(): void {
    this.loadQuests();
  }

  get questTitle(): string {
    return this.questType === 'daily' ? '📅 Tägliche Quests' : '📆 Wöchentliche Quests';
  }

  get questSubtitle(): string {
    return this.questType === 'daily'
      ? 'Erfülle Tägliche Quests für wertvolle ZVC'
      : 'Erfülle Wöchentliche Quests für wertvolle ZVC';
  }

  loadQuests(): void {
    this.isLoading = true;
    this.hasError = false;

    const endpoint = this.questType === 'daily' ? '/quests/today' : '/quests/weekly';
    const headers = this.getAuthHeaders();
    this.http
      .get<GetQuestsTodayResponse | GetQuestsWeeklyResponse>(`${environment.apiUrl}${endpoint}`, { headers })
      .subscribe({
        next: (response) => {
          this.quests = response.quests;
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Failed to load quests:', error);
          this.hasError = true;
          this.errorMessage = 'Quests konnte nicht geladen werden.';
          this.isLoading = false;
        },
      });
  }

  claimReward(quest: DailyQuestProgress): void {
    if (this.claimingQuestId !== null) return; // Prevent multiple clicks

    this.claimingQuestId = quest.id;

    const headers = this.getAuthHeaders();
    this.http
      .post(
        `${environment.apiUrl}/quests/claim-reward`,
        {
          questId: quest.id,
        },
        { headers },
      )
      .subscribe({
        next: () => {
          // Update quest state
          quest.claimedAt = Math.floor(Date.now() / 1000);
          this.claimingQuestId = null;
        },
        error: (error) => {
          console.error('Failed to claim reward:', error);
          this.claimingQuestId = null;
          alert('Fehler beim Beanspruchen der Belohnung');
        },
      });
  }

  isQuestCompleted(quest: DailyQuestProgress): boolean {
    return quest.isCompleted && quest.currentProgress >= quest.targetValue;
  }

  getProgressPercentage(quest: DailyQuestProgress): number {
    if (quest.targetValue === 0) return 0;
    return Math.min((quest.currentProgress / quest.targetValue) * 100, 100);
  }

  /**
   * Return a user-friendly progress string, converting playtime from seconds to minutes.
   */
  getProgressText(quest: DailyQuestProgress): string {
    if (quest.category.includes('playtime')) {
      const currMin = Math.floor(quest.currentProgress / 60);
      const targMin = Math.floor(quest.targetValue / 60);
      return `${currMin} / ${targMin}`;
    }
    return `${quest.currentProgress} / ${quest.targetValue}`;
  }
}
