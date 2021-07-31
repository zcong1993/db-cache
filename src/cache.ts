import type { Repository } from 'typeorm'
import debug from 'debug'
import { Singleflight } from '@zcong/singleflight'
import { Cacher } from '@zcong/node-redis-cache'

const cacheSafeGapBetweenIndexAndPrimary = 5
const d = debug('typeorm-cache')

export interface Option<T> {
  expire: number
  uniqueFields?: (keyof T)[]
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

function aroundExpire(expire: number, expiryDeviation: number) {
  return Math.floor(
    expire * (1 - expiryDeviation + 2 * expiryDeviation * Math.random())
  )
}

export class CacheWrapper<T> {
  private readonly sf = new Singleflight()
  private aroundExpire2: (expire: number) => number
  private pk: string

  constructor(
    private readonly repository: Repository<T>,
    private readonly cache: Cacher,
    private option: Option<T>
  ) {
    const primaryColumns = this.repository.metadata.primaryColumns
    if (primaryColumns.length !== 1) {
      throw new Error('not support primaryColumns.length !== 1')
    }

    this.pk = primaryColumns[0].propertyName

    fixOption(this.option)
    this.aroundExpire2 = (expire: number) =>
      aroundExpire(expire, option.expiryDeviation)
  }

  /**
   * find one by pk with cache
   * @param id pk value
   * @returns
   */
  async cacheFindByPk(id: string | number) {
    if (this.option.disable) {
      return this.repository.findOne(id)
    }

    const key = this.buildKey(this.pk, id)

    return this.cache.cacheFn(
      key,
      async () => {
        d(`cacheFindByPk call db, pk ${this.pk}: ${id}`)
        return (await this.repository.findOne(id)) ?? null
      },
      this.aroundExpire2(this.option.expire),
      'json'
    )
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
      return this.repository.findOne({ [field]: id })
    }

    const key = this.buildKey(field as string, id as any)

    return this.sf.do(`${key}-outer`, async () => {
      const [val, isNotFoundPlaceHolder] = await this.cache.get(key, 'raw')

      if (isNotFoundPlaceHolder) {
        d(
          `cacheFindByUniqueKey hit not found placeholder, field: ${field} id: ${id}`
        )
        return null
      }

      if (val) {
        d(
          `cacheFindByUniqueKey found pk in cache, field: ${field} id: ${id}, pk ${this.pk}: ${val}`
        )
        return this.cacheFindByPk(val)
      }

      let record: T = null
      await this.cache.cacheFn(
        key,
        async () => {
          d(`cacheFindByUniqueKey call db, field: ${field} id: ${id}`)
          record = await this.repository.findOne({ [field]: id })
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

  /**
   * update record by pk will clear record cache.
   * note: never update record base on cached data
   * @param record record with full fields
   * @returns
   */
  async cacheUpdateByPk(record: T) {
    if (this.option.disable) {
      return this.repository.update(this.getPkVal(record), record)
    }

    const resp = await this.repository.update(this.getPkVal(record), record)
    d(`cacheUpdateByPk update doc pk ${this.pk}: ${this.getPkVal(record)}`)
    this.deleteCache(record)

    return resp
  }

  /**
   * delete record by pk, will clear record cache
   * note: this method call repository.delete so it is not soft delete
   * @param id
   * @returns
   */
  async deleteByPk(id: string | number) {
    if (this.option.disable) {
      return this.repository.delete(id)
    }

    const record = await this.repository.findOne(id)
    if (!record) {
      return
    }

    const resp = await this.repository.delete(id)

    d(`deleteByPk delete doc pk ${this.pk}: ${this.getPkVal(record)}`)
    await this.deleteCache(record)

    return resp
  }

  /**
   * clear record cache,
   * can be used before you update or delete record but not use CacheWrapper's methods
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
      delKeys.push(this.buildKey(f as string, (record as any)[f]))
    })

    d(
      `delteCache delete doc cache, pk ${this.pk}: ${pkVal}, deleted cacheKeys`,
      delKeys
    )

    await this.cache.delete(...delKeys)
  }

  private getPkVal(record: T) {
    return (record as any)[this.pk]
  }

  /**
   * build redis cache key
   * {cacherPrefix}:${tableName}:${columnName}:${columnValue}
   * @param args
   * @returns
   */
  private buildKey(...args: (string | number)[]) {
    return [this.repository.metadata.tableName, ...args].join(':')
  }
}
