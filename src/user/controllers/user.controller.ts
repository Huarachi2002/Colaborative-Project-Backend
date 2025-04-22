import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Put, Req, UseGuards } from '@nestjs/common';
import { AuthTokenGuard } from 'src/auth/guard';
import { UserService } from '../services';
import { IApiResponse } from 'src/common/interface';
import { IResponseUser } from '../interface';
import { UpdatedUserPassDto, UserUpdatedDto } from '../dto';
import { Request } from 'express';
import { IResponseRooms } from 'src/room/interfaces';
import { UserRoomService } from 'src/room/services';

@Controller('user')
@UseGuards(AuthTokenGuard)
export class UserController {

  constructor(
    private readonly userService: UserService,
    private readonly userRoomService: UserRoomService
  ){}

  @Put("updated")
  @HttpCode(HttpStatus.OK)
  public async updatedUser(
    @Body() userUpdate: UserUpdatedDto,
    @Req() req: Request
  ) : Promise<IApiResponse<IResponseUser>> {
    const {UserId} = req;
    const statusCode = HttpStatus.OK;
    const updatedUser = await this.userService.updatedUser(UserId,userUpdate);

    return {
       statusCode,
       message: "Usuario actualizado",
       data: {
        user: updatedUser
       }
    }
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

  @Put("updated-pass")
  @HttpCode(HttpStatus.OK)
  public async updatedPass(
    @Body() updsPass: UpdatedUserPassDto,
    @Req() req: Request
  ): Promise<IApiResponse<IResponseUser>>{
    const {UserId} = req;
    const statusCode = HttpStatus.OK;
    const updPass = await this.userService.updatedPassword(UserId,updsPass);
    return {
      statusCode,
      message: "Password actualizado",
      data: {
        user: updPass
      }
    }
  } 
}
