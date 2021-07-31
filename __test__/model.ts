import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  PrimaryColumn,
  Index,
} from 'typeorm'

@Entity()
@Index(['firstName', 'lastName'], { unique: true })
export class Student {
  @PrimaryGeneratedColumn()
  studentId: number

  @Column({
    unique: true,
  })
  cardId: string

  @Column()
  firstName: string

  @Column()
  lastName: string

  @Column()
  age: number
}

@Entity()
export class MultiPrimaryTest {
  @PrimaryGeneratedColumn()
  studentId: number

  @PrimaryColumn()
  studentId2: number

  @Column({
    unique: true,
  })
  cardId: string

  @Column()
  firstName: string

  @Column()
  lastName: string

  @Column()
  age: number
}
