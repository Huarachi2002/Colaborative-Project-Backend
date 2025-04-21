import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { UserService } from 'src/user/services';
import { AuthService } from '../services';
import { Request } from 'express';

@Injectable()
export class AuthTokenGuard implements CanActivate {
  constructor(
    private readonly userService: UserService,
    private readonly authService: AuthService,
  ) {}

  async canActivate(
    context: ExecutionContext,
  ): Promise<boolean>  {
    //saco el token del header
    const req = context.switchToHttp().getRequest<Request>();
    const token = req.headers['auth-token'];
    //pregunto si lo saque o si es un arreglo
    if (!token || Array.isArray(token))
      throw new UnauthorizedException('No hay token');

    const payload = this.authService.useToken(token);

    if(typeof payload == "string")
      throw new UnauthorizedException(payload);

    if(payload.isExpired)
      throw new UnauthorizedException("Token expirado");

    const findUser = await this.userService.findIdUser(payload.userId);

    req.UserId = findUser.id;
    return true;
  }
}
