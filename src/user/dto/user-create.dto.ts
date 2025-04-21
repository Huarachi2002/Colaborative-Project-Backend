import { IsEmail, IsString, isString, MinLength } from "class-validator";



export class UserCreateDto {

  @IsString()
  @MinLength(5)
  username: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @IsEmail()
  email: string;
}