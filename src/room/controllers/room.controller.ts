import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { IApiResponse } from 'src/common/interface';
import { IResponseRoom, IResponseRoomId, IResponseRooms } from '../interfaces';
import { Request } from 'express';
import { QueryCommonDto } from 'src/common/dto';
import { RoomService } from '../services';
import { CreateRoomDto } from '../dto';
import { AuthTokenGuard } from 'src/auth/guard';
import { UpdateRoomDto } from '../dto/update-room.dto';

@Controller('room')
@UseGuards(AuthTokenGuard)
export class RoomController {
  constructor(
    private readonly roomService: RoomService
  ){}

  @Get()
  @HttpCode(HttpStatus.OK)
  public async findRomms(
    @Req() req: Request,
    @Query() query: QueryCommonDto
  ): Promise<IApiResponse<IResponseRooms>> {
    const statusCode = HttpStatus.OK;
    const {UserId} = req;
    const [rooms, total] = await Promise.all([
      this.roomService.findAll(query,UserId),
      this.roomService.countAll(query,UserId)
    ])
    return {
      statusCode,
      message: "Todos las salas",
      data: {
        total,
        rooms
      }
    }
  }

  @Get(":id")
  @HttpCode(HttpStatus.OK)
  public async findIdRoom(
    @Param('id', ParseIntPipe) roomId: number
  ): Promise<IApiResponse<IResponseRoomId>>{
    const statusCode = HttpStatus.OK;
    const findRoom = await this.roomService.findIdRoom(roomId, {
      id: true,
      idRoom: true,
      name: true,
      code: true,
      description: true,
      maxMembers: true,
      createdBy: true,
      createdAt: true,
      updatedAt: true,
      users: {
        include: {
          user: true
        }
      }
    });

    return {
      statusCode,
      message: "Sala encontrada",
      data: {
        room: findRoom
      }
    }
  }

  @Post(':idUser')
  @HttpCode(HttpStatus.CREATED)
  public async createRomms(
    @Param('idUser', ParseUUIDPipe) idUser: string,
    @Body() createRoomDto: CreateRoomDto
  ): Promise<IApiResponse<IResponseRoom>>{
    const statusCode = HttpStatus.CREATED;
    const room = await this.roomService.createRoom(createRoomDto, idUser);

    return { 
      statusCode,
      message: "Sala creada",
      data: {
        room 
      }
    }
  }

  @Get('validate-code/:code')
  @HttpCode(HttpStatus.OK)
  public async validateCodeRoom(
    @Param('code') code: string,
  ): Promise<IApiResponse<IResponseRoom>>{
    const statusCode = HttpStatus.OK;
    const room = await this.roomService.validateCodeRoom(code);

    return {
      statusCode,
      message: "Codigo de la sala",
      data: {
        room
      }
    }
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  public async updateRoom(
    @Param("id", ParseIntPipe) id: number,
    @Body() createRoomDto:UpdateRoomDto
  ): Promise<IApiResponse<IResponseRoom>> {
    const statusCode = HttpStatus.OK;
    const room = await this.roomService.updateRoom(id,createRoomDto);
    return {
      statusCode,
      message: "Sala actualizada",
      data: {
        room
      }
    }
  }

  @Put(':idRoom/collaborators/:email')
  @HttpCode(HttpStatus.OK)
  public async removeUserToRoom(
    @Param("idRoom", ParseIntPipe) idRoom: number,
    @Param("email") email: string
  ): Promise<IApiResponse<IResponseRoom>> {
    const statusCode = HttpStatus.OK;
    const room = await this.roomService.removeUserToRoom(idRoom,email);

    return {
      statusCode,
      message: "Colaborador eliminado",
      data: {
        room
      }
    }
  }

  @Patch("code/:id")
  @HttpCode(HttpStatus.OK)
  public async updateCodeRoom(
    @Param("id", ParseIntPipe) id: number,
    @Req() req: Request
  ): Promise<IApiResponse<IResponseRoom>> {
    const statusCode = HttpStatus.OK;
    const {UserId} = req;
    const room = await this.roomService.updateCodeRoom(id,UserId);

    return {
      statusCode,
      message: "Codigo de la sala actualizada",
      data: {
        room
      }
    }
  }

}
