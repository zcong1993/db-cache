export type PK = string | number

export interface OrmAdaptor<T> {
  tableName(): string
  pkColumnName(): string
  findOneByPk(pk: PK): Promise<T>
  findOneByField<K extends keyof T>(field: K, id: T[K]): Promise<T>
  updateOneByPk(record: T): Promise<any>
  deleteOneByPk(pk: PK): Promise<any>
  findoneByCompositeFields<K extends (keyof T)[]>(
    fields: K,
    query: Required<Pick<T, K[number]>>
  ): Promise<T>
}
