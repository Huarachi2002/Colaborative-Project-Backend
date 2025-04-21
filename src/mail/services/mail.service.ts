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
      to: invitation.user.email,
      subject: "Invitacion para unirse a un sala de diseño UI/UX",
      template: "./invitation",
      context: {
        roomName: invitation.room.name,
        acceptUrl: `${url}/invitation/${invitation.room.code}`
      }
    })

    
  }
  public async acceptInvitation(invitation: IInvitationRoom): Promise<void> {
    const url = this.configService.get<string>("url_frontend");

    await this.mailerService.sendMail({
      to: invitation.user.email,
      subject: `Bienvenido a la sala ${invitation.room.name}!`,
      template: "./welcome",
      context: {
        roomName: invitation.room.name,
        userName: invitation.user.username,
        roomUrl: `${url}/room/${invitation.room.code}`,
      }
    })
    
  }
}
