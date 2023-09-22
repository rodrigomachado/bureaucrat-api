import { DataDomain } from '.'

describe('dataDomain.entityTypes', () => {
  test('list entity types', async () => {
    // TODO Decouple data domain DB loading and population from DataDomain (should be injected)
    // TODO Decouple meta DB loading from DataDomain (should be injected)
    process.env.CREATE_EXAMPLE_DATA_DOMAIN = 'TRUE'

    const dd = new DataDomain()
    const ets = await dd.entityTypes()
    expect(ets).toHaveLength(2)

    expect(ets[0].code).toBe('user')
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

    expect(ets[1].code).toBe('feature')
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
  })
})

test.todo('DataDomain.read')

test.todo('DataDomain.update')
