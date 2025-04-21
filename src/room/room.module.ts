import { forwardRef, Module } from '@nestjs/common';
import { RoomService,UserRoomService } from './services';
import { RoomController, UserRoomController } from './controllers';

import { PrismaModule } from 'src/prisma/prisma.module';
import { AuthModule } from 'src/auth/auth.module';
import { UserModule } from 'src/user/user.module';
import { MailModule } from 'src/mail/mail.module';

@Module({
  providers: [RoomService, UserRoomService],
  imports: [
    PrismaModule,
    forwardRef( () => AuthModule),
    forwardRef( () => UserModule),
    MailModule
  ],
  controllers: [RoomController, UserRoomController],
  exports: [
    UserRoomService
  ]
})
export class RoomModule {}
