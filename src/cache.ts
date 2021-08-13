import debug from 'debug'
import { Singleflight } from '@zcong/singleflight'
import { Cacher } from '@zcong/node-redis-cache'
import { aroundExpire, toString } from './utils'
import { OrmAdaptor, PK } from './type'

const cacheSafeGapBetweenIndexAndPrimary = 5
const d = debug('db-cache')

export interface Option<T> {
  expire: number
  uniqueFields?: (keyof T)[]
  compositeFields?: (keyof T)[][]
  disable?: boolean
  /**
   * @default 0.05
   * make the expiry unstable to avoid lots of cached items expire at the same time
   * 0.05 means make the unstable expiry to be [0.95, 1.05] * seconds
   * should in range [0, 1]
   * default 0.05, set 0 to disable
   */
  expiryDeviation?: number
}

export function fixOption<T>(option: Option<T>) {
  if (!option.uniqueFields) {
    option.uniqueFields = []
  }

  if (!option.compositeFields) {
    option.compositeFields = []
  }

  if (!option.expiryDeviation) {
    option.expiryDeviation = 0.05
  }

  if (option.expiryDeviation < 0) {
    option.expiryDeviation = 0
  }

  if (option.expiryDeviation > 1) {
    option.expiryDeviation = 1
  }
}

export class DbCache<T> {
  private readonly sf = new Singleflight()
  private aroundExpire2: (expire: number) => number
  private pk: string
  private tableName: string
  private compositeFieldsSet = new Set<string>()

  constructor(
    private readonly ormAdaptor: OrmAdaptor<T>,
    private readonly cache: Cacher,
    private option: Option<T>
  ) {
    fixOption(this.option)
    this.aroundExpire2 = (expire: number) =>
      aroundExpire(expire, option.expiryDeviation)

    this.pk = this.ormAdaptor.pkColumnName()
    this.tableName = this.ormAdaptor.tableName()

    for (const c of this.option.compositeFields) {
      // option.compositeFields is sorted after here
      this.compositeFieldsSet.add(this.normalizeCompositeFields(c))
    }
  }

  /**
   * find one by pk with cache
   * @param id pk value
   * @returns
   */
  async cacheFindByPk(id: PK) {
    if (this.option.disable) {
      return this.ormAdaptor.findOneByPk(id)
    }

    const key = this.buildKey(this.pk, id)

    return this.cache.cacheFn(
      key,
      async () => {
        d(`cacheFindByPk call db, pk ${this.pk}: ${id}`)
        return (await this.ormAdaptor.findOneByPk(id)) ?? null
      },
      this.aroundExpire2(this.option.expire),
      'json'
    ) as Promise<T>
  }

  /**
   * find one by unique field with cache,
   * will throw if field not in option.uniqueFields
   * @param field field name
   * @param id field value
   * @returns
   */
  async cacheFindByUniqueKey<K extends keyof T>(field: K, id: T[K]) {
    if (!this.option.uniqueFields.includes(field)) {
      throw new Error('invalid field')
    }

    if (this.option.disable) {
      return this.ormAdaptor.findOneByField(field, id)
    }

    const key = this.buildKey(field, id)

    return this.findBySubCache(
      key,
      () => this.ormAdaptor.findOneByField(field, id),
      `field: ${field} id: ${id}`
    )
  }

  /**
   * update record by pk will clear record cache.
   * note: never update record base on cached data
   * @param record record with full fields
   * @returns
   */
  async cacheUpdateByPk(record: T) {
    if (this.option.disable) {
      await this.ormAdaptor.updateOneByPk(record)
      return
    }

    await this.ormAdaptor.updateOneByPk(record)
    d(`cacheUpdateByPk update doc pk ${this.pk}: ${this.getPkVal(record)}`)
    this.deleteCache(record)
  }

  /**
   * delete record by pk, will clear record cache
   * note: this method call repository.delete so it is not soft delete
   * @param id
   * @returns
   */
  async deleteByPk(id: PK) {
    if (this.option.disable) {
      await this.ormAdaptor.deleteOneByPk(id)
      return
    }

    const record = await this.cacheFindByPk(id)
    if (!record) {
      return
    }

    await this.ormAdaptor.deleteOneByPk(id)

    d(`deleteByPk delete doc pk ${this.pk}: ${id}`)
    await this.deleteCache(record as T)
  }

  /**
   * clear record cache,
   * can be used before you update or delete record but not use TypeormCache's methods
   * @param record record with full fields
   * @returns
   */
  async deleteCache(record: T) {
    if (this.option.disable) {
      return
    }

    const pkVal = this.getPkVal(record)

    const delKeys: string[] = [this.buildKey(this.pk, pkVal)]

    this.option.uniqueFields.forEach((f) => {
      delKeys.push(this.buildKey(f, record[f]))
    })

    this.option.compositeFields.forEach((fs) => {
      delKeys.push(this.buildKey(...this.buildCompositeKeys(fs, record as any)))
    })

    d(
      `delteCache delete doc cache, pk ${this.pk}: ${pkVal}, deleted cacheKeys`,
      delKeys
    )

    await this.cache.delete(...delKeys)
  }

  async cacheFindByCompositeFields<K extends (keyof T)[]>(
    fields: K,
    query: Required<Pick<T, K[number]>>
  ) {
    const c = this.normalizeCompositeFields(fields)
    if (!this.compositeFieldsSet.has(c)) {
      throw new Error('invalid composite field')
    }

    if (this.option.disable) {
      return this.ormAdaptor.findoneByCompositeFields(fields, query)
    }

    const keys = this.buildCompositeKeys(fields, query)
    const key = this.buildKey(...keys)

    return this.findBySubCache(
      key,
      () => this.ormAdaptor.findoneByCompositeFields(fields, query),
      `fields: ${keys.toString()}`
    )
  }

  private async findBySubCache(
    cacheKey: string,
    fn: () => Promise<T>,
    debugFields: string
  ) {
    return this.sf.do(`${cacheKey}-outer`, async () => {
      const [val, isNotFoundPlaceHolder] = await this.cache.get(cacheKey, 'raw')

      if (isNotFoundPlaceHolder) {
        d(`findByReferenceCache hit not found placeholder, ${debugFields}`)
        return null
      }

      if (val) {
        d(
          `findByReferenceCache found pk in cache, ${debugFields}, pk ${this.pk}: ${val}`
        )
        return this.cacheFindByPk(val)
      }

      let record: T = null
      await this.cache.cacheFn(
        cacheKey,
        async () => {
          d(`findByReferenceCache call db, ${debugFields}`)
          record = await fn()
          if (!record) {
            // rewrite record to null
            record = null
            return null
          }

          await this.cache.set(
            this.buildKey(this.pk, this.getPkVal(record)),
            record,
            this.aroundExpire2(
              this.option.expire + cacheSafeGapBetweenIndexAndPrimary
            )
          )

          return this.getPkVal(record)
        },
        this.aroundExpire2(this.option.expire),
        'raw'
      )

      return record
    })
  }

  private getPkVal(record: T) {
    return (record as any)[this.pk]
  }

  /**
   * build redis cache key
   * {cacherPrefix}:${tableName}:${columnNames}:${columnValues}
   * @param args
   * @returns
   */
  private buildKey(...args: any[]) {
    return [this.tableName, ...args].map(toString).join(':')
  }

  private normalizeCompositeFields(fields: (keyof T)[]) {
    fields.sort((a, b) => a.toString().localeCompare(b.toString()))
    return fields.join(',')
  }

  private buildCompositeKeys<K extends (keyof T)[]>(
    fields: K,
    query: Required<Pick<T, K[number]>>
  ) {
    // build cache key
    const keys: any[] = [...fields.map((f) => f.toString())]
    // fields is sorted
    for (const f of fields) {
      keys.push(toString(query[f]))
    }

    return keys
  }
}
