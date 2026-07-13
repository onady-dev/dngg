import { Injectable } from '@nestjs/common';
import { GroupRepository } from 'src/repository/group.repository';
import { PostGroupRequestDto } from './group.request.dto';
import { plainToInstance } from 'class-transformer';
import { Group } from 'src/entities/Group.entity';

@Injectable()
export class GroupService {
  constructor(private readonly groupRepository: GroupRepository) {}

  async getGroupByName(name: string) {
    return this.groupRepository.findByName(name);
  }

  async createGroup(group: PostGroupRequestDto) {
    const groupInstance = plainToInstance(Group, group);
    return this.groupRepository.createGroup(groupInstance);
  }

  async getAllGroups() {
    return this.groupRepository.findAll();
  }

  async deleteGroup(id: number) {
    await this.groupRepository.softDeleteById(id);
    return { id, isDeleted: true };
  }
}
