import { DataDomain } from '.'

process.env.CREATE_EXAMPLE_DATA_DOMAIN = 'TRUE'

describe('DataDomain.entityTypes', () => {
  test('list entity types', async () => {
    // TODO Decouple data domain DB loading and population from DataDomain (should be injected)
    // TODO Decouple meta DB loading from DataDomain (should be injected)

    const dd = new DataDomain()
    const ets = await dd.entityTypes()
    expect(ets).toHaveLength(2)

    expect(ets[0].code).toBe('user')
    expect(ets[0].name).toBe('User')
    expect(ets[0].fields).toEqual({
      id: {
        name: 'Id', code: 'id', placeholder: null,
        type: 'number', identifier: true, hidden: true, id: 1
      },
      first_name: {
        name: 'First Name', code: 'first_name', placeholder: 'Douglas',
        type: 'string', identifier: false, hidden: false, id: 3
      },
      middle_name: {
        name: 'Middle Name', code: 'middle_name', placeholder: 'Noël',
        type: 'string', identifier: false, hidden: false, id: 5
      },
      last_name: {
        name: 'Last Name', code: 'last_name', placeholder: 'Adams',
        type: 'string', identifier: false, hidden: false, id: 7
      },
      birth_date: {
        name: 'Birth Date', code: 'birth_date', placeholder: '1767-07-11',
        type: 'string', identifier: false, hidden: false, id: 8
      }
    })
    expect(ets[0].titleFormat).toEqual({
      subtitle: '#{first_name} #{middle_name} #{last_name}',
      title: '#{first_name} #{middle_name}',
    })

    expect(ets[1].code).toBe('feature')
    expect(ets[1].name).toBe('Feature')
    expect(ets[1].fields).toEqual({
      id: {
        name: 'Id', code: 'id', placeholder: null,
        type: 'number', identifier: true, hidden: true, id: 2
      },
      name: {
        name: 'Name', code: 'name', placeholder: 'CreateUser',
        type: 'string', identifier: false, hidden: false, id: 4
      },
      path: {
        name: 'Path', code: 'path', placeholder: 'user',
        type: 'string', identifier: false, hidden: false, id: 6
      }
    })
    expect(ets[1].titleFormat).toEqual({
      subtitle: '#{name} #{path}',
      title: '#{name} #{path}',
    })
  })
})

describe('DataDomain.read', () => {
  test('read all entities', async () => {
    const dd = new DataDomain()
    const et = await dd.entityType('user')
    const es = await dd.read(et.code)
    expect(es).toHaveLength(5)
    expect(es[0]).toEqual({
      id: 1,
      first_name: 'Douglas',
      middle_name: 'Noël',
      last_name: 'Adams',
      birth_date: '1767-07-11'
    })
  })

  test('read ids', async () => {
    const dd = new DataDomain()
    const et = await dd.entityType('user')
    const es = await dd.read(et.code, { ids: [1] })
    expect(es).toEqual([{
      'id': 1,
      'first_name': 'Douglas',
      'middle_name': 'Noël',
      'last_name': 'Adams',
      'birth_date': '1767-07-11',
    }])
  })

  test('read ids: ids length mismatch', async () => {
    try {
      const dd = new DataDomain()
      const et = await dd.entityType('user')
      await dd.read(et.code, { ids: [1, 2] })
      fail('Expected an error to be thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(Error)
      expect((e as Error).message).toBe('Invalid IDs provided (length: 2). Expected 1 id: \'id\'')
    }
  })

  test('read limit', async () => {
    const dd = new DataDomain()
    const et = await dd.entityType('user')
    let es
    es = await dd.read(et.code, { limit: 1 })
    expect(es).toHaveLength(1)
    es = await dd.read(et.code, { limit: 2 })
    expect(es).toHaveLength(2)
  })
})

describe('DataDomain.update', () => {
  test('update one field', async () => {
    const dd = new DataDomain()
    const et = await dd.entityType('user')
    let e
    [e] = await dd.read(et.code, { limit: 1 })
    e = await dd.update(et.code, { id: e.id, first_name: 'Rick' })
    expect(e).toEqual({
      'id': 1,
      'first_name': 'Rick',
      'middle_name': 'Noël',
      'last_name': 'Adams',
      'birth_date': '1767-07-11',
    })
  })
})
