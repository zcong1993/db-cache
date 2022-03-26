import Redis from 'ioredis'
import { Sequelize } from 'sequelize-typescript'
import { RedisCache } from '@zcong/node-redis-cache'
import { DbCache, SequelizeTypescriptAdaptor } from '../src'
import { Student } from './sequelizeModel'

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'mysql://root:root@localhost:3306/test'
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379/0'

let conn: Sequelize
let redis: Redis

beforeAll(async () => {
  conn = new Sequelize(DATABASE_URL, {
    repositoryMode: true,
    models: [Student],
  })
  await conn.authenticate()

  await conn.sync()

  redis = new Redis(REDIS_URL)
})

afterAll(async () => {
  await conn.close()
  redis.disconnect()
}, 10000)

const getRepository = (conn: Sequelize) => conn.getRepository(Student)

const repeatCall = (n: number, fn: Function) =>
  Promise.all(
    Array(n)
      .fill(null)
      .map(() => fn())
  )

const setupData = async (conn: Sequelize): Promise<Student> => {
  const cardId = `card-${Date.now()}`
  await getRepository(conn).create({
    cardId,
    firstName: `firstName-${Date.now()}`,
    lastName: `lastName-${Date.now()}`,
    age: 18,
  })

  const r = await getRepository(conn).findOne({
    where: { cardId },
  })

  return r.get({ plain: true })
}

beforeEach(async () => {
  await getRepository(conn).truncate()
  await redis.flushdb()
})

it('cacheFindByPk', async () => {
  const cache = new RedisCache({ redis, prefix: 'sequelize' })
  const expectRes = await setupData(conn)
  const cw = new DbCache(
    new SequelizeTypescriptAdaptor(getRepository(conn)),
    cache,
    {
      expire: 50,
      expiryDeviation: 0.04,
    }
  )

  await repeatCall(10, async () => {
    const resp = await cw.cacheFindByPk(expectRes.studentId)
    expect(resp).toMatchObject(expectRes)
  })

  await repeatCall(10, async () => {
    const resp = await cw.cacheFindByPk(expectRes.studentId)
    expect(resp).toMatchObject(expectRes)
  })
})

it('cacheFindByUniqueKey', async () => {
  const cache = new RedisCache({ redis, prefix: 'typeorm' })
  const expectRes = await setupData(conn)
  const cw = new DbCache(
    new SequelizeTypescriptAdaptor(getRepository(conn)),
    cache,
    {
      expire: 60,
      uniqueFields: ['cardId'],
      expiryDeviation: 0.04,
    }
  )

  await repeatCall(10, async () => {
    const resp = await cw.cacheFindByUniqueKey('cardId', expectRes.cardId)
    expect(resp).toMatchObject(expectRes)
  })

  await repeatCall(10, async () => {
    const resp = await cw.cacheFindByUniqueKey('cardId', expectRes.cardId)
    expect(resp).toMatchObject(expectRes)
  })

  await expect(() =>
    cw.cacheFindByUniqueKey('studentId', expectRes.studentId)
  ).rejects.toThrow()
})

it('cacheUpdateByPk', async () => {
  const cache = new RedisCache({ redis, prefix: 'typeorm' })
  const expectRes = await setupData(conn)
  const cw = new DbCache(
    new SequelizeTypescriptAdaptor(getRepository(conn)),
    cache,
    {
      expire: 60,
      uniqueFields: ['cardId'],
      expiryDeviation: 0.04,
    }
  )

  // trigger cache
  await cw.cacheFindByUniqueKey('cardId', expectRes.cardId)
  await cw.cacheFindByUniqueKey('cardId', expectRes.cardId)

  await cw.cacheFindByPk(expectRes.studentId)
  await cw.cacheFindByPk(expectRes.studentId)

  // update column
  expectRes.age = 20
  await cw.cacheUpdateByPk(expectRes)

  expect(
    await cw.cacheFindByUniqueKey('cardId', expectRes.cardId)
  ).toMatchObject(expectRes)
  expect(await cw.cacheFindByPk(expectRes.studentId)).toMatchObject(expectRes)

  // update unique column
  expectRes.cardId = 'update-test'
  await cw.cacheUpdateByPk(expectRes)

  expect(
    await cw.cacheFindByUniqueKey('cardId', expectRes.cardId)
  ).toMatchObject(expectRes)
  expect(await cw.cacheFindByPk(expectRes.studentId)).toMatchObject(expectRes)
})

it('deleteByPk', async () => {
  const cache = new RedisCache({ redis, prefix: 'typeorm' })
  const expectRes = await setupData(conn)
  const cw = new DbCache(
    new SequelizeTypescriptAdaptor(getRepository(conn)),
    cache,
    {
      expire: 60,
      uniqueFields: ['cardId'],
      compositeFields: [['lastName', 'firstName']],
      expiryDeviation: 0.04,
    }
  )

  // trigger cache
  await cw.cacheFindByUniqueKey('cardId', expectRes.cardId)
  await cw.cacheFindByUniqueKey('cardId', expectRes.cardId)

  await cw.cacheFindByPk(expectRes.studentId)
  await cw.cacheFindByPk(expectRes.studentId)

  await cw.cacheFindByCompositeFields(['lastName', 'firstName'], {
    lastName: expectRes.lastName,
    firstName: expectRes.firstName,
  })

  await cw.cacheFindByCompositeFields(['lastName', 'firstName'], {
    lastName: expectRes.lastName,
    firstName: expectRes.firstName,
  })

  await cw.deleteByPk(expectRes.studentId)

  expect(await cw.cacheFindByUniqueKey('cardId', expectRes.cardId)).toBeNull()
  expect(await cw.cacheFindByPk(expectRes.studentId)).toBeNull()
  expect(
    await cw.cacheFindByCompositeFields(['lastName', 'firstName'], {
      lastName: expectRes.lastName,
      firstName: expectRes.firstName,
    })
  ).toBeNull()

  expect(await cw.cacheFindByUniqueKey('cardId', expectRes.cardId)).toBeNull()
  expect(await cw.cacheFindByPk(expectRes.studentId)).toBeNull()
  expect(
    await cw.cacheFindByCompositeFields(['lastName', 'firstName'], {
      lastName: expectRes.lastName,
      firstName: expectRes.firstName,
    })
  ).toBeNull()

  await cw.deleteByPk(10000)
})

it('deleteCache', async () => {
  const cache = new RedisCache({ redis, prefix: 'typeorm' })
  const expectRes = await setupData(conn)
  const cw = new DbCache(
    new SequelizeTypescriptAdaptor(getRepository(conn)),
    cache,
    {
      expire: 60,
      uniqueFields: ['cardId'],
      compositeFields: [['lastName', 'firstName']],
      expiryDeviation: 0.04,
    }
  )

  expect(await redis.dbsize()).toBe(0)

  await repeatCall(10, async () => {
    await cw.cacheFindByPk(expectRes.studentId)
  })
  expect(await redis.dbsize()).toBe(1)

  await repeatCall(10, async () => {
    await cw.cacheFindByUniqueKey('cardId', expectRes.cardId)
  })
  expect(await redis.dbsize()).toBe(2)

  const resp = await cw.cacheFindByCompositeFields(['lastName', 'firstName'], {
    lastName: expectRes.lastName,
    firstName: expectRes.firstName,
  })
  expect(resp).toMatchObject(expectRes)
  expect(await redis.dbsize()).toBe(3)

  await cw.deleteCache(expectRes)

  expect(await redis.dbsize()).toBe(0)
})

it('option.disable', async () => {
  const cache = new RedisCache({ redis, prefix: 'typeorm' })
  const expectRes = await setupData(conn)
  const cw = new DbCache(
    new SequelizeTypescriptAdaptor(getRepository(conn)),
    cache,
    {
      expire: 60,
      uniqueFields: ['cardId'],
      compositeFields: [['firstName', 'lastName']],
      expiryDeviation: 0.04,
      disable: true,
    }
  )

  expect(await cw.cacheFindByPk(expectRes.studentId)).toMatchObject(expectRes)

  expect(
    await cw.cacheFindByUniqueKey('cardId', expectRes.cardId)
  ).toMatchObject(expectRes)

  expect(
    await cw.cacheFindByCompositeFields(['lastName', 'firstName'], {
      lastName: expectRes.lastName,
      firstName: expectRes.firstName,
    })
  ).toMatchObject(expectRes)

  expect(await redis.dbsize()).toBe(0)

  expectRes.age = 20
  await cw.cacheUpdateByPk(expectRes)

  expect(await cw.cacheFindByPk(expectRes.studentId)).toMatchObject(expectRes)

  expect(
    await cw.cacheFindByUniqueKey('cardId', expectRes.cardId)
  ).toMatchObject(expectRes)

  expect(
    await cw.cacheFindByCompositeFields(['lastName', 'firstName'], {
      lastName: expectRes.lastName,
      firstName: expectRes.firstName,
    })
  ).toMatchObject(expectRes)

  expectRes.cardId = 'update-test-02'
  await cw.cacheUpdateByPk(expectRes)

  expect(await cw.cacheFindByPk(expectRes.studentId)).toMatchObject(expectRes)

  expect(
    await cw.cacheFindByUniqueKey('cardId', expectRes.cardId)
  ).toMatchObject(expectRes)

  expect(
    await cw.cacheFindByCompositeFields(['lastName', 'firstName'], {
      lastName: expectRes.lastName,
      firstName: expectRes.firstName,
    })
  ).toMatchObject(expectRes)

  await cw.deleteByPk(expectRes.studentId)

  expect(await cw.cacheFindByPk(expectRes.studentId)).toBeNull()

  expect(await cw.cacheFindByUniqueKey('cardId', expectRes.cardId)).toBeNull()

  expect(
    await cw.cacheFindByCompositeFields(['lastName', 'firstName'], {
      lastName: expectRes.lastName,
      firstName: expectRes.firstName,
    })
  ).toBeNull()

  await cw.deleteCache(expectRes)
})

it('cacheFindByCompositeFields', async () => {
  const cache = new RedisCache({ redis, prefix: 'typeorm' })
  const expectRes = await setupData(conn)
  const cw = new DbCache(
    new SequelizeTypescriptAdaptor(getRepository(conn)),
    cache,
    {
      expire: 60,
      uniqueFields: ['cardId'],
      compositeFields: [['lastName', 'firstName']],
      expiryDeviation: 0.04,
    }
  )

  await repeatCall(10, async () => {
    const resp = await cw.cacheFindByCompositeFields(
      ['firstName', 'lastName'],
      {
        firstName: expectRes.firstName,
        lastName: expectRes.lastName,
      }
    )
    expect(resp).toMatchObject(expectRes)
  })

  await repeatCall(10, async () => {
    const resp = await cw.cacheFindByCompositeFields(
      ['lastName', 'firstName'],
      {
        lastName: expectRes.lastName,
        firstName: expectRes.firstName,
      }
    )
    expect(resp).toMatchObject(expectRes)
  })

  await expect(() =>
    cw.cacheFindByCompositeFields(['studentId'], {
      studentId: expectRes.studentId,
    })
  ).rejects.toThrow()
})
