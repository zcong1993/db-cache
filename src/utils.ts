import _ from 'lodash'

export function aroundExpire(expire: number, expiryDeviation: number) {
  return Math.floor(
    expire * (1 - expiryDeviation + 2 * expiryDeviation * Math.random())
  )
}

export function toString(val: any): string {
  if (val instanceof Date) {
    return `${val.getTime()}`
  }

  return _.toString(val)
}
