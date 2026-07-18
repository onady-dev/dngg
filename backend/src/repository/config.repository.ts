import { InjectRepository } from "@nestjs/typeorm";
import { Logitem } from "src/entities/Logitem.entity";
import { Repository } from "typeorm";

export class LogitemRepository extends Repository<Logitem>{
    constructor(
        @InjectRepository(Logitem)
        private logitemRepository: Repository<Logitem>,
    ) {
        super(logitemRepository.target, logitemRepository.manager, logitemRepository.queryRunner);
    }

    async findByGroupId(groupId: number): Promise<Logitem[] | null> {
        // 쿼리 파라미터는 문자열로 들어오므로 숫자로 변환해 필터한다.
        return this.logitemRepository.find({
            where: {
                groupId: Number(groupId),
            },
        });
    }

    async createLogitem(logitem: Logitem): Promise<Logitem> {
        return this.logitemRepository.save(logitem);
    }

    async updateLogitem(logitem: Logitem): Promise<Logitem> {
        return this.logitemRepository.save(logitem);
    }
}
