# db-cache

[![NPM version](https://img.shields.io/npm/v/@zcong/db-cache.svg?style=flat)](https://npmjs.com/package/@zcong/db-cache)
[![NPM downloads](https://img.shields.io/npm/dm/@zcong/db-cache.svg?style=flat)](https://npmjs.com/package/@zcong/db-cache)
[![JS Test](https://github.com/zcong1993/db-cache/actions/workflows/js-test.yml/badge.svg)](https://github.com/zcong1993/db-cache/actions/workflows/js-test.yml)
[![codecov](https://codecov.io/gh/zcong1993/db-cache/branch/master/graph/badge.svg)](https://codecov.io/gh/zcong1993/db-cache)

> like [go-zero cache](https://go-zero.dev/cn/redis-cache.html), but for NodeJS

## Features

- **universal** Support [typeorm](https://github.com/typeorm/typeorm) and [sequelize-typescript](https://github.com/RobinBuschmann/sequelize-typescript) by default, alsoe support extensions
- **singleflight** Concurrent requests for the same instance will only call the database once
- **cache nonexist** Records that do not exist in the database will also be cached for a period of time
- **memory efficient** A record will only cache one complete data, and a unique key will cache one primary key reference
- **sharding** Out-of-the-box support for Redis cluster sharding by [@zcong/node-redis-cache](https://github.com/zcong1993/node-redis-cache)
- **metrics** Out-of-the-box support prometheus metrics by [@zcong/node-redis-cache](https://github.com/zcong1993/node-redis-cache)

## Install

```bash
$ yarn add @zcong/db-cache
# or npm
$ npm i @zcong/db-cache --save
```

## Usage

### Typeorm

```ts
@Entity()
export class Student {
  @PrimaryGeneratedColumn()
  studentId: number

  @Column({
    unique: true,
  })
  cardId: string

  @Column()
  age: number
}

const redis = new Redis()
const cache = new RedisCache({ redis, prefix: 'typeorm' })

const student = new TypeormCache(new TypeormAdaptor(StudentRepository), cache, {
  disable: false,
  expire: 60, // cache expire seconds
  uniqueFields: ['cardId'], // cacheFindByUniqueKey method fields allowlist, filed must be unique
})

// findone with cache
console.log(await student.cacheFindByPk(1))
console.log(await student.cacheFindByUniqueKey('cardId', 'card-01'))
// updateone, will clear record cache
console.log(await student.cacheUpdateByPk(record))
// deleteone, will clear record cache
console.log(await student.deleteByPk(1))
// only clear record cache
console.log(await student.deleteCache(real))
```

### Sequelize-Typescript

```ts
@Table
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
  age: number
}

const redis = new Redis()
const cache = new RedisCache({ redis, prefix: 'sequelize' })

const student = new TypeormCache(
  new SequelizeTypescriptAdaptor(StudentRepository),
  cache,
  {
    disable: false,
    expire: 60, // cache expire seconds
    uniqueFields: ['cardId'], // cacheFindByUniqueKey method fields allowlist, filed must be unique
  }
)

// findone with cache
console.log(await student.cacheFindByPk(1))
console.log(await student.cacheFindByUniqueKey('cardId', 'card-01'))
// updateone, will clear record cache
console.log(await student.cacheUpdateByPk(record))
// deleteone, will clear record cache
console.log(await student.deleteByPk(1))
// only clear record cache
console.log(await student.deleteCache(real))
```

## License

MIT &copy; zcong1993
