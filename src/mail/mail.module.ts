import { MailerModule } from '@nestjs-modules/mailer';
import { Global, Module } from '@nestjs/common';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { join } from 'path';
import { MailService } from './services';

@Global()
@Module({
  imports: [
    MailerModule.forRootAsync({
      useFactory: async(config: ConfigService) => ({
        transport: {
          host: config.get<string>("host_email"),
          secure: false,
          auth: {
            user: config.get<string>("account_email"),
            pass: config.get<string>("pass_email")
          }
        },
        defaults: {
          from: `"No Reply" <${config.get<string>('account_email')}>`,
        },
        template: {
          dir: join(__dirname, "templates"),
          adapter: new HandlebarsAdapter(),
          options: {
            strict: true
          }
        }
      }),
      inject: [
        ConfigService
      ]
    }),
    ConfigModule
  ],
  providers: [MailService],
  exports: [
    MailService
  ]
})
export class MailModule {}
