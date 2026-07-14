import { Injectable } from '@nestjs/common';
import { GroupRepository } from 'src/repository/group.repository';
import { PostGroupRequestDto } from './group.request.dto';
import { plainToInstance } from 'class-transformer';
import { Group } from 'src/entities/Group.entity';
import { assertSameGroup } from 'src/common/group-access';
import { SubscriptionService } from '../subscription/subscription.service';

@Injectable()
export class GroupService {
  constructor(
    private readonly groupRepository: GroupRepository,
    private readonly subscriptionService: SubscriptionService,
  ) {}

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

  async deleteGroup(id: number, userGroupId: number) {
    // 본인 소속 그룹만 삭제 가능 (결제 중인 타 그룹 삭제 방지)
    assertSameGroup(userGroupId, id);
    // 자동결제 중단 — 삭제된 그룹에 크론이 계속 청구하지 않도록
    await this.subscriptionService.cancelForGroup(id);
    await this.groupRepository.softDeleteById(id);
    return { id, isDeleted: true };
  }
}
