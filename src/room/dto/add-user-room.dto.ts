import { IsString, IsUUID } from "class-validator";


export class AddUserRoomDto {
  @IsUUID()
  @IsString()
  userId: string;
}