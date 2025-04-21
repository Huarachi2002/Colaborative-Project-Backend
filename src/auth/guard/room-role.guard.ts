import { BadRequestException, CanActivate, ExecutionContext, ForbiddenException, Injectable, InternalServerErrorException, NotFoundException, Query, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
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
    const get_roles = this.reflector.get<Role[]>('roles',context.getHandler());
    if(!get_roles)
      throw new InternalServerErrorException("Error inesperado con asignacion de roles, consulte a soporte.")

    const roomCode = req.params?.roomCode;
    console.log(roomCode);
    if (!roomCode) {
      throw new ForbiddenException('Código de sala no proporcionado');
    }
    if( typeof roomCode != "string" )
      throw new BadRequestException("Ingrese el codigo de la sala en formato 'string'.")

    const member = await this.userRoomService.findUserRoom(req.UserId,parseInt(roomCode));

    if(!member)
      throw new NotFoundException("El usuario no pertenece a esta sala de diseño.")

    if(!get_roles.includes(member.role))
      throw new UnauthorizedException("Usted no tiene permiso para realizar esta accion.")
    
    return true;
  }
}
