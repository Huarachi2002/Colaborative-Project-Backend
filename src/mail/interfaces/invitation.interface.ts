import { Room, User } from "@prisma/client";

export interface IInvitationRoom {
  room: Room,
  user: User
}