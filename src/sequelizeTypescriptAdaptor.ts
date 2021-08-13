import type { Model, Repository } from 'sequelize-typescript'
import { OrmAdaptor, PK } from './type'

export class SequelizeTypescriptAdaptor<T extends Model>
  implements OrmAdaptor<T>
{
  constructor(private readonly repository: Repository<T>) {}

  tableName(): string {
    return this.repository.tableName
  }

  pkColumnName(): string {
    return this.repository.primaryKeyAttribute
  }

  async findOneByPk(pk: PK): Promise<T> {
    return this.repository.findByPk(pk)
  }

  async findOneByField<K extends keyof T>(field: K, id: T[K]): Promise<T> {
    return this.repository.findOne({
      where: { [field]: id } as any,
    })
  }

  async updateOneByPk(record: T) {
    return this.repository.update(record, {
      where: {
        [this.pkColumnName() as any]: (record as any)[this.pkColumnName()],
      },
    })
  }

  async deleteOneByPk(pk: PK) {
    return this.repository.destroy({
      where: {
        [this.pkColumnName() as any]: pk,
      },
    })
  }

  async findoneByCompositeFields<K extends (keyof T)[]>(
    fields: K,
    query: Required<Pick<T, K[number]>>
  ): Promise<T> {
    return this.repository.findOne({
      where: query,
    })
  }
}
