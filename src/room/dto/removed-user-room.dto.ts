import { IsString, IsUUID } from "class-validator";


export class RemovedUserRoomDto {
  
  @IsString()
  @IsUUID()
  user_id: string;
}