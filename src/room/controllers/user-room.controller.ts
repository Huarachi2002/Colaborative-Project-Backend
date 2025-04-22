import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthTokenGuard } from 'src/auth/guard';
import { QueryCommonDto } from 'src/common/dto';
import { IApiResponse } from 'src/common/interface';
import { IResponseUsers } from 'src/user/interface';
import { UserService } from 'src/user/services';
import { AddUserRoomDto, RemovedUserRoomDto } from '../dto';
import { UserRoomService } from '../services';
import { RoomRoleGuard } from 'src/auth/guard/room-role.guard';
import { IReponseUserRoom, IResponseRooms } from '../interfaces';

@Controller('user-room')
@UseGuards(AuthTokenGuard)
export class UserRoomController {

  //#region CONSTRUCTOR
  constructor(
    private readonly userService: UserService,
    private readonly userRoomService: UserRoomService
  ) {}
  //#endregion CONSTRUCTOR

  //#region CONTROLLERS

  @Post("invitation")
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RoomRoleGuard)
  public async sendInivitationUserRoom(
    @Body() addUserRoomDto:AddUserRoomDto,
  ): Promise<IApiResponse<any>> {
      const statusCode = HttpStatus.CREATED;
      await this.userRoomService.invitationUserRoom(addUserRoomDto);
      return {
        statusCode,
        message: "Invitacion enviada con exito.",
        data: null
      }
  }


  // @Put("accept-invitation")
  // @HttpCode(HttpStatus.ACCEPTED)
  // public async acceptInvitationRoom(
  //   @Req() req: Request
  // ):Promise<IApiResponse<IReponseUserRoom>>{
  //   const statusCode = HttpStatus.ACCEPTED;
  //   const {UserId} = req;
  //   const acceptInvitation = await this.userRoomService.acceptInvitation(UserId,roomId);
  //   return {
  //     statusCode,
  //     message: "El usuario acepto la invitacion",
  //     data: {
  //       user_room: acceptInvitation
  //     }
  //   }
  // }
  
  // @Put("refused-invitation")
  // @HttpCode(HttpStatus.ACCEPTED)
  // public async refusedInvitationRoom(
  //   @Param('roomCode', ParseIntPipe) roomId: number,
  //   @Req() req: Request
  // ): Promise<IApiResponse<IReponseUserRoom>> {
  //   const statusCode = HttpStatus.ACCEPTED;
  //   const {UserId} = req;
  //   const refused = await this.userRoomService.refusedInvitation(UserId,roomId);    
  //   return {
  //     statusCode,
  //     message: "El usuario rechazo la invitacion",
  //     data: {
  //       user_room: refused
  //     }
  //   }
  // }

  // @Delete("removed-user")
  // @HttpCode(HttpStatus.OK)
  // @UseGuards(RoomRoleGuard)
  // public async removedUserRoom(
  //   @Body() removedDto: RemovedUserRoomDto,
  //   @Param('roomCode', ParseIntPipe) roomId: number
  // ): Promise<IApiResponse<IReponseUserRoom>>{
  //   const statusCode = HttpStatus.OK;
  //   const deletUser = await this.userRoomService.removedUserRoom(removedDto,roomId);
  //   return {
  //     statusCode,
  //     message: "Usuario removido de la sala",
  //     data: {
  //       user_room: deletUser
  //     }
  //   }
  // }
  

  //#endregion CONTROLLERS
}
