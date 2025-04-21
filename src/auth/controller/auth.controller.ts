import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService } from '../services/auth.service';
import { UserService } from 'src/user/services';
import { IApiResponse } from 'src/common/interface';
import { IAuthResponse, IAuthSignUp } from '../interface';
import { LoginDto } from '../dto';
import { UserCreateDto } from 'src/user/dto';

@Controller('auth')
export class AuthController {

  constructor(
    private readonly authService:AuthService,
    private readonly userService: UserService
  ){}


  @Post("sign-in")
  @HttpCode(HttpStatus.ACCEPTED)
  public async loginController(
    @Body() loginDto:LoginDto
  ): Promise<IApiResponse<IAuthResponse>>{
    const statusCode = HttpStatus.ACCEPTED;
    const login = await this.authService.login(loginDto)
    return {
      statusCode,
      message: "Logged aceptado",
      data: login
    }
  }

  @Post("sign-up")
  @HttpCode(HttpStatus.CREATED)
  public async createdUser(
    @Body() userCreateDto: UserCreateDto 
  ):Promise<IApiResponse<IAuthSignUp>> {
    const statusCode = HttpStatus.CREATED;
    const createdUser = await this.userService.createUser(userCreateDto);
    return {
      statusCode,
      message: "Usuario creado",
      data : {
        user: createdUser
      }
    }
  }


}
