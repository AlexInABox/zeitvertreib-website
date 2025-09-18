import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PrimeIcons } from 'primeng/api';
import {
  FinancialService,
  FinancialTransaction,
  FinancialSummary,
  RecurringTransaction,
} from '../services/financial.service';
import { AuthService } from '../services/auth.service';

interface EventItem {
  id?: number;
  service: string;
  amount: number;
  description: string;
  date: Date;
  icon: string;
  type: 'income' | 'expense';
}

interface MonthlyBreakdown {
  name: string;
  month: number;
  year: number;
  income: number;
  expenses: number;
  balance: number;
  coveragePercentage: number;
}

@Component({
  selector: 'app-accounting',
  imports: [CommonModule, FormsModule],
  templateUrl: './accounting.component.html',
  styleUrl: './accounting.component.css',
})
export class AccountingComponent implements OnInit {
  // Financial overview properties
  currentBalance: number = 0;
  monthlyIncome: number = 0;
  monthlyExpenses: number = 0;
  averageMonthlyIncome: number = 0;
  averageMonthlyExpenses: number = 0;
  coveragePercentage: number = 0;
  threeMonthProjection: number = 0;
  burnRate: number = 0;

  // Transaction properties
  events: EventItem[] = [];
  filteredEvents: EventItem[] = [];
  currentFilter: 'all' | 'income' | 'expenses' = 'all';

  // Monthly breakdown
  monthlyBreakdown: MonthlyBreakdown[] = [];

  // Admin check - only admin can create/edit transactions
  isAdmin = false;

  // Modal and form properties
  showTransactionModal = false;
  showRecurringModal = false;
  editingTransaction: EventItem | null = null;
  editingRecurring: RecurringTransaction | null = null;
  isSubmitting = false;
  transactionFormData = {
    type: '',
    category: '',
    amount: 0,
    description: '',
    date: '',
    title: '',
  };
  recurringFormData = {
    type: '',
    category: '',
    amount: 0,
    description: '',
    frequency: '',
    start_date: '',
    end_date: '',
    title: '',
  };

  // Recurring transactions
  recurringTransactions: RecurringTransaction[] = [];

  constructor(
    private financialService: FinancialService,
    private authService: AuthService,
  ) {
    this.initializeData();
    this.checkAdminStatus();
  }

  ngOnInit() {
    this.loadFinancialData();
    this.loadRecurringTransactions();
  }

  private loadRecurringTransactions() {
    this.financialService.getRecurringTransactions().subscribe({
      next: (recurring) => {
        this.recurringTransactions = recurring;
        console.log('Loaded recurring transactions:', recurring);
      },
      error: (error) => {
        console.error('Error loading recurring transactions:', error);
      },
    });
  }

  private loadFinancialData() {
    this.financialService.getTransactions().subscribe({
      next: (transactions) => {
        console.log('Received transactions:', transactions);

        if (transactions && transactions.length > 0) {
          this.events = transactions.map((transaction) => ({
            id: transaction.id,
            service: transaction.service || transaction.category,
            amount: transaction.amount,
            description: transaction.description,
            date: new Date(transaction.date || transaction.transaction_date),
            icon:
              (transaction.type || transaction.transaction_type) === 'income'
                ? PrimeIcons.PLUS_CIRCLE
                : PrimeIcons.MINUS_CIRCLE,
            type: (transaction.type || transaction.transaction_type) as
              | 'income'
              | 'expense',
          }));
        } else {
          console.log('No transactions received, using sample data');
          this.initializeData();
        }

        this.calculateFinancialMetrics();
        this.generateMonthlyBreakdown();
        this.filterTransactions('all');
      },
      error: (error) => {
        console.error('Error loading financial data:', error);
        // Fallback to sample data if API fails
        this.initializeData();
        this.calculateFinancialMetrics();
        this.generateMonthlyBreakdown();
        this.filterTransactions('all');
      },
    });
  }

  private checkAdminStatus() {
    this.authService.currentUser$.subscribe((user) => {
      // Check if user is admin (Steam ID: 76561198354414854)
      this.isAdmin = user?.steamid === '76561198354414854';
    });
  }

  private initializeData() {
    // Fallback sample data - used when API is unavailable
    this.events = [
      {
        service: 'Dedicated Server',
        amount: 35.32,
        description: 'Hetzner - Monatliche Serverkosten',
        date: new Date('2025-01-01'),
        icon: 'pi pi-server',
        type: 'expense',
      },
      {
        service: 'DDoS Protection',
        amount: 15.2,
        description: 'Cloudflare Pro Plan',
        date: new Date('2025-01-02'),
        icon: 'pi pi-shield',
        type: 'expense',
      },
      {
        service: 'Domain Renewal',
        amount: 12.99,
        description: 'zeitvertreib.dev - Jahresgebühr',
        date: new Date('2025-01-15'),
        icon: 'pi pi-globe',
        type: 'expense',
      },
      {
        service: 'SSL Zertifikat',
        amount: 8.5,
        description: 'Wildcard SSL für alle Subdomains',
        date: new Date('2025-01-20'),
        icon: 'pi pi-lock',
        type: 'expense',
      },
      {
        service: 'Spende',
        amount: 25.0,
        description: 'fear157 - PayPal Donation',
        date: new Date('2025-01-03'),
        icon: 'pi pi-heart',
        type: 'income',
      },
      {
        service: 'Spende',
        amount: 10.0,
        description: 'Anonymous - Twitch Donation',
        date: new Date('2025-01-10'),
        icon: 'pi pi-heart',
        type: 'income',
      },
      {
        service: 'Spende',
        amount: 50.0,
        description: 'CommunitySupporter - Ko-fi',
        date: new Date('2025-01-12'),
        icon: 'pi pi-heart',
        type: 'income',
      },
      {
        service: 'Merchandise',
        amount: 15.99,
        description: 'T-Shirt Verkauf',
        date: new Date('2025-01-25'),
        icon: 'pi pi-shopping-cart',
        type: 'income',
      },
      // Previous months data
      {
        service: 'Dedicated Server',
        amount: 35.32,
        description: 'Hetzner - Dezember',
        date: new Date('2024-12-01'),
        icon: 'pi pi-server',
        type: 'expense',
      },
      {
        service: 'DDoS Protection',
        amount: 15.2,
        description: 'Cloudflare Pro Plan',
        date: new Date('2024-12-02'),
        icon: 'pi pi-shield',
        type: 'expense',
      },
      {
        service: 'Spende',
        amount: 30.0,
        description: 'GamerFriend - Dezember',
        date: new Date('2024-12-15'),
        icon: 'pi pi-heart',
        type: 'income',
      },
      {
        service: 'Spende',
        amount: 20.0,
        description: 'StreamViewer - Dezember',
        date: new Date('2024-12-20'),
        icon: 'pi pi-heart',
        type: 'income',
      },
      // November data
      {
        service: 'Dedicated Server',
        amount: 35.32,
        description: 'Hetzner - November',
        date: new Date('2024-11-01'),
        icon: 'pi pi-server',
        type: 'expense',
      },
      {
        service: 'DDoS Protection',
        amount: 15.2,
        description: 'Cloudflare Pro Plan',
        date: new Date('2024-11-02'),
        icon: 'pi pi-shield',
        type: 'expense',
      },
      {
        service: 'Spende',
        amount: 40.0,
        description: 'TopDonator - November',
        date: new Date('2024-11-10'),
        icon: 'pi pi-heart',
        type: 'income',
      },
    ];

    // Sort events by date (newest first)
    this.events.sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  private calculateFinancialMetrics() {
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();

    // Calculate current month's income and expenses
    const currentMonthEvents = this.events.filter(
      (event) =>
        event.date.getMonth() === currentMonth &&
        event.date.getFullYear() === currentYear,
    );

    this.monthlyIncome = currentMonthEvents
      .filter((event) => event.type === 'income')
      .reduce((sum, event) => sum + event.amount, 0);

    this.monthlyExpenses = currentMonthEvents
      .filter((event) => event.type === 'expense')
      .reduce((sum, event) => sum + event.amount, 0);

    // Calculate total balance
    const totalIncome = this.events
      .filter((event) => event.type === 'income')
      .reduce((sum, event) => sum + event.amount, 0);

    const totalExpenses = this.events
      .filter((event) => event.type === 'expense')
      .reduce((sum, event) => sum + event.amount, 0);

    this.currentBalance = totalIncome - totalExpenses;

    // Calculate averages (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const recentEvents = this.events.filter(
      (event) => event.date >= sixMonthsAgo,
    );
    const monthlyTotals = new Map<
      string,
      { income: number; expenses: number }
    >();

    recentEvents.forEach((event) => {
      const monthKey = `${event.date.getFullYear()}-${event.date.getMonth()}`;
      if (!monthlyTotals.has(monthKey)) {
        monthlyTotals.set(monthKey, { income: 0, expenses: 0 });
      }

      const monthly = monthlyTotals.get(monthKey)!;
      if (event.type === 'income') {
        monthly.income += event.amount;
      } else {
        monthly.expenses += event.amount;
      }
    });

    const months = Array.from(monthlyTotals.values());
    this.averageMonthlyIncome =
      months.reduce((sum, month) => sum + month.income, 0) / months.length || 0;
    this.averageMonthlyExpenses =
      months.reduce((sum, month) => sum + month.expenses, 0) / months.length ||
      0;

    // Calculate coverage percentage
    this.coveragePercentage =
      this.averageMonthlyExpenses > 0
        ? Math.min(
            100,
            (this.averageMonthlyIncome / this.averageMonthlyExpenses) * 100,
          )
        : 100;

    // Calculate 3-month projection
    this.threeMonthProjection =
      (this.averageMonthlyIncome - this.averageMonthlyExpenses) * 3;

    // Calculate burn rate (how many months current balance will last)
    this.burnRate =
      this.averageMonthlyExpenses > 0 && this.currentBalance > 0
        ? this.currentBalance / this.averageMonthlyExpenses
        : 0;
  }

  private generateMonthlyBreakdown() {
    const months = new Map<string, MonthlyBreakdown>();

    // Get last 6 months
    for (let i = 0; i < 6; i++) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const monthKey = `${date.getFullYear()}-${date.getMonth()}`;

      months.set(monthKey, {
        name: date.toLocaleDateString('de-DE', {
          month: 'long',
          year: 'numeric',
        }),
        month: date.getMonth(),
        year: date.getFullYear(),
        income: 0,
        expenses: 0,
        balance: 0,
        coveragePercentage: 0,
      });
    }

    // Calculate monthly totals
    this.events.forEach((event) => {
      const monthKey = `${event.date.getFullYear()}-${event.date.getMonth()}`;
      const monthData = months.get(monthKey);

      if (monthData) {
        if (event.type === 'income') {
          monthData.income += event.amount;
        } else {
          monthData.expenses += event.amount;
        }
      }
    });

    // Calculate balance and coverage for each month
    months.forEach((monthData) => {
      monthData.balance = monthData.income - monthData.expenses;
      monthData.coveragePercentage =
        monthData.expenses > 0
          ? Math.min(100, (monthData.income / monthData.expenses) * 100)
          : 100;
    });

    this.monthlyBreakdown = Array.from(months.values());
  }

  filterTransactions(filter: 'all' | 'income' | 'expenses') {
    this.currentFilter = filter;

    switch (filter) {
      case 'income':
        this.filteredEvents = this.events.filter(
          (event) => event.type === 'income',
        );
        break;
      case 'expenses':
        this.filteredEvents = this.events.filter(
          (event) => event.type === 'expense',
        );
        break;
      default:
        this.filteredEvents = [...this.events];
    }
  }

  // Modal methods
  openAddTransactionModal() {
    this.editingTransaction = null;
    this.resetForm();
    this.showTransactionModal = true;
  }

  editTransaction(event: EventItem) {
    this.editingTransaction = event;
    this.transactionFormData = {
      type: event.type,
      category: 'other', // Default category, user will need to select the correct one
      amount: event.amount,
      description: event.description,
      date: event.date.toISOString().split('T')[0], // Format date for input
      title: event.service || '', // Use service field as title
    };
    this.showTransactionModal = true;
  }

  closeTransactionModal() {
    this.showTransactionModal = false;
    this.editingTransaction = null;
    this.resetForm();
  }

  deleteTransaction(event: EventItem) {
    if (
      confirm('Sind Sie sicher, dass Sie diese Transaktion löschen möchten?')
    ) {
      // Find the transaction ID (we need to add this to EventItem interface)
      const transactionId = (event as any).id;
      if (transactionId) {
        this.financialService.deleteTransaction(transactionId).subscribe({
          next: () => {
            console.log('Transaction deleted successfully');
            this.loadFinancialData(); // Reload data
          },
          error: (error) => {
            console.error('Error deleting transaction:', error);
            alert(
              'Fehler beim Löschen der Transaktion: ' +
                (error.error?.error || error.message || 'Unbekannter Fehler'),
            );
          },
        });
      } else {
        alert('Transaktion ID nicht gefunden');
      }
    }
  }

  saveTransaction() {
    if (
      !this.transactionFormData.type ||
      !this.transactionFormData.category ||
      !this.transactionFormData.amount ||
      !this.transactionFormData.description ||
      !this.transactionFormData.date ||
      !this.transactionFormData.title
    ) {
      alert('Bitte füllen Sie alle Pflichtfelder aus.');
      return;
    }

    this.isSubmitting = true;

    const transactionData = {
      transaction_type: this.transactionFormData.type as 'income' | 'expense',
      category: this.transactionFormData.category,
      amount: Number(this.transactionFormData.amount), // Ensure it's a number
      description: this.transactionFormData.description,
      transaction_date: this.transactionFormData.date,
      // Store title in notes field for proper handling
      reference_id: '',
      notes: this.transactionFormData.title,
    };

    console.log('Sending transaction data:', transactionData);

    if (this.editingTransaction) {
      // Update existing transaction
      const transactionId = (this.editingTransaction as any).id;
      this.financialService
        .updateTransaction(transactionId, transactionData)
        .subscribe({
          next: () => {
            console.log('Transaction updated successfully');
            this.loadFinancialData(); // Reload data
            this.closeTransactionModal();
          },
          error: (error) => {
            console.error('Error updating transaction:', error);
            alert(
              'Fehler beim Aktualisieren der Transaktion: ' +
                (error.error?.error || error.message || 'Unbekannter Fehler'),
            );
            this.isSubmitting = false; // Reset loading state on error
          },
          complete: () => {
            this.isSubmitting = false;
          },
        });
    } else {
      // Create new transaction
      this.financialService.createTransaction(transactionData).subscribe({
        next: () => {
          console.log('Transaction created successfully');
          this.loadFinancialData(); // Reload data
          this.closeTransactionModal();
        },
        error: (error) => {
          console.error('Error creating transaction:', error);
          alert(
            'Fehler beim Erstellen der Transaktion: ' +
              (error.error?.error || error.message || 'Unbekannter Fehler'),
          );
          this.isSubmitting = false; // Reset loading state on error
        },
        complete: () => {
          this.isSubmitting = false;
        },
      });
    }
  }

  private resetForm() {
    this.transactionFormData = {
      type: '',
      category: '',
      amount: 0,
      description: '',
      date: new Date().toISOString().split('T')[0], // Default to today
      title: '',
    };
  }

  // Recurring transaction modal methods
  openAddRecurringModal() {
    this.editingRecurring = null;
    this.resetRecurringForm();
    this.showRecurringModal = true;
  }

  editRecurringTransaction(recurring: RecurringTransaction) {
    this.editingRecurring = recurring;
    this.recurringFormData = {
      type: recurring.transaction_type,
      category: recurring.category,
      amount: recurring.amount,
      description: recurring.description,
      frequency: recurring.frequency,
      start_date: recurring.start_date,
      end_date: recurring.end_date || '',
      title: recurring.notes || '',
    };
    this.showRecurringModal = true;
  }

  closeRecurringModal() {
    this.showRecurringModal = false;
    this.editingRecurring = null;
    this.resetRecurringForm();
  }

  deleteRecurringTransaction(recurring: RecurringTransaction) {
    if (
      confirm(
        'Sind Sie sicher, dass Sie diese wiederkehrende Transaktion löschen möchten?',
      )
    ) {
      const recurringId = recurring.id;
      if (recurringId) {
        this.financialService
          .deleteRecurringTransaction(recurringId)
          .subscribe({
            next: () => {
              console.log('Recurring transaction deleted successfully');
              this.loadRecurringTransactions(); // Reload data
            },
            error: (error) => {
              console.error('Error deleting recurring transaction:', error);
              alert(
                'Fehler beim Löschen der wiederkehrenden Transaktion: ' +
                  (error.error?.error || error.message || 'Unbekannter Fehler'),
              );
            },
          });
      } else {
        alert('Wiederkehrende Transaktion ID nicht gefunden');
      }
    }
  }

  saveRecurringTransaction() {
    if (
      !this.recurringFormData.type ||
      !this.recurringFormData.category ||
      !this.recurringFormData.amount ||
      !this.recurringFormData.description ||
      !this.recurringFormData.frequency ||
      !this.recurringFormData.start_date ||
      !this.recurringFormData.title
    ) {
      alert('Bitte füllen Sie alle Pflichtfelder aus.');
      return;
    }

    this.isSubmitting = true;

    const recurringData = {
      transaction_type: this.recurringFormData.type as 'income' | 'expense',
      category: this.recurringFormData.category,
      amount: Number(this.recurringFormData.amount),
      description: this.recurringFormData.description,
      frequency: this.recurringFormData.frequency as
        | 'daily'
        | 'weekly'
        | 'monthly'
        | 'yearly',
      start_date: this.recurringFormData.start_date,
      end_date: this.recurringFormData.end_date || undefined,
      reference_id: '',
      notes: this.recurringFormData.title,
      next_execution: this.recurringFormData.start_date, // Will be calculated by backend
    };

    console.log('Sending recurring transaction data:', recurringData);

    if (this.editingRecurring) {
      // Update existing recurring transaction
      const recurringId = this.editingRecurring.id!;
      this.financialService
        .updateRecurringTransaction(recurringId, recurringData)
        .subscribe({
          next: () => {
            console.log('Recurring transaction updated successfully');
            this.loadRecurringTransactions(); // Reload data
            this.closeRecurringModal();
          },
          error: (error) => {
            console.error('Error updating recurring transaction:', error);
            alert(
              'Fehler beim Aktualisieren der wiederkehrenden Transaktion: ' +
                (error.error?.error || error.message || 'Unbekannter Fehler'),
            );
            this.isSubmitting = false;
          },
          complete: () => {
            this.isSubmitting = false;
          },
        });
    } else {
      // Create new recurring transaction
      this.financialService
        .createRecurringTransaction(recurringData)
        .subscribe({
          next: () => {
            console.log('Recurring transaction created successfully');
            this.loadRecurringTransactions(); // Reload data
            this.closeRecurringModal();
          },
          error: (error) => {
            console.error('Error creating recurring transaction:', error);
            alert(
              'Fehler beim Erstellen der wiederkehrenden Transaktion: ' +
                (error.error?.error || error.message || 'Unbekannter Fehler'),
            );
            this.isSubmitting = false;
          },
          complete: () => {
            this.isSubmitting = false;
          },
        });
    }
  }

  private resetRecurringForm() {
    this.recurringFormData = {
      type: '',
      category: '',
      amount: 0,
      description: '',
      frequency: '',
      start_date: new Date().toISOString().split('T')[0],
      end_date: '',
      title: '',
    };
  }
}
