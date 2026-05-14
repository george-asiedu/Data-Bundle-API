import { SetMetadata } from '@nestjs/common';
import { Role } from 'src/auth/auth.types';

const role_keys: string = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(role_keys, roles);
