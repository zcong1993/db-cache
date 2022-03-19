import type { Repository } from 'typeorm'
import { OrmAdaptor, PK } from './type'

export class TypeormAdaptor<T> implements OrmAdaptor<T> {
  private pk: string
  constructor(private readonly repository: Repository<T>) {
    const primaryColumns = this.repository.metadata.primaryColumns
    if (primaryColumns.length !== 1) {
      throw new Error('not support primaryColumns.length !== 1')
    }
    this.pk = primaryColumns[0].propertyName
  }

  tableName(): string {
    return this.repository.metadata.tableName
  }

  pkColumnName(): string {
    return this.pk
  }

  async findOneByPk(pk: PK): Promise<T> {
    return this.repository.findOneBy({
      [this.pk]: pk,
    } as any)
  }

  async findOneByField<K extends keyof T>(field: K, id: T[K]): Promise<T> {
    return this.repository.findOneBy({ [field]: id } as any)
  }

  async updateOneByPk(record: T) {
    return this.repository.save(record as any)
  }

  async deleteOneByPk(pk: PK) {
    return this.repository.delete(pk)
  }

  async findoneByCompositeFields<K extends (keyof T)[]>(
    fields: K,
    query: Required<Pick<T, K[number]>>
  ): Promise<T> {
    return this.repository.findOneBy(query as any)
  }
}
