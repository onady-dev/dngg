import { Controller, Get, Query, Post, Body, Put, Param, Delete, ValidationPipe, UseGuards } from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto, UpdateUserDto } from './user.request.dto';
import { AuthGuard } from '@nestjs/passport';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  async createUser(@Body(ValidationPipe) dto: CreateUserDto) {
    return this.userService.createUser(dto);
  }

  @Put(':id')
  @UseGuards(AuthGuard('jwt'))
  async updateUser(
    @Param('id') id: number,
    @Body(ValidationPipe) dto: UpdateUserDto,
  ) {
    return this.userService.updateUser(Number(id), dto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  async deleteUser(@Param('id') id: number) {
    await this.userService.deleteUser(Number(id));
    return { message: 'User deleted successfully' };
  }

  @Post('login')
  async loginUser(
    @Body('email') email: string,
    @Body('password') password: string,
  ) {
    return this.userService.loginUser(email, password);
  }
} 