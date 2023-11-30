import { trimMargin } from '../jsext/strings'
import { Delete, Insert, Select, Update } from './sql'

describe('Select SQL', () => {
  test('SELECT all from table', () => {
    const select = new Select().from('table')
    expect(select.render()).toEqual({
      sql: trimMargin`
        |SELECT *
        |FROM \`table\`
      `,
      params: [],
    })
  })

  test('SELECT with simple where', () => {
    const select = new Select().from('user')
    select.where.equal('id', 1)
    expect(select.render()).toEqual({
      sql: trimMargin`
        |SELECT *
        |FROM \`user\`
        |WHERE \`id\` = ?
      `,
      params: [1],
    })
  })

  test('SELECT missing table', () => {
    const select = new Select()
    expect(() => select.render()).toThrow('`from(…)` never called')
  })

  test('SELECT with WHERE accepting nulls', () => {
    const select = new Select().from('features')
    select.where.equal('id1', null, { acceptNull: true })
    expect(select.render()).toEqual({
      sql: trimMargin`
        |SELECT *
        |FROM \`features\`
        |WHERE \`id1\` = ?
      `,
      params: [null],
    })
  })

  test('SELECT with WHERE not accepting nulls', () => {
    const select = new Select().from('users')
    expect(() => {
      select.where.equal('field', null)
    }).toThrow('Field \'field\' cannot be \'null\'')
  })

  test('SELECT with LIMIT', () => {
    const select = new Select().from('table')
    select.limit(10)
    expect(select.render()).toEqual({
      sql: trimMargin`
        |SELECT *
        |FROM \`table\`
        |LIMIT ?
      `,
      params: [10],
    })
  })

  test('Complex SELECT', () => {
    const select = new Select().from('t1')
    select.where.equal('f1', 'a').equal('f2', 'b')
    select.limit(100)
    expect(select.render()).toEqual({
      sql: trimMargin`
        |SELECT *
        |FROM \`t1\`
        |WHERE \`f1\` = ? AND \`f2\` = ?
        |LIMIT ?
      `,
      params: ['a', 'b', 100],
    })
  })
})

describe('Insert SQL', () => {
  test('Simple INSERT', () => {
    const insert = new Insert().into('table')
    insert.set('f1', 1)
    expect(insert.render()).toEqual({
      sql: trimMargin`
        |INSERT INTO \`table\`(
        |  \`f1\`
        |) VALUES (?)
      `,
      params: [1],
    })
  })

  test('INSERT missing table', () => {
    const insert = new Insert()
    insert.set('f1', 1)
    expect(() => insert.render()).toThrow('`into(…)` was never called.')
  })

  test('INSERT missing fields', () => {
    const insert = new Insert().into('table')
    expect(() => insert.render()).toThrow('No field value set.')
  })

  test('INSERT multiple fields', () => {
    const insert = new Insert().into('t1')
    insert.set('f1', 1).set('f2', 2).set('f3', 3)
    expect(insert.render()).toEqual({
      sql: trimMargin`
        |INSERT INTO \`t1\`(
        |  \`f1\`,\`f2\`,\`f3\`
        |) VALUES (?,?,?)
      `,
      params: [1, 2, 3],
    })
  })
})

describe('Update SQL', () => {
  test('Simple UPDATE', () => {
    const update = new Update().table('table')
    update.attrib.set('f1', 1)
    update.where.equal('id1', 2)
    expect(update.render()).toEqual({
      sql: trimMargin`
        |UPDATE \`table\`
        |SET \`f1\` = ?
        |WHERE \`id1\` = ?
      `,
      params: [1, 2],
    })
  })

  test('UPDATE missing WHERE', () => {
    const update = new Update().table('t1')
    update.attrib.set('field', 'value')
    expect(() => update.render()).toThrow(
      'Where clause must have at least one restriction.',
    )
  })

  test('UPDATE missing SET', () => {
    const update = new Update().table('t1')
    update.where.equal('field', 'value')
    expect(() => update.render()).toThrow(
      'No field attribution specified.',
    )
  })

  test('UPDATE multiple WHERE multiple SET', () => {
    const update = new Update().table('t2')
    update.attrib.set('field1', 1).set('field2', 2)
    update.where.equal('id1', 'a').equal('id2', 'b')
    expect(update.render()).toEqual({
      sql: trimMargin`
        |UPDATE \`t2\`
        |SET \`field1\` = ?, \`field2\` = ?
        |WHERE \`id1\` = ? AND \`id2\` = ?
      `,
      params: [1, 2, 'a', 'b'],
    })
  })

  test('UPDATE setting field to null', () => {
    const update = new Update().table('table')
    update.attrib.set('f1', null)
    update.where.equal('id1', 2)
    expect(update.render()).toEqual({
      sql: trimMargin`
        |UPDATE \`table\`
        |SET \`f1\` = ?
        |WHERE \`id1\` = ?
      `,
      params: [null, 2],
    })
  })

  test('UPDATE with WHERE null', () => {
    const update = new Update().table('table')
    update.attrib.set('f1', 1)
    expect(() => {
      update.where.equal('id1', null)
    }).toThrow('Field \'id1\' cannot be \'null\'')
  })
})

describe('Delete SQL', () => {
  test('Simple DELETE', () => {
    const del = new Delete().table('table')
    del.where.equal('f1', 1)
    expect(del.render()).toEqual({
      sql: trimMargin`
        |DELETE FROM \`table\`
        |WHERE \`f1\` = ?
      `,
      params: [1],
    })
  })

  test('DELETE missing WHERE', () => {
    const del = new Delete().table('table')
    expect(() => del.render()).toThrow(
      'Where clause must have at least one restriction.'
    )
  })

  test('DELETE multiple WHERE', () => {
    const del = new Delete().table('t1')
    del.where.equal('f1', 1).equal('f2', 2)
    expect(del.render()).toEqual({
      sql: trimMargin`
        |DELETE FROM \`t1\`
        |WHERE \`f1\` = ? AND \`f2\` = ?
      `,
      params: [1, 2],
    })
  })
})
