/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

import { FieldMeta, FieldType } from './dataDomain'
import { DataSource } from './dataSourceSQL'
import { trimMargin } from '../jsext/strings'

describe('Read SQL', () => {
  test('Read all SQL render', async () => {
    const all = jest.fn((sql: string) => Promise.resolve())
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

describe('Update SQL', () => {
  const testUpdateSuccessful = (
    fields: { [name: string]: Partial<FieldMeta> },
    data: any, expectedSQL: string, expectedParams: any[],
  ) => async () => {
    const run = jest.fn((sql: string, data: any[]) => Promise.resolve({ changes: 1 }))
    const et = { code: 'user', fields } as any
    await DataSource.update({ run } as any, et).data(data).execute()
    expect(run.mock.calls).toHaveLength(1)
    expect(run.mock.calls[0]).toEqual([expectedSQL, expectedParams])
  }

  const testUpdatedFailure = (
    fields: { [name: string]: Partial<FieldMeta> },
    data: any, expectedErrorMessage: string, dbResults = { changes: 1 },
  ) => async () => {
    const run = jest.fn((sql: string, data: any[]) => Promise.resolve(dbResults))
    const et = { code: 'user', fields } as any
    try {
      await DataSource.update({ run } as any, et).data(data).execute()
      fail('Expected an error to be thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(Error)
      expect((e as Error).message).toBe(expectedErrorMessage)
    }
  }

  test('Update simple entity', testUpdateSuccessful(
    {
      id: { id: 0, name: 'id', code: 'id', identifier: true, type: FieldType.NUMBER },
      name: { id: 1, name: 'name', code: 'name', identifier: false, type: FieldType.STRING },
    },
    { id: 1, name: 'Rick' },
    trimMargin`
        |UPDATE user
        |SET name = ?
        |WHERE id = ?
      `,
    ['Rick', 1],
  ))

  test('Update entity with multiple IDs', testUpdateSuccessful(
    {
      id1: { id: 0, name: 'id1', code: 'id1', identifier: true, type: FieldType.NUMBER },
      id2: { id: 0, name: 'id2', code: 'id2', identifier: true, type: FieldType.NUMBER },
      name: { id: 1, name: 'name', code: 'name', identifier: false, type: FieldType.STRING },
    },
    { id1: 1, id2: 2, name: 'Rick' },
    trimMargin`
        |UPDATE user
        |SET name = ?
        |WHERE id1 = ? AND id2 = ?
      `,
    ['Rick', 1, 2],
  ))

  test('Update entity with multiple fields', testUpdateSuccessful(
    {
      id: { id: 0, name: 'id', code: 'id', identifier: true, type: FieldType.NUMBER },
      first_name: { id: 1, name: 'first_name', code: 'first_name', identifier: false, type: FieldType.STRING },
      last_name: { id: 2, name: 'last_name', code: 'last_name', identifier: false, type: FieldType.STRING },
    },
    { id: 1, first_name: 'Rick', last_name: 'Smith' },
    trimMargin`
        |UPDATE user
        |SET first_name = ?, last_name = ?
        |WHERE id = ?
      `,
    ['Rick', 'Smith', 1],
  ))

  test('Update entity with missing id field', testUpdatedFailure(
    {
      id: { id: 0, name: 'id', code: 'id', identifier: true, type: FieldType.NUMBER },
      first_name: { id: 1, name: 'first_name', code: 'first_name', identifier: false, type: FieldType.STRING },
      last_name: { id: 2, name: 'last_name', code: 'last_name', identifier: false, type: FieldType.STRING },
    },
    { /* id: 1, */ first_name: 'Rick', last_name: 'Smith' },
    'The data provided does not define the identifier \'id\'',
  ))


  test('Update entity with missing data fields', testUpdateSuccessful(
    // Fields without value (undefined) should not be ignored (not update)
    // Fields set to null should update
    {
      id: { id: 0, name: 'id', code: 'id', identifier: true, type: FieldType.NUMBER },
      first_name: { id: 1, name: 'first_name', code: 'first_name', identifier: false, type: FieldType.STRING },
      last_name: { id: 2, name: 'last_name', code: 'last_name', identifier: false, type: FieldType.STRING },
    },
    { id: 1, /* first_name: 'Rick', */ last_name: null },
    trimMargin`
      |UPDATE user
      |SET last_name = ?
      |WHERE id = ?
    `,
    [null, 1]
  ))

  test('Update entity panics if it updated multiple rows', testUpdatedFailure(
    {
      id: { id: 0, name: 'id', code: 'id', identifier: true, type: FieldType.NUMBER },
      first_name: { id: 1, name: 'first_name', code: 'first_name', identifier: false, type: FieldType.STRING },
      last_name: { id: 2, name: 'last_name', code: 'last_name', identifier: false, type: FieldType.STRING },
    },
    { id: 1, first_name: 'Rick', last_name: 'Smith' },
    'Data update expected to change a single value but it changed 2', { changes: 2 }
  ))
})

