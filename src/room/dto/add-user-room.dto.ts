import {IsNumber, IsString } from "class-validator";


export class AddUserRoomDto {
  @IsNumber()
  idRoom: number;

  @IsString()
  idUser: string;
}