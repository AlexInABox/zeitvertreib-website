import { Component } from '@angular/core';

import { AnimateOnScrollModule } from 'primeng/animateonscroll';
import { ImageModule } from 'primeng/image';
import { PanelModule } from 'primeng/panel';
import { CardModule } from 'primeng/card';
import { GalleriaModule } from 'primeng/galleria';

@Component({
  selector: 'app-home',
  imports: [
    AnimateOnScrollModule,
    ImageModule,
    PanelModule,
    CardModule,
    GalleriaModule,
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class HomeComponent {
  images: string[] = ['0.jpg', '1.jpg', '2.jpg', '3.jpg'];

  responsiveOptions: any[] = [
    {
      breakpoint: '1300px',
      numVisible: 2,
    },
    {
      breakpoint: '500px',
      numVisible: 1,
    },
  ];
}
