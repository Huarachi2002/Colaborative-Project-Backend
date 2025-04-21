import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { UserModule } from './user/user.module';
import { ConfigModule } from '@nestjs/config';
import { EnvConfig, envSchema } from './configuration';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { RoomModule } from './room/room.module';
import { MailModule } from './mail/mail.module';

@Module({
  imports: [
    PrismaModule, 
    UserModule,
    ConfigModule.forRoot({
      isGlobal: true,
      load: [EnvConfig],
      validationSchema: envSchema
    }),
    CommonModule,
    AuthModule,
    RoomModule,
    MailModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
