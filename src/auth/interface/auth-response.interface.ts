import { User } from "@prisma/client";

export interface IAuthResponse {
  user: User;
  token: string;
}

export interface IAuthSignUp{
  user: User;
}