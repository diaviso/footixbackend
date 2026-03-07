import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'FOOTIX APU SERVICES ET ON TOP OF THE WORLD';
  }
}
