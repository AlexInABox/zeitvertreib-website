import { Component, OnInit, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ProgressBarModule } from 'primeng/progressbar';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../services/auth.service';
import type { GetQuestsResponse, QuestProgress } from '@zeitvertreib/types';

@Component({
  selector: 'app-quests',
  standalone: true,
  imports: [CommonModule, ButtonModule, CardModule, ProgressBarModule],
  templateUrl: './quests.component.html',
  styleUrls: ['./quests.component.css'],
})
export class QuestsComponent implements OnInit {
  dailyQuests: QuestProgress[] = [];
  weeklyQuests: QuestProgress[] = [];
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

  loadQuests(): void {
    this.isLoading = true;
    this.hasError = false;

    const headers = this.getAuthHeaders();
    this.http.get<GetQuestsResponse>(`${environment.apiUrl}/quests`, { headers }).subscribe({
      next: (response) => {
        this.dailyQuests = response.dailyQuests;
        this.weeklyQuests = response.weeklyQuests;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Failed to load quests:', error);
        this.hasError = true;
        this.errorMessage = 'Quests konnten nicht geladen werden.';
        this.isLoading = false;
      },
    });
  }

  claimReward(quest: QuestProgress): void {
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

  isQuestCompleted(quest: QuestProgress): boolean {
    return quest.isCompleted && quest.currentProgress >= quest.targetValue;
  }

  getProgressPercentage(quest: QuestProgress): number {
    if (quest.targetValue === 0) return 0;
    return Math.min((quest.currentProgress / quest.targetValue) * 100, 100);
  }

  /**
   * Return a user-friendly progress string, converting playtime from seconds to minutes.
   */
  getProgressText(quest: QuestProgress): string {
    if (quest.category.includes('playtime')) {
      const currMin = Math.floor(quest.currentProgress / 60);
      const targMin = Math.floor(quest.targetValue / 60);
      return `${currMin} / ${targMin}`;
    }
    return `${quest.currentProgress} / ${quest.targetValue}`;
  }
}
