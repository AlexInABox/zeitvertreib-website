import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface FinancialTransaction {
  id?: number;
  transaction_type: 'income' | 'expense';
  category: string;
  amount: number;
  description: string;
  transaction_date: string;
  created_at?: string;
  created_by?: string;
  reference_id?: string;
  notes?: string;
  // Legacy fields for UI compatibility
  date?: string;
  type?: 'income' | 'expense';
  service?: string;
}

export interface RecurringTransaction {
  id?: number;
  transaction_type: 'income' | 'expense';
  category: string;
  amount: number;
  description: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  start_date: string;
  end_date?: string;
  next_execution: string;
  is_active: boolean;
  created_at?: string;
  created_by?: string;
  reference_id?: string;
  notes?: string;
  last_executed?: string;
  // Legacy fields for UI compatibility
  type?: 'income' | 'expense';
  date?: string;
  service?: string;
}

export interface FinancialSummary {
  totalIncome: number;
  totalExpenses: number;
  currentBalance: number;
  monthlyAverage: number;
  transactionCount: number;
}

@Injectable({
  providedIn: 'root',
})
export class FinancialService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  private getAuthHeaders(): HttpHeaders {
    let headers = new HttpHeaders();
    const sessionToken = localStorage.getItem('sessionToken');
    if (sessionToken) {
      headers = headers.set('Authorization', `Bearer ${sessionToken}`);
    }
    return headers;
  }

  getTransactions(): Observable<FinancialTransaction[]> {
    return this.http
      .get<{
        transactions: FinancialTransaction[];
        total: number;
        limit: number;
        offset: number;
      }>(`${this.apiUrl}/financial/transactions`, {
        headers: this.getAuthHeaders(),
      })
      .pipe(map((response: any) => response.transactions || []));
  }

  getTransactionById(id: number): Observable<FinancialTransaction> {
    return this.http.get<FinancialTransaction>(`${this.apiUrl}/financial/transactions/${id}`, {
      headers: this.getAuthHeaders(),
    });
  }

  createTransaction(transaction: Omit<FinancialTransaction, 'id' | 'created_at'>): Observable<FinancialTransaction> {
    return this.http.post<FinancialTransaction>(`${this.apiUrl}/financial/transactions`, transaction, {
      headers: this.getAuthHeaders(),
    });
  }

  updateTransaction(id: number, transaction: Partial<FinancialTransaction>): Observable<FinancialTransaction> {
    return this.http.put<FinancialTransaction>(`${this.apiUrl}/financial/transactions/${id}`, transaction, {
      headers: this.getAuthHeaders(),
    });
  }

  deleteTransaction(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/financial/transactions/${id}`, {
      headers: this.getAuthHeaders(),
    });
  }

  getSummary(): Observable<FinancialSummary> {
    return this.http.get<FinancialSummary>(`${this.apiUrl}/financial/summary`, {
      headers: this.getAuthHeaders(),
    });
  }

  // Recurring transactions methods
  getRecurringTransactions(): Observable<RecurringTransaction[]> {
    return this.http
      .get<{ recurring_transactions: RecurringTransaction[]; total: number }>(`${this.apiUrl}/financial/recurring`, {
        headers: this.getAuthHeaders(),
      })
      .pipe(map((response: any) => response.recurring_transactions || []));
  }

  getRecurringTransactionById(id: number): Observable<RecurringTransaction> {
    return this.http.get<RecurringTransaction>(`${this.apiUrl}/financial/recurring/${id}`, {
      headers: this.getAuthHeaders(),
    });
  }

  createRecurringTransaction(
    transaction: Omit<RecurringTransaction, 'id' | 'created_at' | 'is_active'>,
  ): Observable<RecurringTransaction> {
    return this.http.post<RecurringTransaction>(`${this.apiUrl}/financial/recurring`, transaction, {
      headers: this.getAuthHeaders(),
    });
  }

  updateRecurringTransaction(id: number, transaction: Partial<RecurringTransaction>): Observable<RecurringTransaction> {
    return this.http.put<RecurringTransaction>(`${this.apiUrl}/financial/recurring/${id}`, transaction, {
      headers: this.getAuthHeaders(),
    });
  }

  deleteRecurringTransaction(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/financial/recurring/${id}`, {
      headers: this.getAuthHeaders(),
    });
  }
}
