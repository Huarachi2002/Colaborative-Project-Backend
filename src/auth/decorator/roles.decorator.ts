import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const Roles = (...args: (keyof typeof Role)[]) => SetMetadata('roles', args);
