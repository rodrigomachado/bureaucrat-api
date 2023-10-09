import { EntityMeta } from './dataDomain'
import { Database } from '../db/sqlite3.promises'
import { pluralize as p } from '../jsext/strings'

export const DataSource = {
  read: (
    db: Database, entityType: EntityMeta,
  ) => new ReadBuilder(db, entityType),
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

    const params: any[] = []
    let sql = `SELECT * FROM ${this.et.table}`
    if (this._ids) {
      const ids = Object.values(this.et.fields).filter(f => f.identifier)
      const idsL = ids.length
      const idDataL = this._ids.length
      if (idsL !== idDataL) {
        throw new Error(
          `Invalid IDs provided (length: ${idDataL}). ` +
          `Expected ${idsL} ${p(ids, 'id', 'ids')}: ` +
          `${ids.map(f => `'${f.code}'`).join(', ')}`
        )
      }
      sql += ' WHERE ' + ids.map(f => `${f.column} = ?`).join(' AND ')
      params.push(...this._ids)
    }
    if (this._limit) sql += ` LIMIT ${this._limit}`

    const raw = await this.db.all(sql, params)

    const entities: any[] = []
    for (const r of raw) {
      entities.push(Object.values(this.et.fields).reduce((acc, f) => {
        acc[f.code] = r[f.column]
        return acc
      }, {} as any))
    }

    return entities
  }
}
