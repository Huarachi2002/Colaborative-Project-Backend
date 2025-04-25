import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { AuthTokenGuard } from 'src/auth/guard';
import { IApiResponse } from 'src/common/interface';
import { AddUserRoomDto } from '../dto';
import { UserRoomService } from '../services';
import { InvitedUserRoomDto } from '../dto/invited-user-room.dto';

@Controller('user-room')
@UseGuards(AuthTokenGuard)
export class UserRoomController {

  //#region CONSTRUCTOR
  constructor(
    private readonly userRoomService: UserRoomService
  ) {}
  //#endregion CONSTRUCTOR

  //#region CONTROLLERS
  @Get(":idUser/validate-join/:idRoom")
  @HttpCode(HttpStatus.OK)
  public async validateJoinRoom(
    @Param('idUser') idUser: string,
    @Param('idRoom') idRoom: string
  ): Promise<IApiResponse<boolean>> {
    const statusCode = HttpStatus.OK;
    const room = await this.userRoomService.findRoomByIdRoom(idRoom);
    if(!room) {
      return {
        statusCode: HttpStatus.NOT_FOUND,
        message: "No existe la sala",
        data: null
      };
    }
    const validateJoin = await this.userRoomService.validateJoinRoom(room.id, idUser);
    return {
      statusCode,
      message: "Validacion de unirse a la sala",
      data: validateJoin
    };
  }

  @Post("invitation")
  @HttpCode(HttpStatus.CREATED)
  // @UseGuards(RoomRoleGuard)
  public async sendInivitationUserRoom(
    @Body() invitedUserRoomDto:InvitedUserRoomDto,
  ): Promise<IApiResponse<any>> {
      const statusCode = HttpStatus.CREATED;
      await this.userRoomService.invitationUserRoom(invitedUserRoomDto);
      return {
        statusCode,
        message: "Invitacion enviada con exito.",
        data: null
      }
  }

  @Post("join-room")
  @HttpCode(HttpStatus.CREATED)
  public async joinRoom(
    @Body() addUserRoomDto: AddUserRoomDto,
  ): Promise<IApiResponse<any>> {
    const statusCode = HttpStatus.CREATED;
    await this.userRoomService.addUserRoom(addUserRoomDto);

    return {
      statusCode,
      message: "Usuario agregado a la sala",
      data: null
    };
  }


  //#endregion CONTROLLERS
}
