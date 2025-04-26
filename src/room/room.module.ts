import { forwardRef, Module } from '@nestjs/common';
import { RoomService, UserRoomService, LiveblocksService } from './services';
import { RoomController, UserRoomController } from './controllers';

import { PrismaModule } from 'src/prisma/prisma.module';
import { AuthModule } from 'src/auth/auth.module';
import { UserModule } from 'src/user/user.module';
import { MailModule } from 'src/mail/mail.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  providers: [RoomService, UserRoomService, LiveblocksService],
  imports: [
    PrismaModule,
    forwardRef( () => AuthModule),
    forwardRef( () => UserModule),
    MailModule,
    ConfigModule,
  ],
  controllers: [RoomController, UserRoomController],
  exports: [
    UserRoomService
  ]
})
export class RoomModule {}
