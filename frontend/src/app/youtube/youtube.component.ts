import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TabsModule } from 'primeng/tabs';
import { AvatarModule } from 'primeng/avatar';
import { BadgeModule } from 'primeng/badge';
import { DividerModule } from 'primeng/divider';
import { TagModule } from 'primeng/tag';

@Component({
  selector: 'app-root',
  templateUrl: './youtube.component.html',
  styleUrls: ['./youtube.component.css'],
  imports: [CommonModule, TabsModule, BadgeModule, AvatarModule, DividerModule, TagModule]
})
export class YoutubeComponent {

}
