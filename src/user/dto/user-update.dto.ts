import { IsEmail, IsOptional, IsString } from "class-validator";


export class UserUpdatedDto {

  @IsString()
  name: string;

  @IsString()
  @IsEmail()
  email: string;

}