import { DataDomain, createMetaDB } from '.'
import { Database } from '../db/sqlite3.promises'
import { populateDB } from '../exampleDataDomain'
import { trimMargin } from '../jsext/strings'

process.env.CREATE_EXAMPLE_DATA_DOMAIN = 'TRUE'

describe('DataDomain.entityTypes', () => {
  test('list entity types', async () => {
    const dd = new DataDomain(await mockMetaDB(), await mockDomainDB())
    const ets = await dd.entityTypes()
    expect(ets).toHaveLength(2)

    expect(ets[0].code).toBe('user')
    expect(ets[0].name).toBe('User')
    expect(ets[0].table).toBe('user')
    expect(ets[0].fields).toEqual({
      id: {
        name: 'Id', code: 'id', column: 'id',
        placeholder: null,
        type: 'number', identifier: true, hidden: true, id: 1,
      },
      first_name: {
        name: 'First Name', code: 'first_name', column: 'first_name',
        placeholder: 'Douglas',
        type: 'string', identifier: false, hidden: false, id: 3,
      },
      middle_name: {
        name: 'Middle Name', code: 'middle_name', column: 'middle_name',
        placeholder: 'Noël',
        type: 'string', identifier: false, hidden: false, id: 5,
      },
      last_name: {
        name: 'Last Name', code: 'last_name', column: 'last_name',
        placeholder: 'Adams',
        type: 'string', identifier: false, hidden: false, id: 7,
      },
      birth_date: {
        name: 'Birth Date', code: 'birth_date', column: 'birth_date',
        placeholder: '1767-07-11',
        type: 'string', identifier: false, hidden: false, id: 8,
      },
    })
    expect(ets[0].titleFormat).toEqual({
      subtitle: '#{first_name} #{middle_name} #{last_name}',
      title: '#{first_name} #{middle_name}',
    })

    expect(ets[1].code).toBe('feature')
    expect(ets[1].name).toBe('Feature')
    expect(ets[1].table).toBe('feature')
    expect(ets[1].fields).toEqual({
      id: {
        name: 'Id', code: 'id', column: 'id', placeholder: null,
        type: 'number', identifier: true, hidden: true, id: 2,
      },
      name: {
        name: 'Name', code: 'name', column: 'name', placeholder: 'CreateUser',
        type: 'string', identifier: false, hidden: false, id: 4,
      },
      path: {
        name: 'Path', code: 'path', column: 'path', placeholder: 'user',
        type: 'string', identifier: false, hidden: false, id: 6,
      },
    })
    expect(ets[1].titleFormat).toEqual({
      subtitle: '#{name} #{path}',
      title: '#{name} #{path}',
    })
  })
})

describe('DataDomain.read', () => {
  test('read all entities', async () => {
    const dd = new DataDomain(await mockMetaDB(), await mockDomainDB())
    const et = await dd.entityType('user')
    const es = await dd.read(et.code)
    expect(es).toHaveLength(5)
    expect(es[0]).toEqual({
      id: 1,
      first_name: 'Douglas',
      middle_name: 'Noël',
      last_name: 'Adams',
      birth_date: '1767-07-11',
    })
  })

  test('read ids', async () => {
    const dd = new DataDomain(await mockMetaDB(), await mockDomainDB())
    const et = await dd.entityType('user')
    const es = await dd.read(et.code, { ids: { id: 1 } })
    expect(es).toEqual([{
      'id': 1,
      'first_name': 'Douglas',
      'middle_name': 'Noël',
      'last_name': 'Adams',
      'birth_date': '1767-07-11',
    }])
  })

  test('read ids: id not found', async () => {
    try {
      const dd = new DataDomain(await mockMetaDB(), await mockDomainDB())
      const et = await dd.entityType('user')
      await dd.read(et.code, { ids: { id1: 1, id2: 2 } })
      fail('Expected an error to be thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(Error)
      expect((e as Error).message).toBe(
        'Field \'id\' expected but not found in the \'ids\' provided.',
      )
    }
  })

  test('read limit', async () => {
    const dd = new DataDomain(await mockMetaDB(), await mockDomainDB())
    const et = await dd.entityType('user')
    let es
    es = await dd.read(et.code, { limit: 1 })
    expect(es).toHaveLength(1)
    es = await dd.read(et.code, { limit: 2 })
    expect(es).toHaveLength(2)
  })

  test('read when entity and field codes are overriden', async () => {
    const [metaDB, domainDB] = await mockAllDBs()
    const dd = new DataDomain(metaDB, domainDB)
    await overrideMeta(dd, metaDB, USER_CODES_TO_PORTUGUESE)
    const es = await dd.read('usuário')
    expect(es).toHaveLength(5)
    expect(es[0]).toEqual({
      'data_de_nascimento': '1767-07-11',
      'identificador': 1,
      'nome_do_meio': 'Noël',
      'primeiro_nome': 'Douglas',
      'último_nome': 'Adams',
    })
  })
})

describe('DataDomain.update', () => {
  test('update one field', async () => {
    const dd = new DataDomain(await mockMetaDB(), await mockDomainDB())
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

  test('update when entity and field codes are overriden', async () => {
    const [metaDB, domainDB] = await mockAllDBs()
    const dd = new DataDomain(metaDB, domainDB)
    await overrideMeta(dd, metaDB, USER_CODES_TO_PORTUGUESE)
    let e
    [e] = await dd.read('usuário', { limit: 1 })
    e = await dd.update(
      'usuário', { identificador: e.identificador, primeiro_nome: 'Rick' },
    )
    expect(e).toEqual({
      'identificador': 1,
      'primeiro_nome': 'Rick',
      'nome_do_meio': 'Noël',
      'último_nome': 'Adams',
      'data_de_nascimento': '1767-07-11',
    })
  })

})

async function mockAllDBs(): Promise<[Database, Database]> {
  return Promise.all([mockMetaDB(), mockDomainDB()])
}

async function mockMetaDB(): Promise<Database> {
  const db = await Database.connect(':memory:')
  await createMetaDB(db)
  return db
}

async function mockDomainDB(): Promise<Database> {
  const db = await Database.connect(':memory:')
  await populateDB(db)
  return db
}

type EntityMetaOverride = {
  table: string,
  code: string,
  fields: {
    column: string,
    code: string,
  }[],
}
async function overrideMeta(
  dd: DataDomain, metaDB: Database, ...overrides: EntityMetaOverride[]
): Promise<void> {
  // Force introspection
  await dd.entityTypes()

  for (const o of overrides) {
    // Lookup entity type
    const types = await metaDB.all(
      'SELECT id FROM entityType WHERE `table` = ?',
      [o.table],
    )
    if (types.length !== 1) throw new Error(
      `Expected a single entity type for table ${o.table} ` +
      `but got ${types.length}: (ids: ${types.join(',')})`
    )
    const [{ id: entityTypeId }] = types

    // Override entity code
    await metaDB.run(trimMargin`
      |UPDATE entityType
      |SET code=?
      |WHERE id=?
    `, [o.code, entityTypeId])

    // Override field codes
    for (const f of o.fields) {
      const { changes } = await metaDB.run(trimMargin`
        |UPDATE fieldType
        |SET code=?
        |WHERE entityTypeId = ? AND column = ?
      `, [f.code, entityTypeId, f.column])
      if (changes !== 1) throw new Error(
        `Expected a single field for table '${o.table}' column '${f.column}' ` +
        `but found ${changes}`
      )
    }

    // Force entity cache invalidation
    (dd as any)._entityTypes = undefined
  }
}

const USER_CODES_TO_PORTUGUESE = {
  table: 'user',
  code: 'usuário',
  fields: [
    { column: 'id', code: 'identificador' },
    { column: 'first_name', code: 'primeiro_nome' },
    { column: 'middle_name', code: 'nome_do_meio' },
    { column: 'last_name', code: 'último_nome' },
    { column: 'birth_date', code: 'data_de_nascimento' },
  ],
}
