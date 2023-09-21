/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

import { DataSource } from './dataSourceSQL'

describe('Read SQL', () => {
  test('Read all SQL render', async () => {
    const all = jest.fn((_: string) => Promise.resolve())
    await DataSource.read({ all } as any, { code: 'user' } as any).all()
    expect(all.mock.calls).toHaveLength(1)
    expect(all.mock.calls[0][0]).toBe('SELECT * FROM user')
  })

  test('Read first row SQL render', async () => {
    const all = jest.fn((_: string) => Promise.resolve())
    await DataSource.read({ all } as any, { code: 'feature' } as any).limit(1).all()
    expect(all.mock.calls).toHaveLength(1)
    expect(all.mock.calls[0][0]).toBe('SELECT * FROM feature LIMIT 1')
  })
})
