import {Component} from '@angular/core';
import {Property} from "../../core/models/http/property.model";

@Component({
  selector: 'app-homepage',
  standalone: true,
  imports: [],
  templateUrl: './homepage.component.html',
  styleUrls: ['./homepage.component.scss']
})
export class HomepageComponent {
  properties: Property[] = [];
}
