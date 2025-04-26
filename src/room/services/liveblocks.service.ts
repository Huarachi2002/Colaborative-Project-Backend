import { Injectable } from '@nestjs/common';
import { Liveblocks } from '@liveblocks/node';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class LiveblocksService {
  private readonly liveblocks: Liveblocks;

  constructor(private readonly configService: ConfigService) {
    this.liveblocks = new Liveblocks({
      secret: this.configService.get<string>('LIVEBLOCKS_SECRET_KEY'),
    });
  }

  getLiveblocks(): Liveblocks {
    return this.liveblocks;
  }


  public async deleteRoom (roomId: string): Promise<boolean> {
    try {
      await this.liveblocks.deleteRoom(roomId);
      return true;
    } catch (error) {
      return false;
    }

  }
}