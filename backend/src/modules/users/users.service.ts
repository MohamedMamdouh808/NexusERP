import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../platform/prisma/prisma.service';
import argon2 from 'argon2';

/**
 * User service. Handles user creation with Argon2id password hashing (FR-009).
 * Passwords are never stored in plain form and never logged.
 */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a new user with an Argon2id-hashed password.
   * Minimum password length of 12 is enforced by the RegisterDto schema.
   */
  async createUser(email: string, password: string) {
    const passwordHash = await argon2.hash(password);

    return this.prisma.user.create({
      data: {
        email,
        passwordHash,
      },
    });
  }

  async findByEmail(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    return user;
  }

  async verifyPassword(user: { passwordHash: string }, password: string) {
    return argon2.verify(user.passwordHash, password);
  }
}
