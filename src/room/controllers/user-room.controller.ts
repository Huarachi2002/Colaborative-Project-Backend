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
import { Roles } from 'src/auth/decorator';
import { IReponseUserRoom } from '../interfaces';

@Controller('user-room/:roomCode')
@UseGuards(AuthTokenGuard)
export class UserRoomController {

  //#region CONSTRUCTOR
  constructor(
    private readonly userService: UserService,
    private readonly userRoomService: UserRoomService
  ) {}
  //#endregion CONSTRUCTOR

  //#region CONTROLLERS
  @Get("find-users")
  @HttpCode(HttpStatus.OK)
  public async findUser(
    @Query() query: QueryCommonDto,
    @Param('roomCode', ParseIntPipe) roomId: number
  ): Promise<IApiResponse<IResponseUsers>>{
    const statusCode = HttpStatus.OK;
    const [users, total] = await Promise.all([
      this.userService.findAllRoom(
        query, {
          where: {
            rooms: {
              none: {
                room_id: roomId
              }
            }, 
            username: {
              contains: query.search,
              mode: "insensitive"
            }
          }
        }
      ),
      this.userService.countAllRoom({
        where: {
          rooms: {
            none: {
              room_id: roomId
            }
          }, 
          username: {
            contains: query.search,
            mode: "insensitive"
          }
        }
      })
    ])
    return {
      statusCode,
      message: "Los usuarios buscados que no pertenezcan a la sala",
      data: {
        total,
        users
      }
    }
  }

  @Post("invitation")
  @HttpCode(HttpStatus.CREATED)
  @Roles("OWNER","COLABORATOR")
  @UseGuards(RoomRoleGuard)
  public async addUserRoom(
    @Body() addUserRoomDto:AddUserRoomDto,
    @Param('roomCode', ParseIntPipe) roomId: number,
  ): Promise<IApiResponse<IReponseUserRoom>> {
      const statusCode = HttpStatus.CREATED;
      const addUserRoom = await this.userRoomService.invitationUserRoom(addUserRoomDto,roomId);
      return {
        statusCode,
        message: "Usuario agregado correctamente a la sala.",
        data: {
          user_room: addUserRoom
        }
      }
  }


  @Put("accept-invitation")
  @HttpCode(HttpStatus.ACCEPTED)
  public async acceptInvitationRoom(
    @Param('roomCode', ParseIntPipe) roomId: number,
    @Req() req: Request
  ):Promise<IApiResponse<IReponseUserRoom>>{
    const statusCode = HttpStatus.ACCEPTED;
    const {UserId} = req;
    const acceptInvitation = await this.userRoomService.acceptInvitation(UserId,roomId);
    return {
      statusCode,
      message: "El usuario acepto la invitacion",
      data: {
        user_room: acceptInvitation
      }
    }
  }
  
  @Put("refused-invitation")
  @HttpCode(HttpStatus.ACCEPTED)
  public async refusedInvitationRoom(
    @Param('roomCode', ParseIntPipe) roomId: number,
    @Req() req: Request
  ): Promise<IApiResponse<IReponseUserRoom>> {
    const statusCode = HttpStatus.ACCEPTED;
    const {UserId} = req;
    const refused = await this.userRoomService.refusedInvitation(UserId,roomId);    
    return {
      statusCode,
      message: "El usuario rechazo la invitacion",
      data: {
        user_room: refused
      }
    }
  }

  @Delete("removed-user")
  @HttpCode(HttpStatus.OK)
  @Roles("OWNER")
  @UseGuards(RoomRoleGuard)
  public async removedUserRoom(
    @Body() removedDto: RemovedUserRoomDto,
    @Param('roomCode', ParseIntPipe) roomId: number
  ): Promise<IApiResponse<IReponseUserRoom>>{
    const statusCode = HttpStatus.OK;
    const deletUser = await this.userRoomService.removedUserRoom(removedDto,roomId);
    return {
      statusCode,
      message: "Usuario removido de la sala",
      data: {
        user_room: deletUser
      }
    }
  }
  

  @Put("updated-role")
  @HttpCode(HttpStatus.OK)
  @Roles("OWNER")
  @UseGuards(RoomRoleGuard)
  public async updatedUserRole(
    @Param('roomCode', ParseIntPipe) roomId: number,
    @Body() userRoomUpdate: AddUserRoomDto
  ): Promise<IApiResponse<IReponseUserRoom>> {
    const statusCode = HttpStatus.OK;
    const updatedUser = await this.userRoomService.updatedUserRoom(userRoomUpdate,roomId);
    return {
      statusCode,
      message: "Usuario actualizado",
      data: {
        user_room: updatedUser
      }
    }
  }

  //#endregion CONTROLLERS
}
