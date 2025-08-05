import {Component} from '@angular/core';
import {Footer} from "../../core/layouts/layout2/component/footer";
import {Property} from "../../core/models/http/property.model";

@Component({
  selector: 'app-homepage',
  standalone: true,
  imports: [Footer],
  templateUrl: './homepage.component.html',
  styleUrls: ['./homepage.component.scss']
})
export class HomepageComponent {
  properties: Property[] = [];
}
