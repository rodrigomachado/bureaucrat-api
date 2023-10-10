import { Database } from './sqlite3.promises'

// TODO WIP Document
// TODO WIP Test

export class SelectBuilder {
  private _select = new StaticSQL('SELECT *')
  private _from: StaticSQL | undefined
  private _limit: StaticSQL | undefined
  private _where = new WhereBuilder({ required: false })

  from(table: string): this {
    if (this._from) throw new Error('`from(…)` called more than once')
    this._from = new StaticSQL(`FROM \`${table}\``)
    return this
  }

  limit(rows: number): this {
    if (this._limit !== undefined) throw new Error(
      '`limit(…)` called more than once',
    )
    this._limit = new StaticSQL('LIMIT ?', [rows])
    return this
  }

  get where() { return this._where }

  render(): PartialSQL {
    if (!this._from) throw new Error('`from(…)` never called')

    return mergeRenderers([
      this._select,
      this._from,
      this._where,
      this._limit || EmptyRenderer,
    ])
  }

  async query(db: Database) {
    const { sql, params } = this.render()
    return db.all(sql, params)
  }
}

export class UpdateBuilder {
  private _update: StaticSQL | undefined
  private _attrib = new AttributionBuilder()
  private _where = new WhereBuilder()

  table(table: string): this {
    if (this._update) throw new Error(
      'Table cannot be defined more than once',
    )
    this._update = new StaticSQL(`UPDATE \`${table}\``)
    return this
  }

  get attrib() {
    return this._attrib
  }

  get where() {
    return this._where
  }

  render(): PartialSQL {
    if (!this._update) throw new Error('`table(…)` was never called.')

    return mergeRenderers([
      this._update,
      this._attrib,
      this._where,
    ])
  }

  async execute(db: Database) {
    const { sql, params } = this.render()
    return db.run(sql, params)
  }
}

const EmptySQL = { sql: '', params: [] }
const EmptyRenderer = {
  render() {
    return EmptySQL
  },
}

class StaticSQL implements PartialRenderer {
  private partialSQL: PartialSQL

  constructor(sql: string, params: any[] = []) {
    this.partialSQL = { sql, params }
  }

  render() {
    return this.partialSQL
  }
}

class AttributionBuilder implements PartialRenderer {
  private fields: string[] = []
  private values: any[] = []

  set(field: string, value: any): this {
    this.fields.push(field)
    this.values.push(value)
    return this
  }

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
class WhereBuilder implements PartialRenderer {
  private _required = false
  private fields: string[] = []
  private values: any[] = []

  constructor({ required } = { required: true }) {
    this._required = required
  }

  equal(field: string, value: any, { acceptNull } = EqualOptionsDefault): this {
    if (!acceptNull && value === null) throw new Error(
      `Field '${field}' cannot be compared to 'null'`
    )
    if (value === undefined) {
      `Field '${field}' cannot be compared to 'undefined'`
    }
    this.fields.push(field)
    this.values.push(value)
    return this
  }

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
