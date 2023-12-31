import { Database } from './sqlite3.promises'

/**
 * Builder for SELECT queries.
 * 
 * Ex:
 * ```js
 *   const s = new Select().from('table)
 *   s.where.equal('field1', 1)
 *   const { sql, params } = s.render()
 * ```
 */
export class Select {
  private _select = new StaticSQL('SELECT *')
  private _from: StaticSQL | undefined
  private _limit: StaticSQL | undefined
  private _where = new WhereBuilder({ required: false })

  /**
   * Specifies the table to fetch data from. 
   * This field is mandatory before rendering.
   */

  from(table: string): this {
    if (this._from) throw new Error('`from(…)` called more than once')
    this._from = new StaticSQL(`FROM \`${table}\``)
    return this
  }

  /**
   * Limits the number of rows to be returned.
   */
  limit(rows: number): this {
    if (this._limit !== undefined) throw new Error(
      '`limit(…)` called more than once',
    )
    this._limit = new StaticSQL('LIMIT ?', [rows])
    return this
  }

  /**
   * WHERE clause builder.
   */
  get where() { return this._where }

  /**
   * Renders both the sql statement and the params to be used when executing
   * the query.
   */
  render(): PartialSQL {
    if (!this._from) throw new Error('`from(…)` never called')

    return mergeRenderers([
      this._select,
      this._from,
      this._where,
      this._limit || EmptyRenderer,
    ])
  }

  /**
   * Executes the query into the provided database.
   */
  async query(db: Database) {
    const { sql, params } = this.render()
    return db.all(sql, params)
  }
}

/**
 * Builder for INSERT INTO statements.
 * 
 * Ex:
 * ```js
 *   const insert = new Insert().into('table')
 *   insert.set('field1', 'value1').set('field2', 'value2')
 *   const { sql, params } = insert.render()
 * ```
 */
export class Insert {
  private _into: StaticSQL | undefined
  private fields: string[] = []
  private values: any[] = []

  /**
   * Specifies the table where to insert the data into.
   */
  into(table: string): this {
    if (this._into) throw new Error(
      '`into(…)` cannot be called more than once.'
    )
    this._into = new StaticSQL(`INSERT INTO \`${table}\``)
    return this
  }

  /**
   * Defines the value for a particular field in the new row being inserted.
   */
  set(field: string, value: any): this {
    this.fields.push(field)
    this.values.push(value)
    return this
  }

  /**
   * Renders both the sql statement and the params to be used when executing
   * the insert statement.
   */
  render() {
    if (!this._into) throw new Error('`into(…)` was never called.')
    if (!this.fields.length) throw new Error('No field value set.')

    const { sql: insertInto } = this._into.render()
    return {
      sql: insertInto +
        '(\n  ' + this.fields.map(f => `\`${f}\``).join(',') + '\n) ' +
        'VALUES (' + this.fields.map(() => '?').join(',') + ')',
      params: this.values,
    }
  }

  /**
   * Executes the insert statement into the provided database.
   */
  async execute(db: Database) {
    const { sql, params } = this.render()
    return db.run(sql, params)
  }
}

/**
 * Builder for UPDATE statements.
 * 
 * Ex:
 * ```js
 *   const update = new Update().table('table')
 *   update.where.equal('id', 1)
 *   update.attrib.set('field1', 'value')
 *   const { sql, params } = update.render()
 * ```
 */
export class Update {
  private _update: StaticSQL | undefined
  private _attrib = new AttributionBuilder()
  private _where = new WhereBuilder()

  /**
   * The table where the fields to update reside.
   * This field is mandatory before rendering.
   */
  table(table: string): this {
    if (this._update) throw new Error(
      'Table cannot be defined more than once',
    )
    this._update = new StaticSQL(`UPDATE \`${table}\``)
    return this
  }

  /**
   * Attribution builder: SET clause.
   * At least one field must be attributed.
   */
  get attrib() {
    return this._attrib
  }

  /**
   * WHERE builder.
   * At least one restriction must be provided.
   */
  get where() {
    return this._where
  }

  /**
   * Renders both the sql statement and the params to be used when executing
   * the operation.
   */
  render(): PartialSQL {
    if (!this._update) throw new Error('`table(…)` was never called.')

    return mergeRenderers([
      this._update,
      this._attrib,
      this._where,
    ])
  }

  /**
   * Executes the update into the provided database.
   */
  async execute(db: Database) {
    const { sql, params } = this.render()
    return db.run(sql, params)
  }
}

/**
 * Builder for DELETE statements.
 * Ex:
 * ```js
 *    const delete = new Delete().table('table')
 *    delete.where.equal('id',1)
 *    const { sql, params } = delete.execute()
 * ```
 */
export class Delete {
  private _delete: StaticSQL | undefined
  private _where = new WhereBuilder()

  /**
   * The table where the row to be deleted resides.
   * This field is mandatory before rendering.
   */
  table(table: string): this {
    if (this._delete) throw new Error(
      'Table cannot be defined more than once',
    )
    this._delete = new StaticSQL(`DELETE FROM \`${table}\``)
    return this
  }

  /**
   * WHERE builder.
   * At least one restriction must be provided.
   */
  get where() {
    return this._where
  }

  /**
   * Renders both the sql statement and the params to be used when executing
   * the operation.
   */
  render(): PartialSQL {
    if (!this._delete) throw new Error('`table(…)` was never called.')
    return mergeRenderers([this._delete, this._where])
  }

  /**
   * Executs the delete into the provided database.
   */
  async execute(db: Database) {
    const { sql, params } = this.render()
    return db.run(sql, params)
  }
}

const EmptySQL = { sql: '', params: [] }
const EmptyRenderer = { render: () => EmptySQL }

class StaticSQL implements PartialRenderer {
  private partialSQL: PartialSQL

  constructor(sql: string, params: any[] = []) {
    this.partialSQL = { sql, params }
  }

  render() {
    return this.partialSQL
  }
}

/**
 * Attribution builder: SET clause.
 */
class AttributionBuilder implements PartialRenderer {
  private fields: string[] = []
  private values: any[] = []

  /**
   * Attributes one value to a field. May be called multiple times.
   */
  set(field: string, value: any): this {
    this.fields.push(field)
    this.values.push(value)
    return this
  }

  /**
   * Renders the partial SQL.
   */
  render(): PartialSQL {
    if (!this.fields.length) throw new Error(
      'No field attribution specified.',
    )
    const sql = 'SET ' + this.fields.map(f => `\`${f}\` = ?`).join(', ')
    return { sql, params: this.values }
  }
}

const EqualOptionsDefault = {
  acceptNull: false,
}

/**
 * WHERE clause builder.
 */
class WhereBuilder implements PartialRenderer {
  private _required = false
  private fields: string[] = []
  private values: any[] = []

  /**
   * Constructor.
   * @param opts.required Whether at list one restriction must be set.
   * Default: true
   */
  constructor({ required } = { required: true }) {
    this._required = required
  }

  /**
   * Adds one field equality restriction.
   * If called more than once, all restrictions must be met for the WHERE clause
   * to be satisfied (`AND` behavior).
   * @param opts.acceptNull Whether or not `value` may be null. If `null` is 
   *    provided while not `acceptNull`, an exception will be thrown.
   */
  equal(field: string, value: any, { acceptNull } = EqualOptionsDefault): this {
    if (!acceptNull && value === null) throw new Error(
      `Field '${field}' cannot be 'null'`
    )
    if (value === undefined) {
      `Field '${field}' cannot be 'undefined'`
    }
    this.fields.push(field)
    this.values.push(value)
    return this
  }

  /**
   * Renders the partial SQL.
   */
  render(): PartialSQL {
    if (!this.fields.length) {
      if (!this._required) return EmptySQL
      throw new Error('Where clause must have at least one restriction.')
    }
    const sql = 'WHERE ' +
      this.fields.map(f => `\`${f}\` = ?`).join(' AND ')
    return { sql, params: this.values }
  }
}

type PartialSQL = {
  sql: string,
  params: any[],
}

interface PartialRenderer {
  render(): PartialSQL
}

function mergeRenderers(renderers: PartialRenderer[]): PartialSQL {
  const partials = renderers.map(r => r.render())

  return {
    sql: partials.map(p => p.sql).filter(s => !!s.length).join('\n'),
    params: partials.flatMap(p => p.params),
  }
}
