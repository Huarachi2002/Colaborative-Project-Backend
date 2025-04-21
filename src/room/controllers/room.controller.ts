import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { IApiResponse } from 'src/common/interface';
import { IResponseRoom, IResponseRoomId, IResponseRooms } from '../interfaces';
import { Request } from 'express';
import { QueryCommonDto } from 'src/common/dto';
import { RoomService } from '../services';
import { CreateRoomDto } from '../dto';
import { AuthTokenGuard } from 'src/auth/guard';

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
      name: true,
      description: true,
      code: true,
      status: true,
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
      message: "La sala con todos los usuarios",
      data: {
        room: findRoom
      }
    }
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  public async createRomms(
    @Req() req: Request,
    @Body() createRoomDto: CreateRoomDto
  ): Promise<IApiResponse<IResponseRoom>>{
    const statusCode = HttpStatus.CREATED;
    const {UserId} = req;
    const room = await this.roomService.createRoom(createRoomDto,UserId);

    return { 
      statusCode,
      message: "Sala creada",
      data: {
        room 
      }
    }
  
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  public async updateRoom(
    @Param("id", ParseIntPipe) id: number,
    @Req() req: Request,
    @Body() createRoomDto:CreateRoomDto
  ): Promise<IApiResponse<IResponseRoom>> {
    const statusCode = HttpStatus.OK;
    const {UserId} = req;
    const room = await this.roomService.updateRoom(id,createRoomDto,UserId);
    return {
      statusCode,
      message: "Sala actualizada",
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
