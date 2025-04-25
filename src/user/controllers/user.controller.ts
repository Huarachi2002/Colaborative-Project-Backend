import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Put, Req, UseGuards } from '@nestjs/common';
import { AuthTokenGuard } from 'src/auth/guard';
import { UserService } from '../services';
import { IApiResponse } from 'src/common/interface';
import { IResponseUser } from '../interface';
import { UpdatedUserPassDto, UserUpdatedDto } from '../dto';
import { IResponseRooms } from 'src/room/interfaces';
import { UserRoomService } from 'src/room/services';

@Controller('user')
@UseGuards(AuthTokenGuard)
export class UserController {

  constructor(
    private readonly userService: UserService,
    private readonly userRoomService: UserRoomService
  ){}

  @Put(":userId")
  @HttpCode(HttpStatus.OK)
  public async updatedUser(
    @Body() userUpdate: UserUpdatedDto,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) : Promise<IApiResponse<IResponseUser>> {
    const statusCode = HttpStatus.OK;
    const updatedUser = await this.userService.updatedUser(userId,userUpdate);

    return {
       statusCode,
       message: "Usuario actualizado",
       data: {
        user: updatedUser
       }
    }
  }

  @Get("email/:email")
  @HttpCode(HttpStatus.OK)
  public async findUserByEmail(
    @Param('email') email: string,
  ): Promise<IApiResponse<IResponseUser>> {
    const statusCode = HttpStatus.OK;
    const user = await this.userService.findUserEmail(email);
    if (!user) {
      return {
        statusCode: HttpStatus.NOT_FOUND,
        message: "Usuario no encontrado",
        data: null
      };
    }
    return {
      statusCode,
      message: "Usuario encontrado",
      data: {
        user
      }
    };
  }

  @Get(":userId/rooms")
  @HttpCode(HttpStatus.OK)
  public async getUserRooms(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<IApiResponse<IResponseRooms>> {
    const statusCode = HttpStatus.OK;
    
    const rooms = await this.userRoomService.findRoomsByUserId(userId);

    return {
      statusCode,
      message: "Salas del usuario",
      data: {
        total: rooms.length,
        rooms
      }
    };
  }

  @Get(':userId/rooms-created')
  @HttpCode(HttpStatus.OK)
  public async getUserRoomsCreated(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<IApiResponse<IResponseRooms>> {
    const statusCode = HttpStatus.OK;
    
    const rooms = await this.userRoomService.findRoomsCreatedByUserId(userId);
    return {
      statusCode,
      message: "Salas creadas por el usuario",
      data: {
        total: rooms.length,
        rooms
      }
    };
  }

  @Get(':userId/rooms-invited')
  @HttpCode(HttpStatus.OK)
  public async getUserRoomsInvited(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<IApiResponse<IResponseRooms>> {
    const statusCode = HttpStatus.OK;
    
    const rooms = await this.userRoomService.findRoomsInvitedByUserId(userId);

    return {
      statusCode,
      message: "Salas del usuario que fue invitado",
      data: {
        total: rooms.length,
        rooms
      }
    };
  }

  @Put('password/:userId')
  @HttpCode(HttpStatus.OK)
  public async updatedUserPassword(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() updPass: UpdatedUserPassDto,
  ): Promise<IApiResponse<IResponseUser>> {
    const statusCode = HttpStatus.OK;
    const updatedPass = await this.userService.updatedPassword(userId,updPass);
    return {
      statusCode,
      message: "Contraseña actualizada",
      data: {
        user: updatedPass
      }
    }
  }

}
