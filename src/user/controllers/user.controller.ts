import { Body, Controller, HttpCode, HttpStatus, Put, Req, UseGuards } from '@nestjs/common';
import { AuthTokenGuard } from 'src/auth/guard';
import { UserService } from '../services';
import { IApiResponse } from 'src/common/interface';
import { IResponseUser } from '../interface';
import { UpdatedUserPassDto, UserUpdatedDto } from '../dto';
import { Request } from 'express';

@Controller('user')
@UseGuards(AuthTokenGuard)
export class UserController {

  constructor(
    private readonly userService: UserService
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
