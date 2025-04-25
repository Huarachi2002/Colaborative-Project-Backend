import { MailerService } from '@nestjs-modules/mailer';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IInvitationRoom } from '../interfaces';
import { SentMessageInfo } from 'nodemailer';

@Injectable()
export class MailService {

  constructor(
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService
  ){}

  public async sendInvitationRoom(invitation: IInvitationRoom): Promise<void> {
    const url = this.configService.get<string>("url_frontend");
    await this.mailerService.sendMail({
      to: invitation.email,
      subject: 'Invitacion para unirse a un sala de diseño UI/UX.',
      template: "./invitation",
      context: {
        roomName: invitation.name,
        acceptUrl: `${url}/login`,
        code: invitation.code,
      }
    })
  }
  
  public async sendEmail(password: string, email: string, name: string): Promise<SentMessageInfo> {
    const url = this.configService.get<string>("url_frontend");
    return await this.mailerService.sendMail({
      to: email,
      subject: 'Olvide mi contraseña',
      template: "./forgot-password",
      context: {
        name,
        password,
        url
      }
    })
  }
}
