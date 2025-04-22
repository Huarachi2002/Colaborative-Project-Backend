import { BadRequestException, forwardRef, Inject, Injectable, InternalServerErrorException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/services';
import { UserService } from 'src/user/services';
import { RoomService } from './room.service';
import { User_Room } from '@prisma/client';
import { AddUserRoomDto, RemovedUserRoomDto } from '../dto';
import { MailService } from 'src/mail/services';

@Injectable()
export class UserRoomService {

  //#region CONSTRUCTOR
  constructor(
    private readonly prismaService: PrismaService,
    private readonly userService: UserService,
    @Inject(forwardRef(() => RoomService))
    private readonly roomService: RoomService,
    private readonly mailService: MailService
  ) {}
  //#endregion CONSTRUCTOR

  //#region METHODS

  public async findUserRoom(
    userId: string,
    roomId: number
  ):Promise<User_Room> {
    const findUserRoom = await this.prismaService.user_Room.findFirst({
      where:{
        room_id: roomId,
        user_id: userId
      }
    });
    return findUserRoom;
  }  

  public async invitationUserRoom(
    addUserRoomDto: AddUserRoomDto,
    roomId: number
  ): Promise<User_Room>{
    const findUser = await this.userService.findIdUser(addUserRoomDto.userId);
    const findRoom =  await this.roomService.findIdRoom(roomId);

    const finduserRoom = await this.findUserRoom(findUser.id,findRoom.id);
    
    let existUserRoom: Boolean = finduserRoom != null;

    try {
      const createInvitation = await this.prismaService.$transaction(async (t) => {
        await this.mailService.sendInvitationRoom({
          room: findRoom,
          user: findUser
        });

        let createInvitationRoom: User_Room ;

        createInvitationRoom = await t.user_Room.create({
          data: {
            room_id: findRoom.id,
            user_id: findUser.id,
          }
        });

        return createInvitationRoom;
      });
      return createInvitation;
    } catch (err) {
      throw new InternalServerErrorException("Ocurrio un error inesperador: ", err)
    }
  }

  public async acceptInvitation(
    user_id: string,
    room_id: number
  ): Promise<User_Room>{
    const findUserRoom = await this.findUserRoom(user_id,room_id);

    if(!findUserRoom)
      throw new NotFoundException("El usuario no tiene ninguna invitacion.");

    const findUser = await this.userService.findIdUser(user_id);
    const findRoom = await this.roomService.findIdRoom(room_id);

    await this.mailService.acceptInvitation({
      room: findRoom,
      user: findUser
    });

    const updatedUserRoom = await this.prismaService.user_Room.update({
      where: {
        user_id_room_id: {
          room_id: findUserRoom.room_id,
          user_id: findUserRoom.user_id
        }
      },
      data: {
        // status: "OFICIAL"
      }
    });
    return updatedUserRoom;
  }


  public async refusedInvitation(    
    user_id: string,
    room_id: number
  ): Promise<User_Room>{
    const findUserRoom = await this.findUserRoom(user_id,room_id);

    if(!findUserRoom)
      throw new NotFoundException("El usuario no tiene ninguna invitacion.");

    const updatedUserRoom = await this.prismaService.user_Room.update({
      where: {
        user_id_room_id: {
          user_id: findUserRoom.user_id,
          room_id: findUserRoom.room_id
        },
      },
      data: {
        // status: "REFUSED"
      }
    });

    return updatedUserRoom;
  }

  public async removedUserRoom(
    removedDto: RemovedUserRoomDto,
    roomId: number
  ): Promise<User_Room> {
    const findUser = await this.userService.findIdUser(removedDto.userId);

    const findUserRoom = await this.findUserRoom(findUser.id,roomId);

    const updatedUserRoom = await this.prismaService.user_Room.update({
      where: {
        user_id_room_id: {
          room_id: findUserRoom.room_id,
          user_id: findUserRoom.user_id
        }
      },
      data: {
        // status: "REMOVED"
      }
    });

    return updatedUserRoom;
  }

  public async updatedUserRoom(userUpdatedRole: AddUserRoomDto,roomId: number): Promise<User_Room> {
    const findUser = await this.userService.findIdUser(userUpdatedRole.userId);

    const findUserRoom = await this.findUserRoom(findUser.id,roomId);

    if(!findUserRoom)
      throw new BadRequestException("El usuario no se encuentra en la sala");

    // if(findUserRoom.status !== "OFICIAL")
    //   throw new BadRequestException("El usuario no se encuentra habilitado para la sala.")

    const updatedUser = await this.prismaService.user_Room.update({
      where: {
        user_id_room_id: {
          room_id: findUserRoom.room_id,
          user_id: findUserRoom.user_id
        },
      },
      data: {
        // role: userUpdatedRole.role
      }
    });
    return updatedUser;
  }
  //#endregion METHODS
}
