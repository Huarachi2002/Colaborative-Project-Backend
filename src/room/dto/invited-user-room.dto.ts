import { IsArray, IsString } from "class-validator";


export class InvitedUserRoomDto {
  @IsString()
  code: string;

  @IsString()
  name: string;

  @IsArray()
  @IsString({ each: true })
  emails: string[];
}