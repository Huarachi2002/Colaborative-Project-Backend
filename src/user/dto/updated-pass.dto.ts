import { IsHash, IsString } from "class-validator";


export class UpdatedUserPassDto {

  @IsString()
  password: string;

  
  @IsString()
  newPass: string;
}