import { Table, Column, Model } from 'sequelize-typescript'

@Table({
  tableName: 'seq_student',
  timestamps: false,
  indexes: [
    {
      name: 'firstName_lastName',
      fields: ['firstName', 'lastName'],
      unique: true,
    },
  ],
})
export class Student extends Model<Student, Partial<Student>> {
  @Column({
    primaryKey: true,
    autoIncrement: true,
  })
  studentId: number

  @Column({
    unique: true,
  })
  cardId: string

  @Column
  firstName: string

  @Column
  lastName: string

  @Column
  age: number
}
