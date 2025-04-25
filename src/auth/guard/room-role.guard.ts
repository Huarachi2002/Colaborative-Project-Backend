import { BadRequestException, CanActivate, ExecutionContext, ForbiddenException, Injectable, InternalServerErrorException, NotFoundException, Query, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { UserRoomService } from 'src/room/services';

@Injectable()
export class RoomRoleGuard implements CanActivate {

  constructor(
    private readonly reflector: Reflector,
    private readonly userRoomService: UserRoomService
  ){}

  public async canActivate(
    context: ExecutionContext,
  ):  Promise<boolean>  {
    const req = context.switchToHttp().getRequest<Request>();
    const roomCode = req.params?.roomCode;
    if (!roomCode) {
      throw new ForbiddenException('Código de sala no proporcionado');
    }
    if( typeof roomCode != "string" )
      throw new BadRequestException("Ingrese el codigo de la sala en formato 'string'.")

    const member = await this.userRoomService.findUserRoom(req.UserId,parseInt(roomCode));

    if(!member)
      throw new NotFoundException("El usuario no pertenece a esta sala de diseño.")

    return true;
  }
}
