import { Component, OnInit } from '@angular/core';
import { Timeline } from 'primeng/timeline';
import { ProgressBar } from 'primeng/progressbar';
import { PrimeIcons } from 'primeng/api';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { ChipModule } from 'primeng/chip';
import { Tag, TagModule } from 'primeng/tag';

interface EventItem {
  service: string,
  amount: number,
  description: string,
  date: Date,
  icon: PrimeIcons,
  color: string,
  sign: string
}

@Component({
  selector: 'app-accounting',
  imports: [Timeline, CardModule, ButtonModule, ProgressBar, ChipModule, TagModule, Tag],
  templateUrl: './accounting.component.html',
  styleUrl: './accounting.component.css'
})
export class AccountingComponent {
  trueValue: number = 100;
  valueCapped: number = 100;
  threeMonthTotal: number = 0;
  absoluteThreeMonthTotal: number = 0;
  threeMonthTotalSuccessOrDanger: "success" | "secondary" | "info" | "warn" | "danger" | "contrast" | undefined = "danger";

  events: EventItem[];

  constructor() {
    this.events = [
      {
        service: 'Dedicated Server',
        amount: 35.32,
        description: 'Hetzner',
        date: new Date('2025-02-01'),
        icon: PrimeIcons.MINUS_CIRCLE,
        color: 'red',
        sign: '-'
      },
      {
        service: 'DDoS VPS',
        amount: 15.20,
        description: 'Packets-Decreaser.NET',
        date: new Date('2025-01-01'),
        icon: PrimeIcons.MINUS_CIRCLE,
        color: 'red',
        sign: '-'
      },
      {
        service: 'Spende',
        amount: 15.20,
        description: 'fear157',
        date: new Date('2025-01-01'),
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

    this.threeMonthTotal = Math.round((totalDonations - totalExpenses) * 100) / 100;
    this.absoluteThreeMonthTotal = Math.max(this.threeMonthTotal, this.threeMonthTotal * -1);

    if (totalExpenses > 0) {
      this.trueValue = Math.round((totalDonations / totalExpenses) * 100); // Calculate the percentage
      this.valueCapped = Math.min(this.trueValue, 100);
    } else {
      this.trueValue = 100;
      this.valueCapped = 100;
    }
  }

  ngOnInit() {
    if (this.threeMonthTotal >= 0) {
      var deficitTag: HTMLElement | null = document.getElementById('deficit');
      if (deficitTag) {
        deficitTag.style.scale = '0';
        deficitTag.style.width = '0';
        deficitTag.style.height = '0';
        deficitTag.style.padding = '0';
        deficitTag.style.margin = '0';
      }
    } else {
      var surplusTag: HTMLElement | null = document.getElementById('surplus');
      if (surplusTag) {
        surplusTag.style.scale = '0';
        surplusTag.style.width = '0';
        surplusTag.style.height = '0';
        surplusTag.style.padding = '0';
        surplusTag.style.margin = '0';
      }
    }
  }
}
