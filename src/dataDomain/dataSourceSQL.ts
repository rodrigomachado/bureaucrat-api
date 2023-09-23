import { EntityMeta } from './dataDomain'
import { Database } from '../db/sqlite3.promises'
import { pluralize as p } from '../jsext/strings'

export const DataSource = {
  read: (db: Database, entityType: EntityMeta) => new ReadBuilder(db, entityType),
  update: (db: Database, entityType: EntityMeta) => new UpdateBuilder(db, entityType),
}

class ReadBuilder {
  private db: Database
  private et: EntityMeta
  private _ids?: any[]
  private _limit?: number

  constructor(db: Database, entityType: EntityMeta) {
    this.db = db
    this.et = entityType
  }

  ids(ids: any[]): this {
    this._ids = ids
    return this
  }

  limit(limit: number): this {
    this._limit = limit
    return this
  }

  async all(): Promise<any[]> {
    // TODO Validate schema of returned data?
    // TODO Use specific projection to fetch entities?
    // TODO Hide table name from UI? (dedicated EntityType#table field?)

    const params: any[] = []
    let sql = `SELECT * FROM ${this.et.code}`
    if (this._ids) {
      const ids = Object.values(this.et.fields).filter(f => f.identifier)
      const idsL = ids.length
      const idDataL = this._ids.length
      if (idsL !== idDataL) {
        throw new Error(
          `Invalid IDs provided (length: ${idDataL}). ` +
          `Expected ${idsL} ${p(ids, 'id', 'ids')}: ${ids.map(f => `'${f.code}'`).join(', ')}`
        )
      }
      sql += ' WHERE ' + ids.map(f => `${f.code} = ?`).join(' AND ')
      params.push(...this._ids)
    }
    if (this._limit) sql += ` LIMIT ${this._limit}`

    return await this.db.all(sql, params)
  }
}

class UpdateBuilder {
  private db: Database
  private et: EntityMeta
  private _data: any

  constructor(db: Database, entityType: EntityMeta) {
    this.db = db
    this.et = entityType
  }

  data(data: any): this {
    this._data = data
    return this
  }

  async execute(): Promise<void> {
    const ids = Object.values(this.et.fields).filter(ft => ft.identifier).map(ft => ({
      field: ft.code,
      value: this._data[ft.code],
    }))
    ids.forEach(({ field, value }) => {
      if (value !== null && value !== undefined) return
      throw new Error(`The data provided does not define the identifier '${field}'`)
    })
    if (!ids.length) throw new Error('Unable to uniquely identify an entity: it has no identifier fields')

    const fieldsToUpdate = Object
      .values(this.et.fields)
      .filter(ft => !ft.identifier)
      .map(ft => ({
        field: ft.code,
        value: this._data[ft.code],
      }))
      .filter(({ value }) => value !== undefined) // Null values should still be updated

    const setClause = '\nSET ' + fieldsToUpdate.map(({ field }) => `${field} = ?`).join(', ')
    const whereClause = '\nWHERE ' + ids.map(({ field }) => `${field} = ?`).join(' AND ')
    const sql = `UPDATE ${this.et.code}` + setClause + whereClause
    const params = [
      ...fieldsToUpdate.map(({ value }) => value),
      ...ids.map(({ value }) => value),
    ]

    const result = await this.db.run(sql, params)
    if (result.changes !== 1) throw new Error(
      `Data update expected to change a single value but it changed ${result.changes}`
    )
  }
}
