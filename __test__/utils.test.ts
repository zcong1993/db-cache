import { aroundExpire, toString } from '../src/utils'

it('aroundExpire should works well', () => {
  Array(10000)
    .fill(null)
    .forEach(() => {
      const e = aroundExpire(100, 0.05)
      expect(e >= 95 && e <= 105).toBeTruthy()
    })
})

it('toString should works well', () => {
  expect(toString(new Date('2021-07-31T18:32:26.064Z'))).toBe('1627756346064')
  expect(toString(1)).toBe('1')
})
