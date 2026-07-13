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
        return this.logitemRepository.find(
        //     {
        //     where: {
        //         groupId: groupId,
        //     },
        // }
    );
    }

    async createLogitem(logitem: Logitem): Promise<Logitem> {
        return this.logitemRepository.save(logitem);
    }

    async updateLogitem(logitem: Logitem): Promise<Logitem> {
        return this.logitemRepository.save(logitem);
    }
}
