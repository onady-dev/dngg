import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { Log } from "./Log.entity";
@Entity()
export class Logitem {
  @PrimaryGeneratedColumn()
  id: number;
  @Column('int')
  groupId: number;
  @Column('varchar', { length: 20 })
  name: string;
  @Column('int')
  value: number;
  
  @OneToMany(() => Log, (log) => log.logitem)
  logs: Log[];
}

