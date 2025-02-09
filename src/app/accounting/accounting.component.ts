import { Component } from '@angular/core';
import { Timeline } from 'primeng/timeline';
import { ProgressBar } from 'primeng/progressbar';
import { PrimeIcons } from 'primeng/api';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';

interface EventItem {
  title: string,
  amount: number,
  description?: string,
  date: Date,
  icon: PrimeIcons,
  color: string,
  sign: string
}

@Component({
  selector: 'app-accounting',
  imports: [Timeline, CardModule, ButtonModule, ProgressBar],
  templateUrl: './accounting.component.html',
  styleUrl: './accounting.component.css'
})
export class AccountingComponent {
  trueValue: number = 100;
  valueCapped: number = 100;

  events: EventItem[];

  constructor() {
    this.events = [
      {
        title: 'Hetzner',
        amount: 35.32,
        description: 'Rent for the apartment',
        date: new Date('2025-02-01'),
        icon: PrimeIcons.MINUS_CIRCLE,
        color: 'red',
        sign: '-'
      },
      {
        title: 'Spende',
        amount: 15.20,
        description: 'Rent for the apartment',
        date: new Date('2025-02-01'),
        icon: PrimeIcons.PLUS_CIRCLE,
        color: 'green',
        sign: '+'
      },
    ]

    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    let totalExpenses = 0;
    let totalDonations = 0;

    this.events.filter(event => event.date >= threeMonthsAgo).forEach(event => {
      if (event.icon === PrimeIcons.MINUS_CIRCLE) {
        totalExpenses += event.amount;
      } else if (event.icon === PrimeIcons.PLUS_CIRCLE) {
        totalDonations += event.amount;
      }
    });

    if (totalExpenses > 0) {
      this.trueValue = Math.round((totalDonations / totalExpenses) * 100); // Calculate the percentage
      this.valueCapped = Math.min(this.trueValue, 100);
    } else {
      this.trueValue = 100;
      this.valueCapped = 100;
    }
  }
}
