import { ForbiddenException } from '@nestjs/common';
import { GroupService } from './group.service';

const OWN_GROUP = 1;
const OTHER_GROUP = 2;

const makeService = () => {
  const groupRepository = {
    softDeleteById: jest.fn().mockResolvedValue(undefined),
  };
  const subscriptionService = {
    cancelForGroup: jest.fn().mockResolvedValue(undefined),
  };
  const service = new GroupService(
    groupRepository as any,
    subscriptionService as any,
  );
  return { service, groupRepository, subscriptionService };
};

describe('GroupService.deleteGroup', () => {
  test('다른 그룹을 삭제하려 하면 ForbiddenException', async () => {
    const { service, groupRepository } = makeService();
    await expect(service.deleteGroup(OTHER_GROUP, OWN_GROUP)).rejects.toThrow(
      ForbiddenException,
    );
    expect(groupRepository.softDeleteById).not.toHaveBeenCalled();
  });

  test('내 그룹 삭제 시 구독을 해지하고 soft delete 한다', async () => {
    const { service, groupRepository, subscriptionService } = makeService();
    await service.deleteGroup(OWN_GROUP, OWN_GROUP);
    expect(subscriptionService.cancelForGroup).toHaveBeenCalledWith(OWN_GROUP);
    expect(groupRepository.softDeleteById).toHaveBeenCalledWith(OWN_GROUP);
  });
});
