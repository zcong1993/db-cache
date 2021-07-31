# typeorm-cache

[![NPM version](https://img.shields.io/npm/v/@zcong/typeorm-cache.svg?style=flat)](https://npmjs.com/package/@zcong/typeorm-cache)
[![NPM downloads](https://img.shields.io/npm/dm/@zcong/typeorm-cache.svg?style=flat)](https://npmjs.com/package/@zcong/typeorm-cache)
[![JS Test](https://github.com/zcong1993/typeorm-cache/actions/workflows/js-test.yml/badge.svg)](https://github.com/zcong1993/typeorm-cache/actions/workflows/js-test.yml)

<!-- [![codecov](https://codecov.io/gh/zcong1993/typeorm-cache/branch/master/graph/badge.svg)](https://codecov.io/gh/zcong1993/typeorm-cache) -->

> like [go-zero cache](https://go-zero.dev/cn/redis-cache.html), but for NodeJS

## Features

- **singleflight** Concurrent requests for the same instance will only call the database once
- **cache nonexist** Records that do not exist in the database will also be cached for a period of time
- **memory efficient** A record will only cache one complete data, and a unique key will cache one primary key reference
- **sharding** Out-of-the-box support for Redis cluster sharding by [@zcong/node-redis-cache](https://github.com/zcong1993/node-redis-cache)
- **metrics** Out-of-the-box support prometheus metrics by [@zcong/node-redis-cache](https://github.com/zcong1993/node-redis-cache)

## Install

```bash
$ yarn add @zcong/typeorm-cache
# or npm
$ npm i @zcong/typeorm-cache --save
```

## Usage

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

const student = new CacheWrapper(StudentRepository, cache, {
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

## License

MIT &copy; zcong1993
