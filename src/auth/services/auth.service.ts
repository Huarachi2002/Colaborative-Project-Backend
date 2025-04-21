import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import * as bcrypt from 'bcrypt';
import { AuthTokenResult, IAuthResponse, ISignJwt, IUseToken } from '../interface';
import { ConfigService } from '@nestjs/config';
import { UserService } from 'src/user/services';
import { LoginDto } from '../dto';
@Injectable()
export class AuthService {


  constructor(
    private readonly jwtService: JwtService,
    private readonly userService: UserService,
    private readonly configService: ConfigService
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
      console.log(err);
      return 'token es invalido';
    }
  }

  private signJwt({expires,payload}: ISignJwt): string {
    return this.jwtService.sign(payload, {
      secret: this.configService.get<string>("secret_key_jwt"),
      expiresIn: expires,
    })
  }
}
