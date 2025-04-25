import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import * as bcrypt from 'bcrypt';
import { AuthTokenResult, IAuthResponse, ISignJwt, IUseToken } from '../interface';
import { ConfigService } from '@nestjs/config';
import { UserService } from 'src/user/services';
import { LoginDto } from '../dto';
import { MailService } from 'src/mail/services';
@Injectable()
export class AuthService {


  constructor(
    private readonly jwtService: JwtService,
    private readonly userService: UserService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService
  ){}

  public async login(loginDto: LoginDto): Promise<IAuthResponse>{
    const findUser = await this.userService.findUserEmail(loginDto.email);
    if(!findUser)
      throw new NotFoundException("Usuario no encontrado")

    const validatePass = bcrypt.compareSync(loginDto.password, findUser.password);
    
    if(!validatePass)
      throw new BadRequestException("Ingrese el password correcto");

    return {
      user: findUser,
      token: this.signJwt({
        payload: {
          userId: findUser.id,
        },
        expires: 10 * 24 * 60 * 60 , 
      }) 
    }
  }

  public useToken(token: string): IUseToken | string {
    try {
      const decode = this.jwtService.decode(token) as AuthTokenResult;
      const currentDate = new Date();
      const expiresDate = new Date(decode.exp);

      return {
        userId: decode.userId,
        isExpired: +expiresDate <= +currentDate / 1000,
      };
    } catch (err) {
      return 'token es invalido';
    }
  }

  public async forgotPassword(email: string): Promise<void> {
    const findUser = await this.userService.findUserEmail(email);
    if(!findUser)
      throw new NotFoundException(`El ${email} no se encuantra registrado`);
    
    // Contraseña aleatoria de 8 caracteres
    const newPass = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8);
    
    const resultPassword = await this.userService.updatedPasswordForgot(findUser.id, newPass.toString());
    if(!resultPassword)
      throw new BadRequestException("Error al actualizar la contraseña");

    // Enviar email con la nueva contraseña
    await this.mailService.sendEmail(newPass, email, findUser.username);
  }

  private signJwt({expires,payload}: ISignJwt): string {
    return this.jwtService.sign(payload, {
      secret: this.configService.get<string>("secret_key_jwt"),
      expiresIn: expires,
    })
  }
}
