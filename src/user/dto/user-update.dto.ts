import { IsEmail, IsOptional, IsString } from "class-validator";


export class UserUpdatedDto {

  @IsString()
  @IsOptional()
  username?: string;

  @IsString()
  @IsOptional()
  @IsEmail()
  email?: string;

}